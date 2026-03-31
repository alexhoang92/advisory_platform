import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { User } from '@hamilton/shared';

export function useFollow(username: string) {
  const queryClient = useQueryClient();

  const updateCache = (is_following: boolean) => {
    queryClient.setQueryData<User>(['users', username], (old) => {
      if (!old) return old;
      const delta = is_following ? 1 : -1;
      return {
        ...old,
        is_following,
        follower_count: Math.max(0, (old.follower_count ?? 0) + delta),
      };
    });
  };

  const follow = useMutation({
    mutationFn: () => api.post(`/users/${username}/follow`),
    onSuccess: () => updateCache(true),
  });

  const unfollow = useMutation({
    mutationFn: () => api.delete(`/users/${username}/follow`),
    onSuccess: () => updateCache(false),
  });

  return { follow, unfollow };
}
