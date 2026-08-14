import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GroupMember, GroupSummary } from '@/lib/types';
import { AppError, mapDataError } from '@/server/http/errors';
import { getRateLimitSecret } from '@/server/config/env';

const GROUP_IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  created_by: string;
  default_currency: 'INR';
  simplified_debts: boolean;
  created_at: string;
  updated_at: string;
  member_count: string | number;
  current_user_balance: string | number;
  current_user_role: 'admin' | 'editor';
}

interface GroupMemberRow {
  membership_id: string;
  user_id: string;
  role: 'admin' | 'editor';
  joined_at: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  upi_id_available: boolean;
}

const cursorSchema = z.strictObject({
  v: z.literal(1),
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});

function money(value: string | number): string {
  return Number(value).toFixed(2);
}

function toGroup(row: GroupRow): GroupSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    createdBy: row.created_by,
    defaultCurrency: row.default_currency,
    simplifiedDebts: row.simplified_debts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    memberCount: Number(row.member_count),
    currentUserBalance: money(row.current_user_balance),
    currentUserRole: row.current_user_role,
  };
}

function toMember(row: GroupMemberRow): GroupMember {
  return {
    membershipId: row.membership_id,
    userId: row.user_id,
    role: row.role,
    joinedAt: row.joined_at,
    fullName: row.full_name,
    email: row.email,
    avatarUrl: row.avatar_url,
    upiIdAvailable: row.upi_id_available,
  };
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
    if (!parsed.success) throw new Error('invalid');
    return parsed.data;
  } catch {
    throw new AppError({ code: 'VALIDATION_ERROR', status: 422, fieldErrors: { cursor: ['Cursor is invalid.'] } });
  }
}

function encodeCursor(group: GroupSummary): string {
  return Buffer.from(JSON.stringify({ v: 1, createdAt: group.createdAt, id: group.id })).toString('base64url');
}

function mapGroupError(error: { code?: string; message?: string } | null): AppError {
  const message = error?.message ?? '';
  if (message.includes('already a group member')) return new AppError({ code: 'MEMBER_ALREADY_EXISTS', status: 409, cause: error });
  if (message.includes('No registered Expenso user')) return new AppError({ code: 'REGISTERED_USER_NOT_FOUND', status: 404, cause: error });
  if (message.includes('MEMBER_LOOKUP_RATE_LIMITED')) return new AppError({ code: 'RATE_LIMITED', status: 429, retryable: true, cause: error });
  if (message.includes('Member lookup authorization failed')) return new AppError({ code: 'DEPENDENCY_UNAVAILABLE', status: 503, retryable: true, cause: error });
  if (message.includes('balances before removing')) {
    return new AppError({ code: 'UNRESOLVED_MEMBER_DEBT', status: 409, cause: error });
  }
  if (message.includes('sole administrator') || message.includes('Transfer administration')) {
    return new AppError({ code: 'CONFLICT', status: 409, cause: error });
  }
  if (message.includes('pending settlements')) return new AppError({ code: 'PENDING_SETTLEMENT_EXISTS', status: 409, cause: error });
  if (message.includes('financial history')) return new AppError({ code: 'GROUP_HISTORY_RETAINED', status: 409, cause: error });
  return mapDataError(error);
}

export async function getGroup(client: SupabaseClient, groupId: string): Promise<GroupSummary> {
  const { data, error } = await client.rpc('get_group_summary', { group_id_param: groupId });
  if (error) throw mapGroupError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new AppError({ code: 'NOT_FOUND', status: 404 });
  return toGroup(row as GroupRow);
}

export async function listGroups(
  client: SupabaseClient,
  query: { cursor?: string; limit: number },
): Promise<{ groups: GroupSummary[]; nextCursor: string | null }> {
  const cursor = decodeCursor(query.cursor);
  const { data, error } = await client.rpc('list_group_summaries', {
    cursor_created_at_param: cursor?.createdAt ?? null,
    cursor_id_param: cursor?.id ?? null,
    limit_param: query.limit,
  });
  if (error) throw mapGroupError(error);
  const groups = ((data ?? []) as GroupRow[]).map(toGroup);
  const hasMore = groups.length > query.limit;
  if (hasMore) groups.pop();
  return { groups, nextCursor: hasMore && groups.length > 0 ? encodeCursor(groups.at(-1)!) : null };
}

export async function createGroup(
  client: SupabaseClient,
  input: { name: string; description?: string | null },
): Promise<GroupSummary> {
  const { data, error } = await client.rpc('create_group_with_admin', {
    name_param: input.name,
    description_param: input.description ?? null,
  });
  if (error || !data) throw mapGroupError(error);
  return getGroup(client, data as string);
}

export async function updateGroup(
  client: SupabaseClient,
  groupId: string,
  patch: { name?: string; description?: string | null; simplifiedDebts?: boolean },
): Promise<GroupSummary> {
  const dbPatch: Record<string, string | boolean | null> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.description !== undefined) dbPatch.description = patch.description;
  if (patch.simplifiedDebts !== undefined) dbPatch.simplified_debts = patch.simplifiedDebts;
  const { data, error } = await client.rpc('update_group_settings', { group_id_param: groupId, patch_param: dbPatch });
  if (error) throw mapGroupError(error);
  if (!data) throw new AppError({ code: 'NOT_FOUND', status: 404 });
  return getGroup(client, groupId);
}

export async function deleteGroup(client: SupabaseClient, groupId: string): Promise<void> {
  const { data, error } = await client.rpc('delete_group_safely', { group_id_param: groupId });
  if (error) throw mapGroupError(error);
  if (!data) throw new AppError({ code: 'NOT_FOUND', status: 404 });
}

export async function listMembers(client: SupabaseClient, groupId: string): Promise<GroupMember[]> {
  const { data, error } = await client.rpc('list_group_members', { group_id_param: groupId });
  if (error) throw mapGroupError(error);
  return ((data ?? []) as GroupMemberRow[]).map(toMember);
}

export async function addMember(client: SupabaseClient, groupId: string, email: string): Promise<GroupMember> {
  const { data: limitData, error: limitError } = await client.rpc('check_group_member_lookup_rate_limit', {
    secret_param: getRateLimitSecret(),
  });
  if (limitError) throw mapGroupError(limitError);
  const limit = Array.isArray(limitData) ? limitData[0] : limitData;
  if (!limit?.allowed) {
    throw new AppError({
      code: 'RATE_LIMITED',
      status: 429,
      retryable: true,
      retryAfterSeconds: Number(limit?.retry_after_seconds ?? 60),
    });
  }
  const { data, error } = await client.rpc('add_group_member_by_email', {
    group_id_param: groupId,
    email_param: email,
    secret_param: getRateLimitSecret(),
  });
  if (error || !data) throw mapGroupError(error);
  const member = (await listMembers(client, groupId)).find((entry) => entry.userId === data);
  if (!member) throw new AppError({ code: 'INTERNAL_ERROR', status: 500 });
  return member;
}

export async function removeMember(client: SupabaseClient, groupId: string, userId: string): Promise<void> {
  const { data, error } = await client.rpc('remove_group_member_safely', {
    group_id_param: groupId,
    member_id_param: userId,
  });
  if (error) throw mapGroupError(error);
  if (!data) throw new AppError({ code: 'NOT_FOUND', status: 404 });
}

export async function createGroupImageTicket(
  client: SupabaseClient,
  groupId: string,
  input: { contentType: string; sizeBytes: number },
) {
  await getGroup(client, groupId).then((group) => {
    if (group.currentUserRole !== 'admin') throw new AppError({ code: 'FORBIDDEN', status: 403 });
  });
  const extension = GROUP_IMAGE_TYPES.get(input.contentType);
  if (!extension || input.sizeBytes > MAX_IMAGE_BYTES) throw new AppError({ code: 'VALIDATION_ERROR', status: 422 });
  const path = `${groupId}/cover-${crypto.randomUUID()}.${extension}`;
  const { data, error } = await client.storage.from('group-images').createSignedUploadUrl(path, { upsert: false });
  if (error || !data) throw mapDataError(error, 'DEPENDENCY_UNAVAILABLE');
  return { bucket: 'group-images' as const, path, token: data.token, signedUrl: data.signedUrl, expiresIn: 7200 };
}

export async function completeGroupImage(client: SupabaseClient, groupId: string, path: string): Promise<GroupSummary> {
  const pattern = new RegExp(`^${groupId}/cover-[0-9a-f-]{36}\\.(jpg|png|webp)$`, 'i');
  if (!pattern.test(path)) throw new AppError({ code: 'FORBIDDEN', status: 403 });
  const filename = path.slice(path.indexOf('/') + 1);
  const { data: objects, error: listError } = await client.storage.from('group-images').list(groupId, { search: filename, limit: 10 });
  if (listError) throw mapDataError(listError, 'DEPENDENCY_UNAVAILABLE');
  const object = objects?.find((entry) => entry.name === filename);
  const metadata = object?.metadata as { size?: number; mimetype?: string } | null;
  if (!object) throw new AppError({ code: 'NOT_FOUND', status: 404 });
  if (!metadata?.size || metadata.size > MAX_IMAGE_BYTES || !metadata.mimetype || !GROUP_IMAGE_TYPES.has(metadata.mimetype)) {
    throw new AppError({ code: 'VALIDATION_ERROR', status: 422 });
  }
  const { data: publicData } = client.storage.from('group-images').getPublicUrl(path);
  const { data, error } = await client.rpc('attach_group_image', {
    group_id_param: groupId,
    path_param: path,
    public_url_param: publicData.publicUrl,
  });
  if (error) throw mapGroupError(error);
  if (!data) throw new AppError({ code: 'NOT_FOUND', status: 404 });
  return getGroup(client, groupId);
}
