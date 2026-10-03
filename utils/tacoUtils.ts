import type { ScanMetadata, SignalEvidence } from '../services/jevIndicatorService';
// Pure logic for the "TACO monitor" (Trump Always Chickens Out cycle tracker).
// Kept free of DOM/AI dependencies so it can be unit-tested in isolation.
//
// The monitor tracks two orthogonal things:
// 1. WHERE we are in the threat -> panic -> walk-back cycle (phase)
// 2. HOW CROWDED the TACO trade itself has become (edge decay) — the more the
//    media talks about the pattern, the less alpha remains, and the higher the
//    risk of a credibility-restoring "no chicken-out" event.

/** One TACO-cycle signal detected by the AI news scan. */
export interface TacoSignal extends SignalEvidence {
  /** 'threatEscalation' | 'marketPanic' | 'walkback' | 'complacency' | 'tacoMentions' */
  key: string;
  /** 0-100: how strongly this signal is present in the scanned news window */
  strength: number;
  /** Short evidence summary derived from the news items */
  evidence: string;
}

export interface TacoScanResult extends ScanMetadata {
  signals: TacoSignal[];
  /** ISO timestamp of the scan */
  scannedAt: string;
  /** How many articles were scanned */
  articleCount: number;
}

export type TacoPhase = 'quiet' | 'threat' | 'panic' | 'walkback' | 'complacency';

const PHASE_KEYS: Record<Exclude<TacoPhase, 'quiet'>, string> = {
  threat: 'threatEscalation',
  panic: 'marketPanic',
  walkback: 'walkback',
  complacency: 'complacency',
};

/** Minimum strength for any phase signal to be considered "active". */
const ACTIVE_THRESHOLD = 30;

const getStrength = (signals: TacoSignal[], key: string): number => {
  const s = signals.find(x => x.key === key);
  return s ? clamp(s.strength, 0, 100) : 0;
};

/**
 * Determine the dominant cycle phase from scanned signals.
 * Returns 'quiet' when no phase signal clears the active threshold.
 * Tie-breaking follows cycle order (threat -> panic -> walkback -> complacency):
 * the EARLIER phase wins a tie, because a fresh escalation overrides stale
 * walk-back narratives from the previous round.
 */
export function deriveTacoPhase(signals: TacoSignal[]): { phase: TacoPhase; confidence: number } {
  const entries = (Object.entries(PHASE_KEYS) as [Exclude<TacoPhase, 'quiet'>, string][])
    .map(([phase, key]) => ({ phase, strength: getStrength(signals, key) }));

  const best = entries.reduce((a, b) => (b.strength > a.strength ? b : a));
  if (best.strength < ACTIVE_THRESHOLD) {
    return { phase: 'quiet', confidence: 100 - best.strength };
  }
  // Confidence: dominance of the winner over the runner-up, scaled by absolute strength.
  const runnerUp = Math.max(...entries.filter(e => e.phase !== best.phase).map(e => e.strength));
  const dominance = clamp(best.strength - runnerUp, 0, 100);
  const confidence = Math.round(clamp(best.strength * 0.6 + dominance * 0.4, 0, 100));
  return { phase: best.phase, confidence };
}

/**
 * Edge decay (0-100): how much the TACO trade's alpha has been arbitraged away.
 * Driven by media density of the TACO meme itself (the pattern being common
 * knowledge) plus market complacency (threats no longer move prices).
 * High decay = the "pattern fails once, loses big" negative-skew risk dominates.
 */
export function computeEdgeDecay(signals: TacoSignal[]): number {
  const mentions = getStrength(signals, 'tacoMentions');
  const complacency = getStrength(signals, 'complacency');
  return Math.round(clamp(mentions * 0.6 + complacency * 0.4, 0, 100));
}

export type DecayBand = 'fresh' | 'known' | 'crowded';

export function decayBand(decay: number): DecayBand {
  if (decay < 35) return 'fresh';
  if (decay < 65) return 'known';
  return 'crowded';
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
