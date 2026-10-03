import type { ScanMetadata, SignalEvidence } from '../services/jevIndicatorService';
// Pure logic for the "market thermometer" (exit-pressure gauge).
// Kept free of DOM/AI dependencies so it can be unit-tested in isolation.

/** One institutional-behavior signal detected by the AI news scan. */
export interface SentimentSignal extends SignalEvidence {
  /** Signal key, e.g. 'targetPriceRaises', 'consensusBullish', 'goodNewsFatigue', 'institutionalRetreat', 'externalBlame' */
  key: string;
  /** 0-100: how strongly this signal is present in the scanned news window */
  strength: number;
  /** Short evidence summary quoted/derived from the news items */
  evidence: string;
}

export interface SentimentScanResult extends ScanMetadata {
  /** 0-100: aggregate crowding/euphoria read from news (fast variable) */
  newsScore: number;
  signals: SentimentSignal[];
  /** ISO timestamp of the scan */
  scannedAt: string;
  /** How many articles were scanned */
  articleCount: number;
}

export type PressureBand = 'calm' | 'elevated' | 'high' | 'extreme';

/**
 * Combine the slow variable (Buffett indicator percentile, 0-100) with the
 * fast variable (news crowding score, 0-100) into an exit-pressure score.
 *
 * Design (mirrors the valuation x sentiment timing framework):
 * - The Buffett percentile acts as a GATE: when valuation is not stretched
 *   (< 70th percentile), news euphoria alone cannot push pressure into the
 *   high bands — the gate multiplier discounts the fast variable.
 * - When valuation is stretched (>= 90th), the fast variable passes through
 *   at full weight and the base pressure is already elevated.
 */
export function computeExitPressure(buffettPercentile: number | null, newsScore: number | null): number | null {
  if (buffettPercentile == null && newsScore == null) return null;

  const b = clamp(buffettPercentile ?? 50, 0, 100); // unknown valuation -> neutral
  const n = clamp(newsScore ?? 0, 0, 100); // unknown news -> no fast-variable pressure

  // Gate multiplier: 0.35 below the 50th percentile, ramping to 1.0 at the 90th.
  const gate = b <= 50 ? 0.35 : b >= 90 ? 1 : 0.35 + (0.65 * (b - 50)) / 40;

  // Base pressure from valuation alone (slow variable): 0 at p50 -> 45 at p100.
  const base = b <= 50 ? 0 : ((b - 50) / 50) * 45;

  // Fast variable contributes up to 55 points, discounted by the gate.
  const fast = (n / 100) * 55 * gate;

  return Math.round(clamp(base + fast, 0, 100));
}

export function pressureBand(score: number | null): PressureBand | null {
  if (score == null) return null;
  if (score < 30) return 'calm';
  if (score < 55) return 'elevated';
  if (score < 75) return 'high';
  return 'extreme';
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
