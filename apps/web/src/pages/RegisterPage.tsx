import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { TrendingUp, Briefcase, BarChart2 } from 'lucide-react';
import { RegisterSchema, type RegisterInput } from '@hamilton/shared';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { ApiError } from '../lib/api';

export function RegisterPage() {
  const { register: registerUser, registerLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultRole = searchParams.get('role') === 'expert' ? 'expert' : 'retail';

  const [selectedRole, setSelectedRole] = useState<'expert' | 'retail'>(defaultRole);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: { role: defaultRole },
  });

  function handleRoleSelect(role: 'expert' | 'retail') {
    setSelectedRole(role);
    setValue('role', role);
  }

  async function onSubmit(data: RegisterInput) {
    try {
      await registerUser(data);
      void navigate('/feed', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError('root', { message: err.message });
      } else {
        setError('root', { message: 'Registration failed. Please try again.' });
      }
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2 mb-8">
        <TrendingUp size={22} className="text-[var(--color-accent)]" />
        <span className="font-display font-bold text-xl text-[var(--color-text-primary)]">Hamilton</span>
      </Link>

      <Card className="w-full max-w-md">
        <div className="mb-6">
          <h1 className="font-display font-bold text-2xl text-[var(--color-text-primary)]">
            Create your account
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Join Hamilton and access verified expert research.
          </p>
        </div>

        {/* Role toggle */}
        <div className="mb-5">
          <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
            I am joining as
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleRoleSelect('retail')}
              className={[
                'flex items-center gap-2.5 p-3 rounded-lg border text-left transition-all duration-150',
                selectedRole === 'retail'
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:border-[var(--color-text-tertiary)]',
              ].join(' ')}
            >
              <BarChart2
                size={18}
                className={
                  selectedRole === 'retail'
                    ? 'text-[var(--color-accent)]'
                    : 'text-[var(--color-text-secondary)]'
                }
              />
              <div>
                <p
                  className={[
                    'text-sm font-semibold',
                    selectedRole === 'retail'
                      ? 'text-[var(--color-accent)]'
                      : 'text-[var(--color-text-primary)]',
                  ].join(' ')}
                >
                  Retail Investor
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)]">Follow experts</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleRoleSelect('expert')}
              className={[
                'flex items-center gap-2.5 p-3 rounded-lg border text-left transition-all duration-150',
                selectedRole === 'expert'
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:border-[var(--color-text-tertiary)]',
              ].join(' ')}
            >
              <Briefcase
                size={18}
                className={
                  selectedRole === 'expert'
                    ? 'text-[var(--color-accent)]'
                    : 'text-[var(--color-text-secondary)]'
                }
              />
              <div>
                <p
                  className={[
                    'text-sm font-semibold',
                    selectedRole === 'expert'
                      ? 'text-[var(--color-accent)]'
                      : 'text-[var(--color-text-primary)]',
                  ].join(' ')}
                >
                  Expert
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)]">Publish & monetize</p>
              </div>
            </button>
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-4">
          {/* Hidden role field */}
          <input type="hidden" {...register('role')} value={selectedRole} />

          <Input
            label="Username"
            placeholder="alexrivera"
            autoComplete="username"
            error={errors.username?.message}
            {...register('username')}
          />

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
            autoComplete="new-password"
            hint="At least 8 characters"
            error={errors.password?.message}
            {...register('password')}
          />

          {errors.root && (
            <div className="px-3 py-2.5 rounded bg-[#ff500015] border border-[#ff500030]">
              <p className="text-sm text-[var(--color-negative)]">{errors.root.message}</p>
            </div>
          )}

          <Button type="submit" fullWidth loading={registerLoading} className="mt-1">
            Create account
          </Button>

          <p className="text-xs text-center text-[var(--color-text-tertiary)]">
            By creating an account you agree to our Terms of Service and Privacy Policy.
          </p>
        </form>

        <div className="mt-5 pt-4 border-t border-[var(--color-border-subtle)] text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] font-medium transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
