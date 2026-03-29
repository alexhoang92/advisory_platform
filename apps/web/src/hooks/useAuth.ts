import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import type { AuthResponse, LoginInput, RegisterInput } from '@hamilton/shared';

export function useAuth() {
  const { user, accessToken, isAuthenticated, setAuth, logout } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: async (data: LoginInput) => {
      const response = await api.post<AuthResponse>('/auth/login', data);
      return response.data!;
    },
    onSuccess: (data) => {
      setAuth(data.user, data.access_token, data.refresh_token);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterInput) => {
      const response = await api.post<AuthResponse>('/auth/register', data);
      return response.data!;
    },
    onSuccess: (data) => {
      setAuth(data.user, data.access_token, data.refresh_token);
    },
  });

  return {
    user,
    accessToken,
    isAuthenticated,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout,
    loginLoading: loginMutation.isPending,
    loginError: loginMutation.error,
    registerLoading: registerMutation.isPending,
    registerError: registerMutation.error,
  };
}
