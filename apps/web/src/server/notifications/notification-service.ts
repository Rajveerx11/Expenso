import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppNotification, NotificationType, WebPushSubscriptionSummary } from '@/lib/types';
import { AppError, mapDataError } from '@/server/http/errors';

interface NotificationRow {
  id: string; type: NotificationType; title: string; message: string;
  group_id: string | null; related_id: string | null; href: string;
  is_read: boolean; created_at: string;
}

function mapNotificationError(error: { code?: string; message?: string } | null): AppError {
  if (error?.message?.includes('WEB_PUSH_SUBSCRIPTION_LIMIT')) {
    return new AppError({ code: 'RATE_LIMITED', status: 429, cause: error });
  }
  if (error?.message?.includes('WEB_PUSH_ENDPOINT_BUSY') || error?.code === '40001') {
    return new AppError({ code: 'CONFLICT', status: 409, retryable: true, cause: error });
  }
  return mapDataError(error, 'DEPENDENCY_UNAVAILABLE');
}

const cursorSchema = z.strictObject({ v: z.literal(1), createdAt: z.iso.datetime({ offset: true }), id: z.uuid() });

function safeHref(value: unknown): string {
  const href = String(value ?? '');
  if (/^\/groups\/[0-9a-f-]{36}(?:\/settlements\/[0-9a-f-]{36})?$/i.test(href) || href === '/notifications') return href;
  return '/notifications';
}

function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id, type: row.type, title: row.title, message: row.message,
    groupId: row.group_id, relatedId: row.related_id, href: safeHref(row.href),
    isRead: row.is_read, createdAt: row.created_at,
  };
}

function decodeCursor(value?: string) {
  if (!value) return null;
  try {
    const result = cursorSchema.safeParse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (!result.success) throw new Error('invalid');
    return result.data;
  } catch {
    throw new AppError({ code: 'VALIDATION_ERROR', status: 422, fieldErrors: { cursor: ['Cursor is invalid.'] } });
  }
}

function encodeCursor(value: AppNotification): string {
  return Buffer.from(JSON.stringify({ v: 1, createdAt: value.createdAt, id: value.id })).toString('base64url');
}

export async function listNotifications(client: SupabaseClient, query: { cursor?: string; limit: number }) {
  const cursor = decodeCursor(query.cursor);
  const { data, error } = await client.rpc('list_notifications_web', {
    cursor_created_at_param: cursor?.createdAt ?? null,
    cursor_id_param: cursor?.id ?? null,
    limit_param: query.limit,
  });
  if (error) throw mapNotificationError(error);
  const notifications = ((data ?? []) as NotificationRow[]).map(toNotification);
  const hasMore = notifications.length > query.limit;
  if (hasMore) notifications.pop();
  return { notifications, nextCursor: hasMore && notifications.length ? encodeCursor(notifications.at(-1)!) : null };
}

export async function markNotificationRead(client: SupabaseClient, notificationId: string): Promise<void> {
  const { data, error } = await client.rpc('mark_notification_read_web', { notification_id_param: notificationId });
  if (error) throw mapNotificationError(error);
  if (!data) throw new AppError({ code: 'NOT_FOUND', status: 404 });
}

export async function markAllNotificationsRead(client: SupabaseClient): Promise<number> {
  const { data, error } = await client.rpc('mark_all_notifications_read_web');
  if (error) throw mapNotificationError(error);
  return Number(data ?? 0);
}

interface SubscriptionInput {
  endpoint: string; expirationTime: number | null;
  keys: { p256dh: string; auth: string }; userAgent?: string | null;
}

function subscriptionSummary(value: unknown): WebPushSubscriptionSummary {
  const row = value as Record<string, unknown> | null;
  if (!row?.id) throw new AppError({ code: 'INTERNAL_ERROR', status: 500 });
  const expiration = row.expirationTime ?? row.expiration_time;
  const expirationTime = expiration === null || expiration === undefined
    ? null : new Date(String(expiration)).getTime();
  return {
    id: String(row.id), expirationTime,
    userAgent: row.userAgent === null || row.user_agent === null ? null : String(row.userAgent ?? row.user_agent),
    createdAt: String(row.createdAt ?? row.created_at),
    lastSuccessAt: row.lastSuccessAt === null || row.last_success_at === null
      ? null : String(row.lastSuccessAt ?? row.last_success_at),
  };
}

export async function upsertWebPushSubscription(client: SupabaseClient, input: SubscriptionInput) {
  const expiration = input.expirationTime === null ? null : new Date(input.expirationTime).toISOString();
  const { data, error } = await client.rpc('upsert_web_push_subscription', {
    endpoint_param: input.endpoint,
    p256dh_param: input.keys.p256dh,
    auth_param: input.keys.auth,
    expiration_time_param: expiration,
    user_agent_param: input.userAgent ?? null,
  });
  if (error) throw mapNotificationError(error);
  return subscriptionSummary(Array.isArray(data) ? data[0] : data);
}

export async function disableWebPushSubscription(client: SupabaseClient, subscriptionId: string): Promise<void> {
  const { data, error } = await client.rpc('disable_web_push_subscription', { subscription_id_param: subscriptionId });
  if (error) throw mapNotificationError(error);
  if (!data) throw new AppError({ code: 'NOT_FOUND', status: 404 });
}
