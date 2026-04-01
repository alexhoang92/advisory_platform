import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ExpertCredibility } from '@hamilton/shared';

export function useKolCredibility(handle: string | undefined) {
  return useQuery({
    queryKey: ['kol-credibility', handle],
    queryFn: async () => {
      const response = await api.get<ExpertCredibility>(
        `/kol-profiles/${handle}/credibility`,
      );
      return response.data ?? null;
    },
    enabled: Boolean(handle),
    staleTime: 10 * 60 * 1000, // 10 minutes — computed live, cache aggressively
    retry: false,
  });
}
