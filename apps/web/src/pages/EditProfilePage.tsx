import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import { UpdateUserSchema, type UpdateUserInput } from '@hamilton/shared';
import { useUpdateMe } from '../hooks/useUser';
import { useAuthStore } from '../stores/authStore';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Input, Textarea } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { ApiError } from '../lib/api';

export function EditProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const navigate = useNavigate();
  const updateMe = useUpdateMe();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<UpdateUserInput>({
    resolver: zodResolver(UpdateUserSchema),
    defaultValues: {
      display_name: user?.display_name ?? '',
      bio: user?.bio ?? '',
      location: user?.location ?? '',
      website: user?.website ?? '',
      avatar_url: user?.avatar_url ?? '',
    },
  });

  async function onSubmit(data: UpdateUserInput) {
    try {
      const updated = await updateMe.mutateAsync(data);
      // Update auth store with new user data
      if (accessToken && refreshToken) {
        setAuth(updated, accessToken, refreshToken);
      }
      void navigate(`/profile/${updated.username}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError('root', { message: err.message });
      } else {
        setError('root', { message: 'Update failed. Please try again.' });
      }
    }
  }

  return (
    <AppLayout>
      <div className="mb-5">
        <Link
          to={`/profile/${user?.username ?? 'me'}`}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <ArrowLeft size={14} />
          Back to profile
        </Link>
      </div>

      <Card>
        <div className="mb-6">
          <h1 className="font-display font-bold text-2xl text-[var(--color-text-primary)]">
            Edit Profile
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Update your public profile information.
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-4">
          <Input
            label="Display Name"
            placeholder="Alex Rivera"
            error={errors.display_name?.message}
            {...register('display_name')}
          />

          <Textarea
            label="Bio"
            placeholder="Tell us about yourself and your investment focus..."
            error={errors.bio?.message}
            {...register('bio')}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Location"
              placeholder="New York, NY"
              error={errors.location?.message}
              {...register('location')}
            />
            <Input
              label="Website"
              type="url"
              placeholder="https://yoursite.com"
              error={errors.website?.message}
              {...register('website')}
            />
          </div>

          <Input
            label="Avatar URL"
            type="url"
            placeholder="https://example.com/avatar.jpg"
            hint="Direct link to your profile image"
            error={errors.avatar_url?.message}
            {...register('avatar_url')}
          />

          {errors.root && (
            <div className="px-3 py-2.5 rounded bg-[#ff500015] border border-[#ff500030]">
              <p className="text-sm text-[var(--color-negative)]">{errors.root.message}</p>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button
              type="submit"
              loading={updateMe.isPending}
              disabled={!isDirty}
            >
              Save changes
            </Button>
            <Link to={`/profile/${user?.username ?? 'me'}`}>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </Card>
    </AppLayout>
  );
}
