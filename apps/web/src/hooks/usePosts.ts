import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Post, CreatePostInput, UpdatePostInput, ApiResponse } from '@hamilton/shared';

const POSTS_KEY = 'posts';

// ─── Infinite Feed ────────────────────────────────────────────────────────────

export function useInfinitePosts() {
  return useInfiniteQuery({
    queryKey: [POSTS_KEY, 'infinite'],
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as string | undefined;
      const path = cursor ? `/posts?cursor=${cursor}&limit=20` : '/posts?limit=20';
      const response = await api.get<Post[]>(path);
      return response;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: ApiResponse<Post[]>) => {
      if (lastPage.meta?.has_more && lastPage.meta.cursor) {
        return lastPage.meta.cursor;
      }
      return undefined;
    },
  });
}

// ─── Posts by Ticker ─────────────────────────────────────────────────────────

export function useInfinitePostsByTicker(ticker: string) {
  return useInfiniteQuery({
    queryKey: [POSTS_KEY, 'ticker', ticker],
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as string | undefined;
      const params = new URLSearchParams({ ticker, limit: '20' });
      if (cursor) params.set('cursor', cursor);
      const response = await api.get<Post[]>(`/posts?${params.toString()}`);
      return response;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: ApiResponse<Post[]>) => {
      if (lastPage.meta?.has_more && lastPage.meta.cursor) {
        return lastPage.meta.cursor;
      }
      return undefined;
    },
    enabled: Boolean(ticker),
  });
}

// ─── Single Post ──────────────────────────────────────────────────────────────

export function usePost(id: string) {
  return useQuery({
    queryKey: [POSTS_KEY, id],
    queryFn: async () => {
      const response = await api.get<Post>(`/posts/${id}`);
      return response.data!;
    },
    enabled: Boolean(id),
  });
}

// ─── Create Post ──────────────────────────────────────────────────────────────

export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreatePostInput) => {
      const response = await api.post<Post>('/posts', data);
      return response.data!;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [POSTS_KEY] });
    },
  });
}

// ─── Update Post ──────────────────────────────────────────────────────────────

export function useUpdatePost(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdatePostInput) => {
      const response = await api.patch<Post>(`/posts/${id}`, data);
      return response.data!;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData([POSTS_KEY, id], updated);
      void queryClient.invalidateQueries({ queryKey: [POSTS_KEY, 'infinite'] });
    },
  });
}

// ─── Delete Post ──────────────────────────────────────────────────────────────

export function useDeletePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/posts/${id}`);
      return id;
    },
    onSuccess: (id) => {
      queryClient.removeQueries({ queryKey: [POSTS_KEY, id] });
      void queryClient.invalidateQueries({ queryKey: [POSTS_KEY, 'infinite'] });
    },
  });
}
