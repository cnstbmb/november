/**
 * URL-кодек для параметра `ts` машины времени.
 * Существует параллельно с `view`-параметром в том же хэше.
 * Не трогает view — оставляет как есть (ViewSettingsStore управляет им отдельно).
 */

const TS_PARAM = 'ts';

export function hasTimeTargetParam(url: string): boolean {
  try {
    const parsed = new URL(url);
    return new URLSearchParams(parsed.hash.slice(1)).has(TS_PARAM);
  } catch {
    return false;
  }
}

export function timeTargetFromUrl(url: string, now: Date = new Date()): Date | null {
  try {
    const parsed = new URL(url);
    const params = new URLSearchParams(parsed.hash.slice(1));
    const ts = params.get(TS_PARAM);
    if (!ts) return null;
    const ms = Date.parse(ts);
    return Number.isFinite(ms) && ms <= now.getTime() ? new Date(ms) : null;
  } catch {
    return null;
  }
}

/** Устанавливает или убирает `ts` в хэше, сохраняя все остальные параметры (включая view). */
export function canonicalTimeUrl(url: string, ts: Date | null): string {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.hash.slice(1));
  if (ts && Number.isFinite(ts.getTime())) {
    params.set(TS_PARAM, ts.toISOString());
  } else {
    params.delete(TS_PARAM);
  }
  params.sort();
  parsed.hash = params.toString();
  return parsed.toString();
}
