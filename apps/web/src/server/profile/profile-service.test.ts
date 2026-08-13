import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/server/http/errors';
import { completeAvatarUpload, createAvatarUploadTicket, toProfile } from './profile-service';

describe('profile DTO mapping', () => {
  it('maps database fields and normalizes numeric money to strings', () => {
    expect(toProfile({
      id: '00000000-0000-4000-8000-000000000001',
      email: 'demo@example.com',
      full_name: 'Demo User',
      avatar_url: null,
      upi_id: null,
      total_income: 125,
      total_balance: '-5.5',
      created_at: '2026-08-14T00:00:00Z',
      updated_at: '2026-08-14T00:00:00Z',
    })).toMatchObject({
      fullName: 'Demo User',
      totalIncome: '125.00',
      totalBalance: '-5.50',
    });
  });
});

describe('avatar upload boundaries', () => {
  it('issues a path inside the authenticated user folder', async () => {
    const createSignedUploadUrl = async (path: string) => ({
      data: { path, token: 'upload-token', signedUrl: 'https://storage.example/upload' },
      error: null,
    });
    const client = {
      storage: { from: () => ({ createSignedUploadUrl }) },
    } as unknown as SupabaseClient;

    const ticket = await createAvatarUploadTicket(
      client,
      '00000000-0000-4000-8000-000000000001',
      { contentType: 'image/webp', sizeBytes: 2048 },
    );
    expect(ticket.path).toMatch(/^00000000-0000-4000-8000-000000000001\/avatar-[0-9a-f-]{36}\.webp$/);
  });

  it('rejects completion paths outside the authenticated user folder before storage access', async () => {
    const client = { storage: { from: () => { throw new Error('must not be reached'); } } } as unknown as SupabaseClient;
    await expect(completeAvatarUpload(
      client,
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002/avatar-00000000-0000-4000-8000-000000000003.webp',
    )).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 } satisfies Partial<AppError>);
  });
});
