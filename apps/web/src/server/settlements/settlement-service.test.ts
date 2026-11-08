import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/server/http/errors';
import { createSettlement, getSettlement, listSettlements } from './settlement-service';

const settlement = {
  id: '00000000-0000-4000-8000-000000000003', groupId: '00000000-0000-4000-8000-000000000001',
  payerId: '00000000-0000-4000-8000-000000000004', payerName: 'Payer',
  receiverId: '00000000-0000-4000-8000-000000000005', receiverName: 'Receiver', amount: '5.00',
  status: 'pending_confirmation', transactionRef: null, createdAt: '2026-08-14T00:00:00Z', confirmedAt: null, canRespond: false,
};

describe('settlement service', () => {
  it('creates and replays DB-owned canonical settlement requests', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ response: settlement, replayed: false }], error: null });
    const result = await createSettlement({ rpc } as unknown as SupabaseClient, settlement.groupId, {
      receiverId: settlement.receiverId, amount: '5.00', transactionRef: null,
    }, 'settlement-create-0001');
    expect(result.settlement.amount).toBe('5.00');
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('request_hash_param');
  });

  it('hides absent detail and rejects corrupt cursors', async () => {
    const missing = { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) } as unknown as SupabaseClient;
    await expect(getSettlement(missing, settlement.groupId, settlement.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(listSettlements(missing, settlement.groupId, { cursor: 'bad', limit: 30 }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it.each([
    ['IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_KEY_REUSED'],
    ['PENDING_SETTLEMENT_EXISTS', 'PENDING_SETTLEMENT_EXISTS'],
    ['SETTLEMENT_EXCEEDS_BALANCE', 'SETTLEMENT_EXCEEDS_BALANCE'],
    ['SETTLEMENT_CHANGED', 'SETTLEMENT_CHANGED'],
  ])('maps %s to stable %s', async (message, code) => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: '22023', message } }) } as unknown as SupabaseClient;
    await expect(createSettlement(client, settlement.groupId, {
      receiverId: settlement.receiverId, amount: '5.00',
    }, 'settlement-create-0001')).rejects.toSatisfy((error: AppError) => error.code === code && error.status === 409);
  });
});
