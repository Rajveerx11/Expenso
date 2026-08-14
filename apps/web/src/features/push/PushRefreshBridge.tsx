'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api/queries';
import { isPushRefreshMessage } from './browser';

export const PUSH_REFRESH_QUERY_PREFIXES = [
  queryKeys.notifications,
  ['dashboard'],
  queryKeys.profile,
  ['groups'],
  ['group'],
  ['group-members'],
  ['group-expenses'],
  ['group-expense'],
  ['group-balances'],
  ['group-settlements'],
  ['group-settlement'],
  ['personal-expenses'],
  ['personal-expense'],
  ['personal-analytics'],
] as const;

export const LIVE_REFRESH_INTERVAL_MS = 15_000;

export function shouldRunLiveRefresh(visibilityState: DocumentVisibilityState, online: boolean): boolean {
  return visibilityState !== 'hidden' && online;
}

export async function invalidatePushQueries(queryClient: Pick<ReturnType<typeof useQueryClient>, 'invalidateQueries'>) {
  await Promise.all(PUSH_REFRESH_QUERY_PREFIXES.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function PushRefreshBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const refresh = (event: MessageEvent<unknown>) => {
      if (!isPushRefreshMessage(event.data)) return;
      void invalidatePushQueries(queryClient);
    };
    navigator.serviceWorker.addEventListener('message', refresh);
    return () => navigator.serviceWorker.removeEventListener('message', refresh);
  }, [queryClient]);

  useEffect(() => {
    let refreshing = false;
    const refresh = () => {
      if (refreshing || !shouldRunLiveRefresh(document.visibilityState, navigator.onLine)) return;
      refreshing = true;
      void invalidatePushQueries(queryClient).finally(() => { refreshing = false; });
    };
    const visibilityRefresh = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const interval = window.setInterval(refresh, LIVE_REFRESH_INTERVAL_MS);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', visibilityRefresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', visibilityRefresh);
    };
  }, [queryClient]);

  return null;
}
