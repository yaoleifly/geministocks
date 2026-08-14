import { describe, it, expect } from 'vitest';
import { appendPoint, isScanStale, MAX_HISTORY_POINTS, type HistoryPoint } from './indicatorHistory';

describe('appendPoint', () => {
  it('appends and keeps ascending order', () => {
    const h: HistoryPoint[] = [{ at: 100, value: 10 }, { at: 300, value: 30 }];
    const next = appendPoint(h, { at: 200, value: 20 });
    expect(next.map(p => p.at)).toEqual([100, 200, 300]);
  });

  it('dedupes by timestamp (last write wins)', () => {
    const h: HistoryPoint[] = [{ at: 100, value: 10 }];
    const next = appendPoint(h, { at: 100, value: 99 });
    expect(next).toEqual([{ at: 100, value: 99 }]);
  });

  it('trims to max points, dropping oldest', () => {
    const h: HistoryPoint[] = Array.from({ length: MAX_HISTORY_POINTS }, (_, i) => ({ at: i, value: i }));
    const next = appendPoint(h, { at: 9999, value: 1 });
    expect(next).toHaveLength(MAX_HISTORY_POINTS);
    expect(next[0].at).toBe(1); // oldest (at: 0) dropped
    expect(next[next.length - 1].at).toBe(9999);
  });

  it('does not mutate the input array', () => {
    const h: HistoryPoint[] = [{ at: 100, value: 10 }];
    appendPoint(h, { at: 200, value: 20 });
    expect(h).toHaveLength(1);
  });
});

describe('isScanStale', () => {
  const HOUR = 3600_000;

  it('is stale when missing', () => {
    expect(isScanStale(null, HOUR)).toBe(true);
    expect(isScanStale(undefined, HOUR)).toBe(true);
    expect(isScanStale(NaN, HOUR)).toBe(true);
  });

  it('is fresh within ttl and stale after', () => {
    const now = 10 * HOUR;
    expect(isScanStale(now - HOUR + 1, HOUR, now)).toBe(false);
    expect(isScanStale(now - HOUR - 1, HOUR, now)).toBe(true);
  });

  it('accepts ISO string timestamps', () => {
    const now = Date.parse('2026-08-14T12:00:00Z');
    expect(isScanStale('2026-08-14T11:30:00Z', HOUR, now)).toBe(false);
    expect(isScanStale('2026-08-14T09:00:00Z', HOUR, now)).toBe(true);
    expect(isScanStale('not-a-date', HOUR, now)).toBe(true);
  });
});
