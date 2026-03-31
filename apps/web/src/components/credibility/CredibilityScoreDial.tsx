import React from 'react';

interface Props {
  score: number | null;
  label: string;
  size?: 'sm' | 'md';
}

function arcColor(score: number | null): string {
  if (score === null) return 'var(--color-bg-subtle)';
  if (score >= 60) return 'var(--color-positive)';
  if (score >= 30) return 'var(--color-warning)';
  return 'var(--color-negative)';
}

/**
 * SVG arc dial showing a 0–100 credibility score.
 * Arc sweeps 270° (from 135° to 405°, i.e. bottom-left to bottom-right).
 */
export function CredibilityScoreDial({ score, label, size = 'md' }: Props) {
  const dim = size === 'sm' ? 80 : 112;
  const cx = dim / 2;
  const cy = dim / 2;
  const r = size === 'sm' ? 30 : 42;
  const strokeWidth = size === 'sm' ? 6 : 8;

  // Arc geometry: 270° sweep starting at 135° (bottom-left)
  const startAngleDeg = 135;
  const sweepDeg = 270;

  function polarToXY(angleDeg: number): [number, number] {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }

  const [sx, sy] = polarToXY(startAngleDeg);
  const [ex, ey] = polarToXY(startAngleDeg + sweepDeg);

  // Background track (full 270°)
  const bgPath = `M ${sx} ${sy} A ${r} ${r} 0 1 1 ${ex} ${ey}`;

  // Filled arc for the score
  const pct = score !== null ? Math.max(0, Math.min(100, score)) / 100 : 0;
  const fillSweep = sweepDeg * pct;
  const [fx, fy] = polarToXY(startAngleDeg + fillSweep);
  const largeArc = fillSweep > 180 ? 1 : 0;
  const fillPath =
    pct > 0
      ? `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${fx} ${fy}`
      : '';

  const color = arcColor(score);
  const fontSize = size === 'sm' ? 16 : 22;
  const labelSize = size === 'sm' ? 8 : 9;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`}>
        {/* Track */}
        <path
          d={bgPath}
          fill="none"
          stroke="var(--color-bg-subtle)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Score arc */}
        {fillPath && (
          <path
            d={fillPath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}
        {/* Center score */}
        <text
          x={cx}
          y={cy + fontSize * 0.35}
          textAnchor="middle"
          fontSize={fontSize}
          fontFamily="var(--font-mono)"
          fontWeight="700"
          fill={score !== null ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)'}
        >
          {score !== null ? score : '—'}
        </text>
      </svg>
      <span
        className="text-center font-medium leading-tight"
        style={{ fontSize: labelSize, color: 'var(--color-text-secondary)', maxWidth: dim }}
      >
        {label}
      </span>
    </div>
  );
}
