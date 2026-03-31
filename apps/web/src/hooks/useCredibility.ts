import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ExpertCredibility } from '@hamilton/shared';

export function useCredibility(username: string | undefined) {
  return useQuery({
    queryKey: ['credibility', username],
    queryFn: async () => {
      const response = await api.get<ExpertCredibility | null>(
        `/users/${username}/credibility`,
      );
      return response.data ?? null;
    },
    enabled: Boolean(username),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
}
