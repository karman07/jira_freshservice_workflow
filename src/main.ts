import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Enable global DTO validation (class-validator) ──────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // Strip unknown properties from incoming DTOs
      forbidNonWhitelisted: false,
      transform: true,        // Auto-transform payloads to DTO class instances
    }),
  );

  // ── Global prefix: all routes will be /api/... ──────────────────
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Jira-Freshservice Sync Server running on port ${port}`);
}
bootstrap();
