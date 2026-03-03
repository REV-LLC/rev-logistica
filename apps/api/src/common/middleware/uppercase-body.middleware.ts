import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uppercaseDeep(value: unknown): unknown {
  if (typeof value === 'string') {
    // Keep data URLs intact; uppercasing breaks base64 payloads (e.g. signatures).
    if (/^data:[^;]+;base64,/i.test(value)) {
      return value;
    }
    // Keep UUID-like identifiers intact; uppercasing breaks lookups on text ids.
    if (UUID_REGEX.test(value)) {
      return value;
    }
    return value.toUpperCase();
  }

  if (Array.isArray(value)) {
    return value.map((item) => uppercaseDeep(item));
  }

  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    Object.keys(input).forEach((key) => {
      output[key] = uppercaseDeep(input[key]);
    });
    return output;
  }

  return value;
}

@Injectable()
export class UppercaseBodyMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    if (req.body && typeof req.body === 'object') {
      req.body = uppercaseDeep(req.body) as Request['body'];
    }
    next();
  }
}
