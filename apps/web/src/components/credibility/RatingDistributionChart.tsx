import React from 'react';
import type { RatingDistribution } from '@hamilton/shared';

interface Props {
  data: RatingDistribution | null;
}

interface Segment {
  pct: number;
  color: string;
  label: string;
}

const R = 40;
const CX = 56;
const CY = 56;
const INNER_R = 24;

function describeArc(
  cx: number,
  cy: number,
  r: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
): string {
  if (Math.abs(endAngle - startAngle) >= 360) {
    // Full circle — draw as two halves to avoid degenerate arc
    const midAngle = startAngle + 180;
    const p1 = polar(cx, cy, r, startAngle);
    const p2 = polar(cx, cy, r, midAngle);
    const p3 = polar(cx, cy, r, endAngle);
    const i1 = polar(cx, cy, innerR, startAngle);
    const i2 = polar(cx, cy, innerR, midAngle);
    const i3 = polar(cx, cy, innerR, endAngle);
    return [
      `M ${p1.x} ${p1.y}`,
      `A ${r} ${r} 0 0 1 ${p2.x} ${p2.y}`,
      `A ${r} ${r} 0 0 1 ${p3.x} ${p3.y}`,
      `L ${i3.x} ${i3.y}`,
      `A ${innerR} ${innerR} 0 0 0 ${i2.x} ${i2.y}`,
      `A ${innerR} ${innerR} 0 0 0 ${i1.x} ${i1.y}`,
      'Z',
    ].join(' ');
  }

  const start = polar(cx, cy, r, startAngle);
  const end = polar(cx, cy, r, endAngle);
  const iStart = polar(cx, cy, innerR, startAngle);
  const iEnd = polar(cx, cy, innerR, endAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`,
    `L ${iEnd.x} ${iEnd.y}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${iStart.x} ${iStart.y}`,
    'Z',
  ].join(' ');
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function RatingDistributionChart({ data }: Props) {
  const dim = CX * 2;

  if (!data || data.total_count === 0) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4">
        <p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-3">
          Rating Distribution
        </p>
        <div className="flex items-center gap-4">
          <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`}>
            <path
              d={describeArc(CX, CY, R, INNER_R, 0, 359.99)}
              fill="var(--color-bg-subtle)"
            />
            <text
              x={CX}
              y={CY + 5}
              textAnchor="middle"
              fontSize={12}
              fontFamily="var(--font-mono)"
              fill="var(--color-text-tertiary)"
            >
              —
            </text>
          </svg>
          <div className="flex flex-col gap-1.5">
            {['Buy', 'Hold', 'Sell'].map((l) => (
              <div key={l} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-[var(--color-bg-subtle)]" />
                <span className="text-xs text-[var(--color-text-tertiary)]">{l} —</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const segments: Segment[] = [
    { pct: data.buy_pct, color: 'var(--color-positive)', label: 'Buy' },
    { pct: data.hold_pct, color: 'var(--color-text-tertiary)', label: 'Hold' },
    { pct: data.sell_pct, color: 'var(--color-negative)', label: 'Sell' },
  ];

  // Build arc paths
  const arcs: Array<{ path: string; color: string }> = [];
  let currentAngle = 0;
  for (const seg of segments) {
    if (seg.pct <= 0) continue;
    const sweep = (seg.pct / 100) * 360;
    arcs.push({
      path: describeArc(CX, CY, R, INNER_R, currentAngle, currentAngle + sweep),
      color: seg.color,
    });
    currentAngle += sweep;
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4">
      <p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-3">
        Rating Distribution
      </p>
      <div className="flex items-center gap-5">
        <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`}>
          {arcs.map((arc, i) => (
            <path key={i} d={arc.path} fill={arc.color} />
          ))}
        </svg>
        <div className="flex flex-col gap-2">
          {segments.map((seg) => (
            <div key={seg.label} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: seg.color }}
              />
              <span className="text-xs text-[var(--color-text-secondary)]">
                {seg.label}{' '}
                <span className="font-mono font-semibold text-[var(--color-text-primary)]">
                  {seg.pct}%
                </span>
              </span>
            </div>
          ))}
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
            {data.total_count} Ratings
          </p>
        </div>
      </div>
    </div>
  );
}
