import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Settlement } from '@/lib/types';
import { AppError, mapDataError } from '@/server/http/errors';

interface SettlementRow {
  id: string;
  group_id: string;
  payer_id: string;
  payer_name: string;
  receiver_id: string;
  receiver_name: string;
  amount: string | number;
  status: Settlement['status'];
  transaction_ref: string | null;
  created_at: string;
  confirmed_at: string | null;
  can_respond: boolean;
}

const cursorSchema = z.strictObject({
  v: z.literal(1),
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});

function money(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new AppError({ code: 'INTERNAL_ERROR', status: 500 });
  return parsed.toFixed(2);
}

function pick(value: Record<string, unknown>, camel: string, snake: string): unknown {
  return value[camel] ?? value[snake];
}

export function normalizeSettlement(value: unknown): Settlement {
  const row = value as Record<string, unknown> | null;
  const status = row && pick(row, 'status', 'status');
  if (!row || !['pending_confirmation', 'confirmed', 'rejected'].includes(String(status))) {
    throw new AppError({ code: 'INTERNAL_ERROR', status: 500 });
  }
  return {
    id: String(pick(row, 'id', 'id')),
    groupId: String(pick(row, 'groupId', 'group_id')),
    payerId: String(pick(row, 'payerId', 'payer_id')),
    payerName: String(pick(row, 'payerName', 'payer_name')),
    receiverId: String(pick(row, 'receiverId', 'receiver_id')),
    receiverName: String(pick(row, 'receiverName', 'receiver_name')),
    amount: money(pick(row, 'amount', 'amount')),
    status: status as Settlement['status'],
    transactionRef: pick(row, 'transactionRef', 'transaction_ref') === null
      ? null : String(pick(row, 'transactionRef', 'transaction_ref')),
    createdAt: String(pick(row, 'createdAt', 'created_at')),
    confirmedAt: pick(row, 'confirmedAt', 'confirmed_at') === null
      ? null : String(pick(row, 'confirmedAt', 'confirmed_at')),
    canRespond: pick(row, 'canRespond', 'can_respond') === true,
  };
}

function mapSettlementError(error: { code?: string; message?: string } | null): AppError {
  const message = error?.message ?? '';
  if (message.includes('IDEMPOTENCY_KEY_REUSED')) return new AppError({ code: 'IDEMPOTENCY_KEY_REUSED', status: 409, cause: error });
  if (message.includes('IDEMPOTENCY_KEY_REQUIRED')) return new AppError({ code: 'IDEMPOTENCY_KEY_REQUIRED', status: 428, cause: error });
  if (message.includes('PENDING_SETTLEMENT_EXISTS') || error?.code === '23505') {
    return new AppError({ code: 'PENDING_SETTLEMENT_EXISTS', status: 409, cause: error });
  }
  if (message.includes('SETTLEMENT_EXCEEDS_BALANCE')) return new AppError({ code: 'SETTLEMENT_EXCEEDS_BALANCE', status: 409, cause: error });
  if (message.includes('SETTLEMENT_CHANGED')) return new AppError({ code: 'SETTLEMENT_CHANGED', status: 409, cause: error });
  return mapDataError(error, 'DEPENDENCY_UNAVAILABLE');
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

function encodeCursor(settlement: Settlement): string {
  return Buffer.from(JSON.stringify({ v: 1, createdAt: settlement.createdAt, id: settlement.id })).toString('base64url');
}

export async function listSettlements(client: SupabaseClient, groupId: string, query: { cursor?: string; limit: number }) {
  const cursor = decodeCursor(query.cursor);
  const { data, error } = await client.rpc('list_group_settlements_web', {
    group_id_param: groupId,
    cursor_created_at_param: cursor?.createdAt ?? null,
    cursor_id_param: cursor?.id ?? null,
    limit_param: query.limit,
  });
  if (error) throw mapSettlementError(error);
  const settlements = ((data ?? []) as SettlementRow[]).map(normalizeSettlement);
  const hasMore = settlements.length > query.limit;
  if (hasMore) settlements.pop();
  return { settlements, nextCursor: hasMore && settlements.length ? encodeCursor(settlements.at(-1)!) : null };
}

export async function getSettlement(client: SupabaseClient, groupId: string, settlementId: string): Promise<Settlement> {
  const { data, error } = await client.rpc('get_group_settlement_web', {
    group_id_param: groupId, settlement_id_param: settlementId,
  });
  if (error) throw mapSettlementError(error);
  if (!data) throw new AppError({ code: 'NOT_FOUND', status: 404 });
  return normalizeSettlement(data);
}

export async function createSettlement(
  client: SupabaseClient,
  groupId: string,
  input: { receiverId: string; amount: string; transactionRef?: string | null },
  idempotencyKey: string,
): Promise<{ settlement: Settlement; replayed: boolean }> {
  const { data, error } = await client.rpc('create_group_settlement_web', {
    group_id_param: groupId,
    receiver_id_param: input.receiverId,
    amount_param: input.amount,
    transaction_ref_param: input.transactionRef ?? null,
    idempotency_key_param: idempotencyKey,
  });
  if (error) throw mapSettlementError(error);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.response) throw new AppError({ code: 'INTERNAL_ERROR', status: 500 });
  return { settlement: normalizeSettlement(result.response), replayed: result.replayed === true };
}

async function respond(client: SupabaseClient, action: 'confirm' | 'reject', groupId: string, settlementId: string) {
  const { data, error } = await client.rpc(`${action}_group_settlement_web`, {
    group_id_param: groupId, settlement_id_param: settlementId,
  });
  if (error) throw mapSettlementError(error);
  if (!data) throw new AppError({ code: 'NOT_FOUND', status: 404 });
  return normalizeSettlement(data);
}

export const confirmSettlement = (client: SupabaseClient, groupId: string, settlementId: string) =>
  respond(client, 'confirm', groupId, settlementId);
export const rejectSettlement = (client: SupabaseClient, groupId: string, settlementId: string) =>
  respond(client, 'reject', groupId, settlementId);
