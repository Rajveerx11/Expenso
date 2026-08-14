import { describe, expect, it } from 'vitest';
import type { AppNotification } from '@/lib/types';
import type { NotificationFeed } from './cache';
import {
  flattenNotifications,
  markEveryNotificationRead,
  markNotificationRead,
  safeNotificationHref,
} from './cache';

const firstId = '00000000-0000-4000-8000-000000000001';
const secondId = '00000000-0000-4000-8000-000000000002';
const groupId = '00000000-0000-4000-8000-000000000003';
const settlementId = '00000000-0000-4000-8000-000000000004';

function notification(id: string, isRead: boolean): AppNotification {
  return {
    id,
    type: 'expense_added',
    title: `Notification ${id}`,
    message: 'Changed',
    groupId,
    relatedId: null,
    href: `/groups/${groupId}`,
    isRead,
    createdAt: '2026-08-14T00:00:00.000Z',
  };
}

const feed: NotificationFeed = {
  pages: [
    { items: [notification(firstId, false)], nextCursor: 'next' },
    { items: [notification(secondId, false)], nextCursor: null },
  ],
  pageParams: [undefined, 'next'],
};

describe('notification cache helpers', () => {
  it('flattens pages in server order', () => {
    expect(flattenNotifications(feed).map((item) => item.id)).toEqual([firstId, secondId]);
  });

  it('marks one item without mutating the prior cache', () => {
    const updated = markNotificationRead(feed, secondId);
    expect(flattenNotifications(updated).map((item) => item.isRead)).toEqual([false, true]);
    expect(flattenNotifications(feed).map((item) => item.isRead)).toEqual([false, false]);
  });

  it('marks every loaded page read', () => {
    expect(flattenNotifications(markEveryNotificationRead(feed)).every((item) => item.isRead)).toBe(true);
  });

  it('accepts only backend-supported relative destinations', () => {
    expect(safeNotificationHref(`/groups/${groupId}`)).toBe(`/groups/${groupId}`);
    expect(safeNotificationHref(`/groups/${groupId}/settlements/${settlementId}`))
      .toBe(`/groups/${groupId}/settlements/${settlementId}`);
    expect(safeNotificationHref('//evil.example')).toBe('/notifications');
    expect(safeNotificationHref('/groups/not-a-uuid')).toBe('/notifications');
    expect(safeNotificationHref('\\evil.example')).toBe('/notifications');
  });
});
