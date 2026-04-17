import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';

import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Enable robust body parsing for Form Data AND JSON ───────────
  // We use `verify` to save the raw buffer so our controller can rescue completely broken payloads
  const rawBodyBuffer = (req: any, res: any, buffer: Buffer, encoding: string) => {
    if (buffer && buffer.length) {
      req.rawBody = buffer.toString('utf8');
    }
  };

  app.use(express.json({ limit: '50mb', verify: rawBodyBuffer }));
  app.use(express.urlencoded({ extended: true, limit: '50mb', verify: rawBodyBuffer }));

  // ── Enable global DTO validation (class-validator) ──────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // Strip unknown properties from incoming DTOs
      forbidNonWhitelisted: false,
      transform: true,        // Auto-transform payloads to DTO class instances
    }),
  );

  // ── Enable global exception logging for 400s ────────────────────
  app.useGlobalFilters(new AllExceptionsFilter());

  // ── Global prefix: all routes will be /api/... ──────────────────
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Jira-Freshservice Sync Server running on port ${port}`);
}
bootstrap();
