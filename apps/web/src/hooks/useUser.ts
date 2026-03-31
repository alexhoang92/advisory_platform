import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { User, UpdateUserInput } from '@hamilton/shared';

const USERS_KEY = 'users';

export function useUser(username: string) {
  return useQuery({
    queryKey: [USERS_KEY, username],
    queryFn: async () => {
      const response = await api.get<User>(`/users/${username}`);
      return response.data!;
    },
    enabled: Boolean(username),
    retry: false,
  });
}

export function useUpdateMe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateUserInput) => {
      const response = await api.patch<User>('/users/me', data);
      return response.data!;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData([USERS_KEY, updated.username], updated);
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}
