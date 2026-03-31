import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Post, PostReply, CreatePostInput, UpdatePostInput, ApiResponse } from '@hamilton/shared';

const POSTS_KEY = 'posts';

// ─── Infinite Feed ────────────────────────────────────────────────────────────

export type FeedFilter = 'latest' | 'followed' | 'trending';

export function useInfinitePosts(filter: FeedFilter = 'latest') {
  return useInfiniteQuery({
    queryKey: [POSTS_KEY, 'infinite', filter],
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as string | undefined;
      const params = new URLSearchParams({ limit: '20', filter });
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

// ─── Like Post ────────────────────────────────────────────────────────────────

export function useLikePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string) => {
      const response = await api.post<{ liked: boolean; count: number }>(`/posts/${postId}/like`);
      return { postId, ...response.data! };
    },
    onSuccess: ({ postId, liked, count }) => {
      queryClient.setQueriesData<InfiniteData<ApiResponse<Post[]>>>(
        { queryKey: [POSTS_KEY, 'infinite'], exact: false },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data?.map((p) =>
                p.id === postId ? { ...p, user_liked: liked, likes_count: count } : p,
              ) ?? null,
            })),
          };
        },
      );
      queryClient.setQueryData<Post>([POSTS_KEY, postId], (old) =>
        old ? { ...old, user_liked: liked, likes_count: count } : old,
      );
    },
  });
}

// ─── Save Post ────────────────────────────────────────────────────────────────

export function useSavePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string) => {
      const response = await api.post<{ saved: boolean; count: number }>(`/posts/${postId}/save`);
      return { postId, ...response.data! };
    },
    onSuccess: ({ postId, saved, count }) => {
      queryClient.setQueriesData<InfiniteData<ApiResponse<Post[]>>>(
        { queryKey: [POSTS_KEY, 'infinite'], exact: false },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data?.map((p) =>
                p.id === postId ? { ...p, user_saved: saved, saves_count: count } : p,
              ) ?? null,
            })),
          };
        },
      );
      queryClient.setQueryData<Post>([POSTS_KEY, postId], (old) =>
        old ? { ...old, user_saved: saved, saves_count: count } : old,
      );
    },
  });
}

// ─── Replies ─────────────────────────────────────────────────────────────────

export function useReplies(postId: string) {
  return useQuery({
    queryKey: [POSTS_KEY, postId, 'replies'],
    queryFn: async () => {
      const response = await api.get<PostReply[]>(`/posts/${postId}/replies`);
      return response.data ?? [];
    },
    enabled: Boolean(postId),
  });
}

export function useCreateReply(postId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: string) => {
      const response = await api.post<PostReply>(`/posts/${postId}/replies`, { body });
      return response.data!;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [POSTS_KEY, postId, 'replies'] });
      queryClient.setQueriesData<InfiniteData<ApiResponse<Post[]>>>(
        { queryKey: [POSTS_KEY, 'infinite'], exact: false },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data?.map((p) =>
                p.id === postId ? { ...p, replies_count: (p.replies_count ?? 0) + 1 } : p,
              ) ?? null,
            })),
          };
        },
      );
      queryClient.setQueryData<Post>([POSTS_KEY, postId], (old) =>
        old ? { ...old, replies_count: (old.replies_count ?? 0) + 1 } : old,
      );
    },
  });
}

export function useDeleteReply(postId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (replyId: string) => {
      await api.delete(`/posts/${postId}/replies/${replyId}`);
      return replyId;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [POSTS_KEY, postId, 'replies'] });
      queryClient.setQueriesData<InfiniteData<ApiResponse<Post[]>>>(
        { queryKey: [POSTS_KEY, 'infinite'], exact: false },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data?.map((p) =>
                p.id === postId ? { ...p, replies_count: Math.max(0, (p.replies_count ?? 1) - 1) } : p,
              ) ?? null,
            })),
          };
        },
      );
    },
  });
}
