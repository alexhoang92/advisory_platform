import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    'bg-[var(--color-accent)] text-[var(--color-text-inverse)]',
    'hover:bg-[var(--color-accent-hover)]',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'font-semibold',
  ].join(' '),
  secondary: [
    'bg-transparent text-[var(--color-text-primary)]',
    'border border-[var(--color-border)]',
    'hover:border-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-subtle)]',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ].join(' '),
  destructive: [
    'bg-[var(--color-negative)] text-white',
    'hover:opacity-90',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'font-semibold',
  ].join(' '),
  ghost: [
    'bg-transparent text-[var(--color-text-secondary)]',
    'hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ].join(' '),
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded',
  md: 'px-4 py-2 text-sm rounded',
  lg: 'px-6 py-3 text-base rounded',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center gap-2',
        'transition-all duration-150 cursor-pointer',
        'font-body',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}
