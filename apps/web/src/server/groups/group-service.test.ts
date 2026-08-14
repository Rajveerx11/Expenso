import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addMember } from './group-service';

const originalEnv = { ...process.env };
const groupId = '00000000-0000-4000-8000-000000000201';
const userId = '00000000-0000-4000-8000-000000000202';

beforeEach(() => {
  process.env.RATE_LIMIT_SECRET = 'abcdefghijklmnopqrstuvwxyz123456';
});
afterEach(() => { process.env = { ...originalEnv }; });

describe('group member lookup protection', () => {
  it('commits a durable limit check before the secret-mediated exact lookup', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null })
      .mockResolvedValueOnce({ data: userId, error: null })
      .mockResolvedValueOnce({ data: [{
        membership_id: '00000000-0000-4000-8000-000000000203', user_id: userId,
        role: 'editor', joined_at: '2026-08-14T00:00:00Z', full_name: 'Member',
        email: 'member@example.com', avatar_url: null, upi_id_available: false,
      }], error: null });
    const member = await addMember({ rpc } as unknown as SupabaseClient, groupId, 'member@example.com');
    expect(member.userId).toBe(userId);
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      'check_group_member_lookup_rate_limit', 'add_group_member_by_email', 'list_group_members',
    ]);
    expect(rpc.mock.calls[1][1]).toMatchObject({ secret_param: 'abcdefghijklmnopqrstuvwxyz123456' });
  });

  it('returns stable 429 before exact lookup after the durable limit', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ allowed: false, retry_after_seconds: 120 }], error: null });
    await expect(addMember({ rpc } as unknown as SupabaseClient, groupId, 'probe@example.com'))
      .rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429, retryAfterSeconds: 120 });
    expect(rpc).toHaveBeenCalledOnce();
  });
});
