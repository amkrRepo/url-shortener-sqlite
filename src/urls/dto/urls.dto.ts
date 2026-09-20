import { IsNotEmpty, IsUrl } from 'class-validator';

/**
 * DTO for POST /urls/shorten.
 *
 * Must be a class (not a plain interface/type) so that class-validator's
 * decorator metadata is available at runtime for the global ValidationPipe
 * to inspect.
 */
export class CreateUrlDto {
  @IsNotEmpty({ message: 'original_url should not be empty' })
  @IsUrl({}, { message: 'original_url must be a valid URL' })
  original_url!: string;
}
