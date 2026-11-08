'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  BellRing,
  CheckCheck,
  CircleCheck,
  CircleX,
  CreditCard,
  UserPlus,
  WalletCards,
} from 'lucide-react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { PageError, PageLoading } from '@/components/ui/AsyncState';
import { EmptyState } from '@/components/ui/EmptyState';
import { PrimaryButton, SecondaryButton } from '@/components/ui/Buttons';
import { api, messageForError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import type { AppNotification, NotificationType } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils';
import { PushNotificationCard } from '@/features/push/PushNotificationCard';
import {
  flattenNotifications,
  markEveryNotificationRead,
  markNotificationRead,
  safeNotificationHref,
  type NotificationFeed,
} from './cache';

const PAGE_SIZE = 50;

const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  expense_added: WalletCards,
  member_added: UserPlus,
  settlement_request: CreditCard,
  settlement_confirmed: CircleCheck,
  settlement_rejected: CircleX,
};

function NotificationRow({ notification, index, onRead }: {
  notification: AppNotification;
  index: number;
  onRead: (notificationId: string) => void;
}) {
  const Icon = TYPE_ICON[notification.type] ?? Bell;
  return (
    <Link
      href={safeNotificationHref(notification.href)}
      style={{ textDecoration: 'none' }}
      onClick={() => { if (!notification.isRead) onRead(notification.id); }}
      aria-label={`${notification.isRead ? '' : 'Unread: '}${notification.title}. ${notification.message}`}
    >
      <article
        className={`animate-slideUp stagger-${Math.min(index + 1, 5)}`}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '14px 16px',
          background: notification.isRead ? 'transparent' : 'var(--color-primary-lightest)',
          borderLeft: notification.isRead ? '3px solid transparent' : '3px solid var(--color-primary-deep)',
          borderBottom: '1px solid var(--color-light)',
          transition: 'background 0.1s',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: notification.isRead ? 'var(--color-light)' : 'var(--color-white)',
            color: 'var(--color-primary-deep)',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={19} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ fontSize: 14, fontWeight: notification.isRead ? 500 : 700, color: 'var(--color-black)', lineHeight: 1.35 }}>
              {notification.title}
            </p>
            {!notification.isRead && <span className="notif-dot" aria-hidden="true" style={{ marginTop: 5, flexShrink: 0 }} />}
          </div>
          <p style={{ fontSize: 13, color: 'var(--color-medium)', lineHeight: 1.5, marginTop: 3 }}>{notification.message}</p>
          <time dateTime={notification.createdAt} style={{ display: 'block', fontSize: 11, color: 'var(--color-medium)', marginTop: 5 }}>
            {formatRelativeTime(notification.createdAt)}
          </time>
        </div>
      </article>
    </Link>
  );
}

export function NotificationInbox() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const query = useInfiniteQuery({
    queryKey: queryKeys.notifications,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.notifications.list(pageParam, PAGE_SIZE),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

  const markRead = useMutation({
    mutationFn: api.notifications.read,
    onMutate: async (notificationId: string) => {
      setActionError(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications });
      const previous = queryClient.getQueryData<NotificationFeed>(queryKeys.notifications);
      queryClient.setQueryData<NotificationFeed>(
        queryKeys.notifications,
        (current) => markNotificationRead(current, notificationId),
      );
      return { previous };
    },
    onError: (error, _notificationId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.notifications, context.previous);
      setActionError(messageForError(error));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const markAll = useMutation({
    mutationFn: api.notifications.readAll,
    onMutate: async () => {
      setActionError(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications });
      const previous = queryClient.getQueryData<NotificationFeed>(queryKeys.notifications);
      queryClient.setQueryData<NotificationFeed>(
        queryKeys.notifications,
        (current) => markEveryNotificationRead(current),
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.notifications, context.previous);
      setActionError(messageForError(error));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const notifications = flattenNotifications(query.data);
  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  return (
    <>
      <AppHeader
        title="Notifications"
        subtitle={query.hasNextPage ? 'Recent updates' : unreadCount > 0 ? `${unreadCount} unread` : undefined}
        showBack
        backHref="/dashboard"
        rightAction={unreadCount > 0 ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
            style={{ gap: 4, fontSize: 13, color: 'var(--color-primary-deep)' }}
          >
            <CheckCheck size={16} aria-hidden="true" />
            {markAll.isPending ? 'Saving' : 'All read'}
          </button>
        ) : undefined}
      />
      <PageShell>
        <div style={{ display: 'grid', gap: 12, padding: '12px 0 24px' }}>
          <PushNotificationCard />
          {actionError && (
            <div role="alert" className="card" style={{ padding: '10px 12px', color: 'var(--color-red)', fontSize: 13 }}>
              {actionError}
            </div>
          )}
          {query.isPending ? (
            <PageLoading label="Loading notifications" />
          ) : query.isError && notifications.length === 0 ? (
            <PageError message={messageForError(query.error)} retry={() => void query.refetch()} />
          ) : notifications.length === 0 ? (
            <div className="card">
              <EmptyState
                icon="🔔"
                title="All caught up!"
                description="Group and payment updates appear here."
              />
            </div>
          ) : (
            <section className="card" aria-label="Notification inbox" style={{ overflow: 'hidden' }}>
              {notifications.map((notification, index) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  index={index}
                  onRead={(notificationId) => markRead.mutate(notificationId)}
                />
              ))}
              {query.hasNextPage && (
                <div style={{ padding: 14, display: 'grid', placeItems: 'center' }}>
                  <SecondaryButton
                    type="button"
                    size="sm"
                    loading={query.isFetchingNextPage}
                    onClick={() => void query.fetchNextPage()}
                  >
                    Load older
                  </SecondaryButton>
                </div>
              )}
            </section>
          )}
          {query.isError && notifications.length > 0 && (
            <div role="alert" className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <BellRing size={18} aria-hidden="true" style={{ color: 'var(--color-red)' }} />
              <span style={{ flex: 1, color: 'var(--color-medium)', fontSize: 13 }}>Couldn&apos;t refresh updates.</span>
              <PrimaryButton type="button" size="sm" onClick={() => void query.refetch()}>Retry</PrimaryButton>
            </div>
          )}
        </div>
      </PageShell>
    </>
  );
}
