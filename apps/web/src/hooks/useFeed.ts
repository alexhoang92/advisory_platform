import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useInfinitePosts, type FeedFilter } from './usePosts';
import type { Post, SocialHearingItem } from '@hamilton/shared';
import { useMemo } from 'react';

export type FeedItem =
  | { item_type: 'post'; data: Post }
  | SocialHearingItem;

interface RecentCallRaw {
  id: number;
  kol_handle: string;
  display_name: string;
  ticker: string;
  direction: string;
  conviction: string | null;
  target_price: number | null;
  posted_at: string | null;
}

function useRecentKolCalls() {
  return useQuery({
    queryKey: ['kol-recent-calls-feed'],
    queryFn: async () => {
      const res = await api.get<RecentCallRaw[]>('/kol/recent-calls?limit=20');
      return res.data ?? [];
    },
    staleTime: 2 * 60 * 1000, // 2 min
  });
}

function useFollowedKolRecs() {
  return useQuery({
    queryKey: ['kol-followed-recommendations'],
    queryFn: async () => {
      const res = await api.get<SocialHearingItem[]>('/kol-profiles/followed-recommendations?limit=5');
      return res.data ?? [];
    },
    staleTime: 2 * 60 * 1000,
  });
}

export function useFeed(filter: FeedFilter = 'latest') {
  const postsResult = useInfinitePosts(filter);
  const recentCallsResult = useRecentKolCalls();
  const followedRecsResult = useFollowedKolRecs();

  const allPosts = postsResult.data?.pages.flatMap((p) => p.data ?? []) ?? [];

  const feedItems = useMemo<FeedItem[]>(() => {
    const postItems: FeedItem[] = allPosts.map((p) => ({ item_type: 'post', data: p }));

    let socialItems: SocialHearingItem[] = [];

    if (filter === 'latest' && recentCallsResult.data) {
      socialItems = recentCallsResult.data.map((call) => ({
        item_type: 'social_hearing' as const,
        ...call,
        kol_profile: {
          id: '',
          twitter_handle: call.kol_handle,
          display_name: call.display_name,
          avatar_url: null,
          status: 'unclaimed',
          kol_followers_count: 0,
        },
      }));
    } else if (filter === 'followed' && followedRecsResult.data) {
      socialItems = followedRecsResult.data;
    }

    // Merge and sort by timestamp desc
    const combined: FeedItem[] = [...postItems, ...socialItems];
    combined.sort((a, b) => {
      const dateA =
        a.item_type === 'post'
          ? new Date(a.data.created_at).getTime()
          : a.posted_at
            ? new Date(a.posted_at).getTime()
            : 0;
      const dateB =
        b.item_type === 'post'
          ? new Date(b.data.created_at).getTime()
          : b.posted_at
            ? new Date(b.posted_at).getTime()
            : 0;
      return dateB - dateA;
    });

    return combined;
  }, [allPosts, filter, recentCallsResult.data, followedRecsResult.data]);

  return {
    feedItems,
    isLoading: postsResult.isLoading,
    isError: postsResult.isError,
    hasNextPage: postsResult.hasNextPage,
    isFetchingNextPage: postsResult.isFetchingNextPage,
    fetchNextPage: postsResult.fetchNextPage,
    refetch: postsResult.refetch,
    isEmptyFollowed:
      filter === 'followed' &&
      postsResult.data?.pages[0]?.meta?.empty_followed === true &&
      (!followedRecsResult.data || followedRecsResult.data.length === 0),
  };
}
