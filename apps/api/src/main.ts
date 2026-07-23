import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module';

function loadEnvFileFromCandidates() {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'apps/api/.env'),
    resolve(__dirname, '../.env'),
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
      const separatorIndex = normalized.indexOf('=');
      if (separatorIndex <= 0) continue;
      const key = normalized.slice(0, separatorIndex).trim();
      let value = normalized.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
    break;
  }
}

async function bootstrap() {
  loadEnvFileFromCandidates();
  // Explicitly provide Express adapter to avoid driver auto-detection issues.
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(),
  );
  const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (configuredOrigins.includes(origin)) {
        return callback(null, true);
      }
      const allowedPatterns = [
        /^http:\/\/localhost:\d+$/,
        /^http:\/\/127\.0\.0\.1:\d+$/,
        /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
        /^http:\/\/10\.\d+\.\d+\.\d+:\d+$/,
        /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+:\d+$/,
        /^https:\/\/.*\.vercel\.app$/,
      ];
      const isAllowed = allowedPatterns.some((pattern) => pattern.test(origin));
      return callback(isAllowed ? null : new Error('CORS blocked'), isAllowed);
    },
    credentials: true,
  });
  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ extended: true, limit: '25mb' }));
  const localAuthBypass =
    process.env.NODE_ENV !== 'production'
    && process.env.AUTH_BYPASS_LOCAL?.trim().toLowerCase() === 'true';
  const host = process.env.HOST?.trim() || (localAuthBypass ? '127.0.0.1' : '0.0.0.0');
  await app.listen(process.env.PORT ?? 3000, host);
}
bootstrap();
