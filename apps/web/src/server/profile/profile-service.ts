import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from '@/lib/types';
import { AppError, mapDataError } from '@/server/http/errors';

const PROFILE_SELECT = 'id,email,full_name,avatar_url,upi_id,total_income,total_balance,created_at,updated_at';
const ALLOWED_AVATAR_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  upi_id: string | null;
  total_income: string | number;
  total_balance: string | number;
  created_at: string;
  updated_at: string;
}

function money(value: string | number): string {
  return Number(value).toFixed(2);
}

export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    upiId: row.upi_id,
    totalIncome: money(row.total_income),
    totalBalance: money(row.total_balance),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getProfile(client: SupabaseClient, userId: string): Promise<Profile> {
  const { data, error } = await client
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .single();
  if (error || !data) throw mapDataError(error);
  return toProfile(data as ProfileRow);
}

export async function updateProfile(
  client: SupabaseClient,
  userId: string,
  patch: { fullName?: string; upiId?: string | null },
): Promise<Profile> {
  const update: Record<string, string | null> = {};
  if (patch.fullName !== undefined) update.full_name = patch.fullName;
  if (patch.upiId !== undefined) update.upi_id = patch.upiId;

  const { data, error } = await client
    .from('profiles')
    .update(update)
    .eq('id', userId)
    .select(PROFILE_SELECT)
    .single();
  if (error || !data) throw mapDataError(error);
  return toProfile(data as ProfileRow);
}

export async function createAvatarUploadTicket(
  client: SupabaseClient,
  userId: string,
  input: { contentType: string; sizeBytes: number },
) {
  const extension = ALLOWED_AVATAR_TYPES.get(input.contentType);
  if (!extension || input.sizeBytes > MAX_AVATAR_BYTES) {
    throw new AppError({ code: 'VALIDATION_ERROR', status: 422 });
  }

  const path = `${userId}/avatar-${crypto.randomUUID()}.${extension}`;
  const { data, error } = await client.storage
    .from('avatars')
    .createSignedUploadUrl(path, { upsert: false });
  if (error || !data) throw mapDataError(error, 'DEPENDENCY_UNAVAILABLE');

  return {
    bucket: 'avatars' as const,
    path,
    token: data.token,
    signedUrl: data.signedUrl,
    expiresIn: 7200,
  };
}

export async function completeAvatarUpload(
  client: SupabaseClient,
  userId: string,
  path: string,
): Promise<Profile> {
  const escapedUserId = userId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pathPattern = new RegExp(`^${escapedUserId}/avatar-[0-9a-f-]{36}\\.(jpg|png|webp)$`, 'i');
  if (!pathPattern.test(path)) {
    throw new AppError({ code: 'FORBIDDEN', status: 403 });
  }

  const filename = path.slice(path.indexOf('/') + 1);
  const { data: objects, error: listError } = await client.storage
    .from('avatars')
    .list(userId, { search: filename, limit: 10 });
  if (listError) throw mapDataError(listError, 'DEPENDENCY_UNAVAILABLE');
  const object = objects?.find((entry) => entry.name === filename);
  if (!object) throw new AppError({ code: 'NOT_FOUND', status: 404 });

  const metadata = object.metadata as { size?: number; mimetype?: string } | null;
  if (!metadata?.size || metadata.size > MAX_AVATAR_BYTES || !metadata.mimetype || !ALLOWED_AVATAR_TYPES.has(metadata.mimetype)) {
    throw new AppError({ code: 'VALIDATION_ERROR', status: 422 });
  }

  const { data: publicUrlData } = client.storage.from('avatars').getPublicUrl(path);
  const { data, error } = await client
    .from('profiles')
    .update({ avatar_url: publicUrlData.publicUrl })
    .eq('id', userId)
    .select(PROFILE_SELECT)
    .single();
  if (error || !data) throw mapDataError(error);
  return toProfile(data as ProfileRow);
}
