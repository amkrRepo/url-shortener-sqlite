import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  Body,
} from '@nestjs/common';
import { Response } from 'express';
import { UrlsService } from './urls.service';
import { CreateUrlDto } from './dto/urls.dto';

@Controller('urls')
export class UrlsController {
  constructor(private readonly urlsService: UrlsService) {}

  @Post('shorten')
  @HttpCode(HttpStatus.CREATED)
  async shorten(@Body() dto: CreateUrlDto) {
    // dto has already been validated by the global ValidationPipe
    // (whitelist + @IsUrl on original_url), so invalid/missing
    // original_url never reaches this point — it's rejected as a 400
    // before the controller method runs.
    return this.urlsService.createShortUrl(dto);
  }

  @Get('redirect')
  async redirect(
    @Query('short_code') short_code: string,
    @Res() res: Response,
  ) {
    if (!short_code) {
      throw new BadRequestException('short_code query parameter is required');
    }

    // findByShortCode throws NotFoundException (404) itself when the
    // code doesn't exist, so that error path is handled by Nest's
    // built-in exception filter, not manually caught/relabeled here.
    const url = await this.urlsService.findByShortCode(short_code);

    // NOTE: we deliberately use @Res() in non-passthrough mode (the
    // default) rather than @Res({ passthrough: true }). Passthrough
    // mode hands control back to Nest's response pipeline afterward,
    // which prevents us from directly driving the redirect status
    // code and Location header via res.redirect(). Using the raw
    // Express Response object here gives us a genuine 302 with a
    // Location header that Supertest can assert on directly.
    res.redirect(HttpStatus.FOUND, url.original_url);
  }
}
