import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { TrendingUp } from 'lucide-react';
import { LoginSchema, type LoginInput } from '@hamilton/shared';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { ApiError } from '../lib/api';

export function LoginPage() {
  const { login, loginLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname ?? '/feed';

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
  });

  async function onSubmit(data: LoginInput) {
    try {
      await login(data);
      void navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError('root', { message: err.message });
      } else {
        setError('root', { message: 'Login failed. Please try again.' });
      }
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2 mb-8">
        <TrendingUp size={22} className="text-[var(--color-accent)]" />
        <span className="font-display font-bold text-xl text-[var(--color-text-primary)]">Hamilton</span>
      </Link>

      <Card className="w-full max-w-md">
        <div className="mb-6">
          <h1 className="font-display font-bold text-2xl text-[var(--color-text-primary)]">
            Sign in
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Welcome back to Hamilton.
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />

          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />

          {errors.root && (
            <div className="px-3 py-2.5 rounded bg-[#ff500015] border border-[#ff500030]">
              <p className="text-sm text-[var(--color-negative)]">{errors.root.message}</p>
            </div>
          )}

          <Button type="submit" fullWidth loading={loginLoading} className="mt-1">
            Sign in
          </Button>
        </form>

        <div className="mt-5 pt-4 border-t border-[var(--color-border-subtle)] text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Don&apos;t have an account?{' '}
            <Link
              to="/register"
              className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] font-medium transition-colors"
            >
              Create one
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
