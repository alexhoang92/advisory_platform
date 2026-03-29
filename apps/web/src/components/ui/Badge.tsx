import React from 'react';

type BadgeVariant = 'default' | 'positive' | 'negative' | 'warning' | 'info' | 'accent';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] border-[var(--color-border)]',
  positive: 'bg-[#00c80520] text-[var(--color-positive)] border-[#00c80540]',
  negative: 'bg-[#ff500020] text-[var(--color-negative)] border-[#ff500040]',
  warning: 'bg-[#f5a62320] text-[var(--color-warning)] border-[#f5a62340]',
  info: 'bg-[#4a9eff20] text-[var(--color-info)] border-[#4a9eff40]',
  accent: 'bg-[var(--color-accent-muted)] text-[var(--color-accent)] border-[var(--color-border-accent)]',
};

export function Badge({ variant = 'default', className = '', children, ...props }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5',
        'text-xs font-medium font-body',
        'rounded-full border',
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </span>
  );
}
