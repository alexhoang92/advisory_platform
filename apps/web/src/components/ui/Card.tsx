import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  noPadding?: boolean;
}

export function Card({ elevated = false, noPadding = false, className = '', children, ...props }: CardProps) {
  return (
    <div
      className={[
        'rounded-lg border border-[var(--color-border)]',
        elevated
          ? 'bg-[var(--color-bg-elevated)]'
          : 'bg-[var(--color-bg-surface)]',
        noPadding ? '' : 'p-4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={['px-4 pt-4 pb-3 border-b border-[var(--color-border-subtle)]', className].join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardBody({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={['p-4', className].join(' ')} {...props}>
      {children}
    </div>
  );
}
