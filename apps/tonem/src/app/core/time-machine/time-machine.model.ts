export interface HistoricalEntry {
  readonly ts: Date;
  readonly value: number;
}

export type HistoricalSnapshot = Readonly<Record<string, HistoricalEntry | null>>;
