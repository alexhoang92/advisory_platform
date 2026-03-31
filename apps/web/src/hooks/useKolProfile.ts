import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { KolProfileSummary } from '@hamilton/shared';

export function useKolProfile(handle: string | undefined) {
  return useQuery({
    queryKey: ['kol-profiles', handle],
    queryFn: async () => {
      const response = await api.get<KolProfileSummary>(`/kol-profiles/${handle}`);
      return response.data ?? null;
    },
    enabled: Boolean(handle),
    retry: false,
  });
}
