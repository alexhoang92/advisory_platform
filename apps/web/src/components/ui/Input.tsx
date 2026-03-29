import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={[
            'w-full px-3 py-2.5 rounded',
            'bg-[var(--color-bg-elevated)]',
            'border',
            error
              ? 'border-[var(--color-negative)]'
              : 'border-[var(--color-border)]',
            'text-[var(--color-text-primary)] text-sm font-body',
            'placeholder:text-[var(--color-text-tertiary)]',
            'focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]',
            'transition-colors duration-150',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...props}
        />
        {error && (
          <p className="text-xs text-[var(--color-negative)]">{error}</p>
        )}
        {hint && !error && (
          <p className="text-xs text-[var(--color-text-tertiary)]">{hint}</p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

// Textarea variant
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={[
            'w-full px-3 py-2.5 rounded',
            'bg-[var(--color-bg-elevated)]',
            'border',
            error
              ? 'border-[var(--color-negative)]'
              : 'border-[var(--color-border)]',
            'text-[var(--color-text-primary)] text-sm font-body',
            'placeholder:text-[var(--color-text-tertiary)]',
            'focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]',
            'transition-colors duration-150',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'resize-vertical min-h-[120px]',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...props}
        />
        {error && (
          <p className="text-xs text-[var(--color-negative)]">{error}</p>
        )}
        {hint && !error && (
          <p className="text-xs text-[var(--color-text-tertiary)]">{hint}</p>
        )}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
