// Indicator scan history: localStorage-backed time series + staleness check.
// Pure helpers are exported separately so they can be unit-tested without a DOM.

export interface HistoryPoint {
  /** Scan timestamp (ms epoch). */
  at: number;
  /** Indicator value at that scan (0-100). */
  value: number;
}

export const MAX_HISTORY_POINTS = 60;

/** Pure: append a point, dedupe by timestamp, sort ascending, trim to max. */
export const appendPoint = (
  history: HistoryPoint[],
  point: HistoryPoint,
  max: number = MAX_HISTORY_POINTS
): HistoryPoint[] => {
  const next = history.filter(p => p.at !== point.at);
  next.push(point);
  next.sort((a, b) => a.at - b.at);
  return next.slice(-max);
};

/** Pure: parse a scan timestamp (ms epoch or ISO string) to ms epoch, or null. */
export const toEpochMs = (scannedAt: number | string | null | undefined): number | null => {
  if (scannedAt == null) return null;
  const ms = typeof scannedAt === 'number' ? scannedAt : Date.parse(scannedAt);
  return Number.isFinite(ms) ? ms : null;
};

/** Pure: true when the last scan is older than ttlMs (or missing/unparsable). */
export const isScanStale = (
  scannedAt: number | string | null | undefined,
  ttlMs: number,
  now: number = Date.now()
): boolean => {
  const ms = toEpochMs(scannedAt);
  if (ms == null) return true;
  return now - ms > ttlMs;
};

// --- localStorage persistence ---

export const loadHistory = (storageKey: string): HistoryPoint[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((p: any) => p && Number.isFinite(p.at) && Number.isFinite(p.value))
      .map((p: any) => ({ at: p.at, value: p.value }))
      .sort((a: HistoryPoint, b: HistoryPoint) => a.at - b.at)
      .slice(-MAX_HISTORY_POINTS);
  } catch {
    return [];
  }
};

export const saveHistory = (storageKey: string, history: HistoryPoint[]): void => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(history));
  } catch { /* best-effort */ }
};

/** Load + append + save in one step; returns the new series. */
export const recordHistoryPoint = (storageKey: string, point: HistoryPoint): HistoryPoint[] => {
  const next = appendPoint(loadHistory(storageKey), point);
  saveHistory(storageKey, next);
  return next;
};

// --- Auto-refresh preference (shared by both indicator cards) ---

const AUTO_REFRESH_KEY = 'indicator-auto-refresh';

export const loadAutoRefresh = (): boolean => {
  try {
    return localStorage.getItem(AUTO_REFRESH_KEY) === '1';
  } catch {
    return false;
  }
};

export const saveAutoRefresh = (enabled: boolean): void => {
  try {
    localStorage.setItem(AUTO_REFRESH_KEY, enabled ? '1' : '0');
  } catch { /* best-effort */ }
};
