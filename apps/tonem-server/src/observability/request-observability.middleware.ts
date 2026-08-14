import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

const KNOWN_ROUTES = new Set([
  '/latest',
  '/at',
  '/range',
  '/live',
  '/ready',
  '/health',
  '/metrics',
  '/client-telemetry',
]);

export function metricRoute(path: string): string {
  return KNOWN_ROUTES.has(path) ? path : 'other';
}

@Injectable()
export class RequestObservabilityMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestObservabilityMiddleware.name);

  constructor(private readonly metrics: MetricsService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = randomUUID();
    const startedAt = process.hrtime.bigint();
    response.setHeader('x-request-id', requestId);

    response.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const route = metricRoute(request.path);
      this.metrics.recordHttp(request.method, route, response.statusCode, durationMs / 1000);
      this.logger.log({
        event: 'http_request',
        requestId,
        method: request.method,
        path: route,
        statusCode: response.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    });

    next();
  }
}
