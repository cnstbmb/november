import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { isKnownInstrument, LIVE_INSTRUMENTS } from './instruments';
import { TickRow, TickStore } from './tick-store';

function serializeTick(t: TickRow): {
  instrument: string;
  ts: string;
  value: number;
  meta: unknown;
} {
  return { instrument: t.instrument, ts: t.ts.toISOString(), value: t.value, meta: t.meta };
}

function parseIso(value: string | undefined, name: string): Date {
  if (!value) throw new BadRequestException(`missing required query param: ${name}`);
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new BadRequestException(`invalid ISO timestamp for ${name}: ${value}`);
  }
  return new Date(ms);
}

@Controller()
export class QuotesController {
  constructor(private readonly store: TickStore) {}

  /** GET /latest -> most recent tick per instrument. */
  @Get('latest')
  async latest(): Promise<Record<string, { ts: string; value: number; meta: unknown }>> {
    const rows = await this.store.latest();
    const out: Record<string, { ts: string; value: number; meta: unknown }> = {};
    for (const r of rows) {
      out[r.instrument] = { ts: r.ts.toISOString(), value: r.value, meta: r.meta };
    }
    return out;
  }

  /**
   * GET /at?ts=<iso> -> for each instrument, the nearest tick with ts <= given ts.
   * If `instrument` is supplied, only that instrument is returned.
   */
  @Get('at')
  async at(
    @Query('ts') tsParam: string,
    @Query('instrument') instrument?: string,
  ): Promise<Record<string, { ts: string; value: number; meta: unknown } | null>> {
    const target = parseIso(tsParam, 'ts');
    const ids = instrument ? [instrument] : LIVE_INSTRUMENTS.map((i) => i.id);
    if (instrument && !isKnownInstrument(instrument)) {
      throw new BadRequestException(`unknown instrument: ${instrument}`);
    }
    const out: Record<string, { ts: string; value: number; meta: unknown } | null> = {};
    for (const id of ids) {
      const row = await this.store.at(id, target);
      out[id] = row ? { ts: row.ts.toISOString(), value: row.value, meta: row.meta } : null;
    }
    return out;
  }

  /** GET /range?from=&to=&instrument= -> ticks for one instrument in [from,to]. */
  @Get('range')
  async range(
    @Query('from') fromParam: string,
    @Query('to') toParam: string,
    @Query('instrument') instrument: string,
  ): Promise<{ instrument: string; ticks: { ts: string; value: number; meta: unknown }[] }> {
    if (!instrument) throw new BadRequestException('missing required query param: instrument');
    if (!isKnownInstrument(instrument)) {
      throw new BadRequestException(`unknown instrument: ${instrument}`);
    }
    const from = parseIso(fromParam, 'from');
    const to = parseIso(toParam, 'to');
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('from must be <= to');
    }
    const rows = await this.store.range(instrument, from, to);
    return { instrument, ticks: rows.map(serializeTick) };
  }
}
