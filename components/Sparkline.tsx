import React from 'react';
import type { HistoryPoint } from '../utils/indicatorHistory';

interface SparklineProps {
  points: HistoryPoint[];
  /** Fixed value domain (e.g. 0-100 scores). */
  min?: number;
  max?: number;
  className?: string;
  /** Stroke color class is driven via currentColor — set text-* on the wrapper. */
  ariaLabel: string;
}

const W = 120;
const H = 32;
const PAD = 3;

/**
 * Dependency-free inline sparkline. Renders the series as a polyline with a
 * dot on the latest point, scaled to a fixed 0-100 domain by default so two
 * cards with the same domain are visually comparable.
 */
const Sparkline: React.FC<SparklineProps> = ({ points, min = 0, max = 100, ariaLabel, className = '' }) => {
  if (points.length < 2) return null;

  const t0 = points[0].at;
  const t1 = points[points.length - 1].at;
  const span = Math.max(1, t1 - t0);
  const range = Math.max(1, max - min);

  const coords = points.map(p => ({
    x: PAD + ((p.at - t0) / span) * (W - PAD * 2),
    y: PAD + (1 - (Math.min(max, Math.max(min, p.value)) - min) / range) * (H - PAD * 2),
  }));
  const path = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`h-8 w-[120px] ${className}`}
      role="img"
      aria-label={ariaLabel}
    >
      <polyline
        points={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last.x} cy={last.y} r="2.5" fill="currentColor" />
    </svg>
  );
};

export default Sparkline;
