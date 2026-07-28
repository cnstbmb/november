/**
 * Idempotent tick persistence + read-side selection logic.
 * The pure key-building and nearest-tick selection live here so they can be
 * unit-tested without a database.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { TickInput } from './parsers';

/** Builds the compound unique key Prisma expects for the (instrument, ts) upsert. */
export function tickUniqueKey(instrument: string, ts: Date): {
  instrument: string;
  ts: Date;
} {
  return { instrument, ts };
}

export interface TickRow {
  instrument: string;
  ts: Date;
  value: number;
  meta: unknown;
}

/**
 * Given an unordered set of candidate ticks for ONE instrument, pick the
 * nearest tick with ts <= target. Pure function — unit-tested.
 */
export function selectNearestAtOrBefore(
  rows: readonly { ts: Date; value: number }[],
  target: Date,
): { ts: Date; value: number } | null {
  let best: { ts: Date; value: number } | null = null;
  for (const r of rows) {
    if (r.ts.getTime() > target.getTime()) continue;
    if (best === null || r.ts.getTime() > best.ts.getTime()) {
      best = r;
    }
  }
  return best;
}

@Injectable()
export class TickStore {
  private readonly logger = new Logger(TickStore.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotently persist ticks. Upsert on the unique (instrument, ts) so a
   * container restart re-using the same minute neither duplicates nor crashes.
   */
  async saveTicks(ticks: readonly TickInput[]): Promise<number> {
    let written = 0;
    for (const t of ticks) {
      const key = tickUniqueKey(t.instrument, t.ts);
      await this.prisma.tick.upsert({
        where: { instrument_ts: key },
        create: {
          instrument: t.instrument,
          ts: t.ts,
          value: t.value,
          meta: (t.meta ?? undefined) as Prisma.InputJsonValue | undefined,
        },
        update: {
          value: t.value,
          meta: (t.meta ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      written++;
    }
    return written;
  }

  /** Latest tick per instrument. */
  async latest(): Promise<TickRow[]> {
    const grouped = await this.prisma.tick.groupBy({
      by: ['instrument'],
      _max: { ts: true },
    });
    const out: TickRow[] = [];
    for (const g of grouped) {
      const maxTs = g._max.ts;
      if (!maxTs) continue;
      const row = await this.prisma.tick.findUnique({
        where: { instrument_ts: { instrument: g.instrument, ts: maxTs } },
      });
      if (row) {
        out.push({ instrument: row.instrument, ts: row.ts, value: row.value, meta: row.meta });
      }
    }
    return out;
  }

  /** Nearest tick with ts <= target for one instrument. */
  async at(instrument: string, target: Date): Promise<TickRow | null> {
    const row = await this.prisma.tick.findFirst({
      where: { instrument, ts: { lte: target } },
      orderBy: { ts: 'desc' },
    });
    return row
      ? { instrument: row.instrument, ts: row.ts, value: row.value, meta: row.meta }
      : null;
  }

  /** Ticks for one instrument in [from, to], ascending. */
  async range(instrument: string, from: Date, to: Date): Promise<TickRow[]> {
    const rows = await this.prisma.tick.findMany({
      where: { instrument, ts: { gte: from, lte: to } },
      orderBy: { ts: 'asc' },
    });
    return rows.map((r) => ({ instrument: r.instrument, ts: r.ts, value: r.value, meta: r.meta }));
  }
}
