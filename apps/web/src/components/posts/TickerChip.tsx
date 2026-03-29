import React from 'react';

interface TickerChipProps {
  symbol: string;
  changePct?: number | null;
  onClick?: () => void;
}

export function TickerChip({ symbol, changePct, onClick }: TickerChipProps) {
  const isPositive = changePct != null && changePct >= 0;
  const isNegative = changePct != null && changePct < 0;

  return (
    <span
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={[
        'inline-flex items-center gap-1.5 px-2 py-0.5',
        'rounded-full border',
        'font-mono text-xs uppercase tracking-widest',
        'transition-colors duration-150',
        onClick ? 'cursor-pointer' : 'cursor-default',
        isPositive
          ? 'bg-[#00c80515] border-[#00c80530] text-[var(--color-positive)]'
          : isNegative
            ? 'bg-[#ff500015] border-[#ff500030] text-[var(--color-negative)]'
            : 'bg-[var(--color-bg-elevated)] border-[var(--color-border)] text-[var(--color-text-secondary)]',
        onClick ? 'hover:opacity-80' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {symbol.toUpperCase()}
      {changePct != null && (
        <span className="font-mono text-xs">
          {isPositive ? '+' : ''}
          {changePct.toFixed(2)}%
        </span>
      )}
    </span>
  );
}
