import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global ValidationPipe so class-validator decorators on DTOs
  // (e.g. @IsUrl() in CreateUrlDto) are enforced on every request.
  // whitelist strips unknown properties; forbidNonWhitelisted rejects
  // requests that include them, and transform lets validated payloads
  // be turned into DTO class instances.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
