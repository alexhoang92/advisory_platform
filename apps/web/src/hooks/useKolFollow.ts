import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { KolProfileSummary } from '@hamilton/shared';

export function useKolFollow(handle: string) {
  const queryClient = useQueryClient();

  const updateCache = (is_following: boolean) => {
    queryClient.setQueryData<KolProfileSummary>(['kol-profiles', handle], (old) => {
      if (!old) return old;
      const delta = is_following ? 1 : -1;
      return {
        ...old,
        is_following,
        kol_followers_count: Math.max(0, (old.kol_followers_count ?? 0) + delta),
      };
    });
  };

  const follow = useMutation({
    mutationFn: () => api.post(`/kol-profiles/${handle}/follow`),
    onSuccess: () => updateCache(true),
  });

  const unfollow = useMutation({
    mutationFn: () => api.delete(`/kol-profiles/${handle}/follow`),
    onSuccess: () => updateCache(false),
  });

  return { follow, unfollow };
}
