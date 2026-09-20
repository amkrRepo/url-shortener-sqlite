import { Injectable, NotFoundException } from "@nestjs/common";
import { Url } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUrlDto } from "./dto/urls.dto";
import { generateShortCode } from "../common/short-code.utils";
import { error } from "console";

const MAX_GENERATION_ATTEMPTS = 5;

@Injectable()
export class UrlsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new shortened URL record.
   *
   * Generates a random alphanumeric short_code and retries a handful of
   * times on the rare chance of a collision with an existing code, since
   * short_code is a unique column. This is a real error path (a DB
   * constraint violation) so we don't relabel it as a 400 here — a
   * collision is our own generation problem to retry, not bad user input.
   */
  async createShortUrl(dto: CreateUrlDto): Promise<Url> {
    // 1. Deduplication check: has this exact URL already been shortened?
    const existing = await this.prisma.url.findUnique({
      where: { original_url: dto.original_url },
    });
    if (existing) {
      return existing;
    }

    // 2. Not found — attempt to create it, retrying on short_code
    // collisions and recovering on an original_url race.
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const short_code = generateShortCode();
      try {
        return await this.prisma.url.create({
          data: {
            original_url: dto.original_url,
            short_code,
          },
        });
        // } catch (error) {
        //   lastError = error;
        //   if (!this.isUniqueConstraintViolation(error)) {
        //     // Not a collision — a real DB error. Let it bubble up as a 500.
        //     throw error;
        //   }
        //   // Collision on short_code: loop and try a fresh code.
        // }
      } catch (error) {
        if (!this.isUniqueConstraintViolation(error)) {
          // Not a collision — a real DB error. Let it bubble up as a 500.
          throw error;
        }

        // A unique constraint failed. Find out which one by asking the
        // database directly, rather than guessing it was short_code:
        // did original_url just get taken by a concurrent request?
        const winner = await this.prisma.url.findUnique({
          where: { original_url: dto.original_url },
        });
        if (winner) {
          // Yes — another request won the race for this exact URL.
          // Return its row instead of endlessly retrying a doomed insert.
          return winner;
        }

        // original_url still isn't taken, so this collision really was
        // on short_code. Loop and try a fresh one.
        lastError = error;
      }
    }

    throw lastError;
  }

  /**
   * Looks up a URL by its short_code. Throws NotFoundException (404)
   * when no matching record exists; any other Prisma/DB error is left
   * to bubble up untouched so it surfaces as a 500.
   */
  async findByShortCode(short_code: string): Promise<Url> {
    const url = await this.prisma.url.findUnique({ where: { short_code } });

    if (!url) {
      throw new NotFoundException(
        `No URL found for short_code "${short_code}"`,
      );
    }

    return url;
  }

  async deleteByShortCode(short_code: string): Promise<void> {
    try {
      await this.prisma.url.delete({ where: { short_code } });
    } catch (error) {
      if (this.isRecordNotFoundError(error)) {
        throw new NotFoundException(
          `No URL found for short_code "${short_code}"`,
        );
      }
      throw error;
    }
  }

  // private generateShortCode(): string {
  //   const bytes = randomBytes(SHORT_CODE_LENGTH);
  //   let code = "";
  //   for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
  //     code += SHORT_CODE_ALPHABET[bytes[i] % SHORT_CODE_ALPHABET.length];
  //   }
  //   return code;
  // }

  private isUniqueConstraintViolation(error: unknown): boolean {
    // Prisma throws PrismaClientKnownRequestError with code 'P2002'
    // for unique constraint violations. Checked structurally here to
    // avoid importing Prisma's runtime error classes directly.
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    );
  }

  private isRecordNotFoundError(error: unknown): boolean {
    // Prisma throws PrismaClientKnownRequestError with code 'P2025'
    // when delete()/update() targets a record that doesn't exist.
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2025"
    );
  }
}
