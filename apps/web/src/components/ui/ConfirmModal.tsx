import React from 'react';
import { Button } from './Button';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-sm bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-xl p-6 flex flex-col gap-4">
        <h2 className="font-display font-bold text-lg text-[var(--color-text-primary)]">{title}</h2>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{message}</p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} loading={isLoading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
