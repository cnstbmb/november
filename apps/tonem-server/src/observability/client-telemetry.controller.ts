import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MetricsService } from './metrics.service';

const SOURCES = new Set(['angular', 'window', 'promise', 'resource', 'service_worker', 'network']);
const ERROR_TYPES = new Set([
  'unhandled_error',
  'unhandled_rejection',
  'resource_load',
  'service_worker_error',
  'request_failure',
]);
const DEVICE_TYPES = new Set(['desktop', 'tablet', 'mobile', 'unknown']);
const MAX_BATCH_SIZE = 20;
const MAX_VERSION_LENGTH = 40;
const RATE_WINDOW_MS = 60_000;
const MAX_BATCHES_PER_WINDOW = 120;

interface ClientTelemetryEvent {
  readonly source: string;
  readonly error_type: string;
  readonly frontend_version: string;
  readonly device_type: string;
}

@Controller('client-telemetry')
export class ClientTelemetryController {
  private windowStartedAt = Date.now();
  private batchesInWindow = 0;

  constructor(private readonly metrics: MetricsService) {}

  @Post()
  @HttpCode(202)
  collect(@Body() body: unknown): { accepted: number } {
    if (!this.acceptBatch()) throw new ServiceUnavailableException();
    const events = parseTelemetryBatch(body);
    for (const event of events) {
      this.metrics.recordFrontendError(
        event.source,
        event.error_type,
        event.frontend_version,
        event.device_type,
      );
    }
    return { accepted: events.length };
  }

  private acceptBatch(now = Date.now()): boolean {
    if (now - this.windowStartedAt >= RATE_WINDOW_MS) {
      this.windowStartedAt = now;
      this.batchesInWindow = 0;
    }
    this.batchesInWindow += 1;
    return this.batchesInWindow <= MAX_BATCHES_PER_WINDOW;
  }
}

export function parseTelemetryBatch(body: unknown): readonly ClientTelemetryEvent[] {
  if (!isRecord(body) || !hasOnlyKeys(body, ['events']) || !Array.isArray(body['events'])) {
    throw new BadRequestException('Invalid telemetry batch');
  }
  if (body['events'].length < 1 || body['events'].length > MAX_BATCH_SIZE) {
    throw new BadRequestException('Invalid telemetry batch size');
  }
  return body['events'].map((candidate) => {
    if (!isRecord(candidate) || !hasOnlyKeys(candidate, [
      'source',
      'error_type',
      'frontend_version',
      'device_type',
    ])) throw new BadRequestException('Invalid telemetry event');
    const source = candidate['source'];
    const errorType = candidate['error_type'];
    const frontendVersion = candidate['frontend_version'];
    const deviceType = candidate['device_type'];
    if (
      typeof source !== 'string' || !SOURCES.has(source) ||
      typeof errorType !== 'string' || !ERROR_TYPES.has(errorType) ||
      typeof frontendVersion !== 'string' || frontendVersion.length < 1 ||
      frontendVersion.length > MAX_VERSION_LENGTH ||
      typeof deviceType !== 'string' || !DEVICE_TYPES.has(deviceType)
    ) throw new BadRequestException('Invalid telemetry event');
    return { source, error_type: errorType, frontend_version: frontendVersion, device_type: deviceType };
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Readonly<Record<string, unknown>>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}
