import type { InfiniteData } from '@tanstack/react-query';
import type { AppNotification } from '@/lib/types';
import type { Page } from '@/lib/api/client';

export type NotificationFeed = InfiniteData<Page<AppNotification>>;

export function flattenNotifications(data: NotificationFeed | undefined): AppNotification[] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}

function updateNotifications(
  data: NotificationFeed | undefined,
  update: (notification: AppNotification) => AppNotification,
): NotificationFeed | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map(update),
    })),
  };
}

export function markNotificationRead(
  data: NotificationFeed | undefined,
  notificationId: string,
): NotificationFeed | undefined {
  return updateNotifications(data, (notification) => (
    notification.id === notificationId && !notification.isRead
      ? { ...notification, isRead: true }
      : notification
  ));
}

export function markEveryNotificationRead(data: NotificationFeed | undefined): NotificationFeed | undefined {
  return updateNotifications(data, (notification) => (
    notification.isRead ? notification : { ...notification, isRead: true }
  ));
}

export function safeNotificationHref(href: string): string {
  if (
    href === '/notifications'
    || /^\/groups\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/settlements\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/i.test(href)
  ) return href;
  return '/notifications';
}
