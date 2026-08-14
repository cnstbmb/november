export function elapsedSeconds(startedAt: bigint, finishedAt = process.hrtime.bigint()): number {
  return Number(finishedAt - startedAt) / 1_000_000_000;
}
