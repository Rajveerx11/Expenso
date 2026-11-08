'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { findPendingSettlementAcrossPages } from '@/features/settlements/domain';

export function useGroupSettlementOverview(groupId: string) {
  const profile = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile.get });
  const group = useQuery({ queryKey: queryKeys.group(groupId), queryFn: () => api.groups.get(groupId), enabled: Boolean(groupId) });
  const members = useQuery({ queryKey: queryKeys.members(groupId), queryFn: () => api.groups.members(groupId), enabled: Boolean(groupId) });
  const expenses = useInfiniteQuery({
    queryKey: queryKeys.groupExpenses(groupId),
    queryFn: ({ pageParam }) => api.groups.expenses(groupId, pageParam || undefined, 30),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(groupId),
  });
  const balances = useQuery({ queryKey: queryKeys.balances(groupId), queryFn: () => api.groups.balances(groupId), enabled: Boolean(groupId) });
  const settlements = useInfiniteQuery({
    queryKey: queryKeys.settlements(groupId),
    queryFn: ({ pageParam }) => api.groups.settlements(groupId, pageParam || undefined, 30),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(groupId),
  });
  const queries = [profile, group, members, expenses, balances, settlements];
  return {
    profile,
    group,
    members,
    expenses,
    balances,
    settlements,
    isPending: queries.some((query) => query.isPending),
    error: queries.find((query) => query.error)?.error ?? null,
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
  };
}

export function useSettleUpData(groupId: string, receiverId: string) {
  const profile = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile.get });
  const group = useQuery({ queryKey: queryKeys.group(groupId), queryFn: () => api.groups.get(groupId), enabled: Boolean(groupId) });
  const members = useQuery({ queryKey: queryKeys.members(groupId), queryFn: () => api.groups.members(groupId), enabled: Boolean(groupId) });
  const balances = useQuery({ queryKey: queryKeys.balances(groupId), queryFn: () => api.groups.balances(groupId), enabled: Boolean(groupId) });
  const pendingSettlement = useQuery({
    queryKey: [...queryKeys.settlements(groupId), 'pending', profile.data?.id ?? '', receiverId],
    queryFn: () => findPendingSettlementAcrossPages(
      (cursor) => api.groups.settlements(groupId, cursor, 30),
      profile.data!.id,
      receiverId,
    ),
    enabled: Boolean(groupId && receiverId && profile.data?.id),
  });
  const queries = [profile, group, members, balances, pendingSettlement];
  return {
    profile,
    group,
    members,
    balances,
    pendingSettlement,
    isPending: queries.some((query) => query.isPending),
    isFetching: queries.some((query) => query.isFetching),
    error: queries.find((query) => query.error)?.error ?? null,
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
    refetchBalancesAndSettlements: () => Promise.all([
      balances.refetch(), pendingSettlement.refetch(), group.refetch(),
    ]),
  };
}

export function useSettlementDetailData(groupId: string, settlementId: string) {
  const profile = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile.get });
  const group = useQuery({ queryKey: queryKeys.group(groupId), queryFn: () => api.groups.get(groupId), enabled: Boolean(groupId) });
  const balances = useQuery({ queryKey: queryKeys.balances(groupId), queryFn: () => api.groups.balances(groupId), enabled: Boolean(groupId) });
  const settlement = useQuery({
    queryKey: queryKeys.settlement(groupId, settlementId),
    queryFn: () => api.groups.settlement(groupId, settlementId),
    enabled: Boolean(groupId && settlementId),
  });
  const queries = [profile, group, balances, settlement];
  return {
    profile,
    group,
    balances,
    settlement,
    isPending: queries.some((query) => query.isPending),
    isFetching: queries.some((query) => query.isFetching),
    error: queries.find((query) => query.error)?.error ?? null,
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
  };
}
