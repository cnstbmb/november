import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

const PRODUCT_EVENT_FIELDS = {
  instrument_select: ['instrument_id'],
  favorite_toggle: ['instrument_id', 'enabled'],
  hero_pin: ['instrument_id'],
  time_machine_use: [],
  zen_toggle: ['enabled'],
  music_toggle: ['enabled'],
  pwa_install: [],
  offline_enter: [],
} as const;

type ProductEventName = keyof typeof PRODUCT_EVENT_FIELDS;
type AnalyticsValue = string | boolean;
type AnalyticsData = Readonly<Record<string, AnalyticsValue>>;

interface AnalyticsPayload {
  readonly website: string;
  readonly hostname?: string;
  readonly language?: string;
  readonly referrer?: string;
  readonly screen?: string;
  readonly title?: string;
  readonly url?: string;
  readonly name?: ProductEventName;
  readonly data?: AnalyticsData;
}

interface AnalyticsRequest {
  readonly type: 'event';
  readonly payload: AnalyticsPayload;
}

const MAX_BATCH_SIZE = 50;
const MAX_STRING_LENGTH = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYLOAD_FIELDS = [
  'website',
  'hostname',
  'language',
  'referrer',
  'screen',
  'title',
  'url',
  'name',
  'data',
] as const;

@Controller('analytics-ingest')
export class AnalyticsIngestController {
  @Post('send')
  @HttpCode(200)
  async send(
    @Body() body: unknown,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-umami-cache') cache: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    await forwardToUmami('/api/send', parseAnalyticsRequest(body), userAgent, cache, response);
  }

  @Post('batch')
  @HttpCode(200)
  async batch(
    @Body() body: unknown,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-umami-cache') cache: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    await forwardToUmami('/api/batch', parseAnalyticsBatch(body), userAgent, cache, response);
  }
}

export function parseAnalyticsRequest(body: unknown): AnalyticsRequest {
  if (!isRecord(body) || !hasExactKeys(body, ['type', 'payload']) || body['type'] !== 'event') {
    throw invalidAnalyticsPayload();
  }
  const payload = body['payload'];
  if (!isRecord(payload) || !hasOnlyKeys(payload, PAYLOAD_FIELDS)) throw invalidAnalyticsPayload();

  const website = payload['website'];
  if (typeof website !== 'string' || !UUID_PATTERN.test(website)) throw invalidAnalyticsPayload();

  const sanitized: Record<string, unknown> = { website };
  copyBoundedString(payload, sanitized, 'hostname');
  copyBoundedString(payload, sanitized, 'language');
  copyBoundedString(payload, sanitized, 'screen');
  copyBoundedString(payload, sanitized, 'title');
  copySafeUrl(payload, sanitized, 'url');
  copySafeUrl(payload, sanitized, 'referrer');

  const name = payload['name'];
  const data = payload['data'];
  if (name === undefined) {
    if (data !== undefined) throw invalidAnalyticsPayload();
  } else {
    if (typeof name !== 'string' || !isProductEventName(name)) throw invalidAnalyticsPayload();
    sanitized['name'] = name;
    const parsedData = parseProductEventData(name, data);
    if (Object.keys(parsedData).length > 0) sanitized['data'] = parsedData;
  }

  return { type: 'event', payload: sanitized as unknown as AnalyticsPayload };
}

export function parseAnalyticsBatch(body: unknown): readonly AnalyticsRequest[] {
  if (!Array.isArray(body) || body.length < 1 || body.length > MAX_BATCH_SIZE) {
    throw invalidAnalyticsPayload();
  }
  return body.map(parseAnalyticsRequest);
}

function parseProductEventData(name: ProductEventName, candidate: unknown): AnalyticsData {
  const allowedFields = PRODUCT_EVENT_FIELDS[name];
  if (candidate === undefined) {
    if (allowedFields.length > 0) throw invalidAnalyticsPayload();
    return {};
  }
  if (!isRecord(candidate) || !hasOnlyKeys(candidate, allowedFields)) throw invalidAnalyticsPayload();

  const result: Record<string, AnalyticsValue> = {};
  for (const field of allowedFields) {
    const value = candidate[field];
    if (field === 'instrument_id') {
      if (typeof value !== 'string' || !/^[a-z0-9_]{1,40}$/.test(value)) {
        throw invalidAnalyticsPayload();
      }
      result[field] = value;
    } else {
      if (typeof value !== 'boolean') throw invalidAnalyticsPayload();
      result[field] = value;
    }
  }
  return result;
}

async function forwardToUmami(
  path: '/api/send' | '/api/batch',
  body: AnalyticsRequest | readonly AnalyticsRequest[],
  userAgent: string | undefined,
  cache: string | undefined,
  response: Response,
): Promise<void> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (userAgent) headers['user-agent'] = userAgent.slice(0, 512);
  if (cache) headers['x-umami-cache'] = cache.slice(0, 4096);

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(`http://tonem-umami:3000${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(2_500),
    });
  } catch {
    throw new BadGatewayException('Analytics service unavailable');
  }

  const responseBody = await upstream.text();
  response.status(upstream.status);
  response.type(upstream.headers.get('content-type') ?? 'application/json');
  response.send(responseBody);
}

function copyBoundedString(
  source: Readonly<Record<string, unknown>>,
  target: Record<string, unknown>,
  field: string,
): void {
  const value = source[field];
  if (value === undefined) return;
  if (typeof value !== 'string' || value.length > MAX_STRING_LENGTH) throw invalidAnalyticsPayload();
  target[field] = value;
}

function copySafeUrl(
  source: Readonly<Record<string, unknown>>,
  target: Record<string, unknown>,
  field: 'url' | 'referrer',
): void {
  const value = source[field];
  if (value === undefined) return;
  if (typeof value !== 'string' || value.length > 2_000) throw invalidAnalyticsPayload();
  target[field] = withoutUrlDetails(value);
}

function withoutUrlDetails(value: string): string {
  try {
    const parsed = new URL(value, 'https://tonem.ru');
    return /^https?:\/\//i.test(value) ? `${parsed.origin}${parsed.pathname}` : parsed.pathname;
  } catch {
    throw invalidAnalyticsPayload();
  }
}

function isProductEventName(value: string): value is ProductEventName {
  return Object.prototype.hasOwnProperty.call(PRODUCT_EVENT_FIELDS, value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Readonly<Record<string, unknown>>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function hasExactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length && hasOnlyKeys(value, expected);
}

function invalidAnalyticsPayload(): BadRequestException {
  return new BadRequestException('Invalid analytics payload');
}
