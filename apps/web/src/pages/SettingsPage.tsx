import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Settings, Lock, FileText } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useUpdateMe } from '../hooks/useUser';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Input';
import { Input } from '../components/ui/Input';
import { api, ApiError } from '../lib/api';

const BioSchema = z.object({
  bio: z.string().max(200, 'Bio must be at most 200 characters').optional().nullable(),
});
type BioInput = z.infer<typeof BioSchema>;

const PasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: z.string().min(8, 'New password must be at least 8 characters'),
    confirm_password: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });
type PasswordInput = z.infer<typeof PasswordSchema>;

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const updateMe = useUpdateMe();

  const [bioSuccess, setBioSuccess] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);

  const bioForm = useForm<BioInput>({
    resolver: zodResolver(BioSchema),
    defaultValues: { bio: user?.bio ?? '' },
  });

  const pwForm = useForm<PasswordInput>({
    resolver: zodResolver(PasswordSchema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  });

  async function onSaveBio(data: BioInput) {
    try {
      const updated = await updateMe.mutateAsync({ bio: data.bio ?? null });
      if (accessToken && refreshToken) {
        setAuth(updated, accessToken, refreshToken);
      }
      setBioSuccess(true);
      setTimeout(() => setBioSuccess(false), 3000);
    } catch (err) {
      if (err instanceof ApiError) {
        bioForm.setError('root', { message: err.message });
      } else {
        bioForm.setError('root', { message: 'Failed to save bio. Please try again.' });
      }
    }
  }

  async function onChangePassword(data: PasswordInput) {
    try {
      await api.patch('/users/me/password', {
        current_password: data.current_password,
        new_password: data.new_password,
      });
      pwForm.reset();
      setPwSuccess(true);
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err) {
      if (err instanceof ApiError) {
        pwForm.setError('root', { message: err.message });
      } else {
        pwForm.setError('root', { message: 'Failed to update password. Please try again.' });
      }
    }
  }

  const bioValue = bioForm.watch('bio') ?? '';

  return (
    <AppLayout>
      <div className="flex items-center gap-2.5 mb-6">
        <Settings size={18} className="text-[var(--color-text-secondary)]" />
        <h1 className="font-display font-bold text-xl text-[var(--color-text-primary)]">
          Account Settings
        </h1>
      </div>

      <div className="flex flex-col gap-5 max-w-lg">
        {/* Bio */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <FileText size={15} className="text-[var(--color-text-secondary)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Bio</h2>
          </div>

          <form onSubmit={(e) => void bioForm.handleSubmit(onSaveBio)(e)} className="flex flex-col gap-3">
            <div>
              <Textarea
                label="About you"
                placeholder="Tell us about yourself and your investment focus..."
                error={bioForm.formState.errors.bio?.message}
                {...bioForm.register('bio')}
              />
              <p className={`text-[10px] mt-1 text-right font-mono ${bioValue.length > 200 ? 'text-red-400' : 'text-[var(--color-text-tertiary)]'}`}>
                {bioValue.length}/200
              </p>
            </div>

            {bioForm.formState.errors.root && (
              <div className="px-3 py-2 rounded bg-[#ff500015] border border-[#ff500030]">
                <p className="text-sm text-[var(--color-negative)]">
                  {bioForm.formState.errors.root.message}
                </p>
              </div>
            )}

            {bioSuccess && (
              <div className="px-3 py-2 rounded bg-[var(--color-accent-muted)] border border-[var(--color-border-accent)]">
                <p className="text-sm text-[var(--color-accent)]">Bio updated successfully.</p>
              </div>
            )}

            <Button
              type="submit"
              loading={updateMe.isPending}
              disabled={!bioForm.formState.isDirty}
            >
              Save bio
            </Button>
          </form>
        </Card>

        {/* Password */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Lock size={15} className="text-[var(--color-text-secondary)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Change Password
            </h2>
          </div>

          <form onSubmit={(e) => void pwForm.handleSubmit(onChangePassword)(e)} className="flex flex-col gap-3">
            <Input
              label="Current password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              error={pwForm.formState.errors.current_password?.message}
              {...pwForm.register('current_password')}
            />
            <Input
              label="New password"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              hint="At least 8 characters"
              error={pwForm.formState.errors.new_password?.message}
              {...pwForm.register('new_password')}
            />
            <Input
              label="Confirm new password"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              error={pwForm.formState.errors.confirm_password?.message}
              {...pwForm.register('confirm_password')}
            />

            {pwForm.formState.errors.root && (
              <div className="px-3 py-2 rounded bg-[#ff500015] border border-[#ff500030]">
                <p className="text-sm text-[var(--color-negative)]">
                  {pwForm.formState.errors.root.message}
                </p>
              </div>
            )}

            {pwSuccess && (
              <div className="px-3 py-2 rounded bg-[var(--color-accent-muted)] border border-[var(--color-border-accent)]">
                <p className="text-sm text-[var(--color-accent)]">Password updated successfully.</p>
              </div>
            )}

            <Button type="submit" loading={pwForm.formState.isSubmitting}>
              Update password
            </Button>
          </form>
        </Card>
      </div>
    </AppLayout>
  );
}
