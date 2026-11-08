'use client';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { GroupCard } from '@/components/ui/GroupCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { SecondaryButton } from '@/components/ui/Buttons';
import { BackgroundRefreshError, PageError, PageLoading, queryErrorPresentation } from '@/components/ui/AsyncState';
import { api, messageForError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';

export default function GroupsPage() {
  const groupsQuery = useInfiniteQuery({
    queryKey: queryKeys.groups,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.groups.list(pageParam, 30),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const groups = groupsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const errorPresentation = queryErrorPresentation(groupsQuery.error, groupsQuery.data !== undefined);

  const header = (
    <AppHeader
      title="Groups"
      rightAction={<Link href="/groups/new" className="btn btn-primary btn-sm" style={{ gap: '4px' }}><Plus size={16} /> New</Link>}
    />
  );
  if (groupsQuery.isPending) return <>{header}<PageLoading label="Loading groups" /></>;
  if (errorPresentation === 'blocking') return <>{header}<PageError message={messageForError(groupsQuery.error)} retry={() => groupsQuery.refetch()} /></>;

  return (
    <>
      {header}
      <PageShell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '16px' }}>
          {errorPresentation === 'background' && (
            <BackgroundRefreshError
              retry={() => void groupsQuery.refetch()}
              isRetrying={groupsQuery.isFetching}
            />
          )}
          {groups.length === 0 ? (
            <EmptyState
              icon="👥"
              title="No groups yet"
              description="Create a group to start splitting expenses with friends"
              action={<Link href="/groups/new" className="btn btn-primary">Create Group</Link>}
            />
          ) : (
            <>
              {groups.map((group, i) => (
                <div key={group.id} className={`animate-slideUp stagger-${Math.min(i + 1, 5)}`}>
                  <GroupCard group={group} />
                </div>
              ))}
              {groupsQuery.hasNextPage && (
                <SecondaryButton fullWidth loading={groupsQuery.isFetchingNextPage} onClick={() => groupsQuery.fetchNextPage()}>
                  Load more
                </SecondaryButton>
              )}
            </>
          )}
        </div>
      </PageShell>
    </>
  );
}
