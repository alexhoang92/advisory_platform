import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { User } from '@hamilton/shared';

export type UserSearchResult = Pick<User, 'id' | 'username' | 'display_name' | 'avatar_url'>;

export function useUserSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['users', 'search', q],
    queryFn: async () => {
      const response = await api.get<UserSearchResult[]>(`/users/search?q=${encodeURIComponent(q)}&limit=6`);
      return response.data ?? [];
    },
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
}
