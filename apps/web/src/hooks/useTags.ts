import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface TagResult {
  id: string;
  ticker: string;
  name: string;
  market: string;
  asset_type: string;
  currency: string | null;
  exchange: string | null;
}

export interface TagDetail extends TagResult {
  last_synced_at: string;
}

export function useTagSearch(query: string, market?: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['tags', 'search', q, market],
    queryFn: async () => {
      const params = new URLSearchParams({ q, limit: '8' });
      if (market) params.set('market', market);
      const response = await api.get<TagResult[]>(`/tags/search?${params.toString()}`);
      return response.data ?? [];
    },
    enabled: q.length >= 1,
    staleTime: 30_000,
  });
}

export function useTag(ticker: string) {
  return useQuery({
    queryKey: ['tags', ticker],
    queryFn: async () => {
      const response = await api.get<TagDetail>(`/tags/${encodeURIComponent(ticker)}`);
      return response.data!;
    },
    enabled: Boolean(ticker),
    staleTime: 5 * 60_000,
    retry: false,
  });
}
