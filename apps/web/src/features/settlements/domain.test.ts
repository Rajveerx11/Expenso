import { describe, expect, it, vi } from 'vitest';
import type { GroupBalance, Settlement } from '@/lib/types';
import {
  claimInput,
  conflictCopy,
  createSubmissionKeyManager,
  findPendingSettlementAcrossPages,
  flattenPagedItems,
  nextUpiHandoffState,
  normalizeSettlementAmount,
  outstandingAmount,
  payableBalanceFor,
  settlementsForUser,
  validateSettlementClaim,
} from './domain';

const payable: GroupBalance = {
  userId: '00000000-0000-4000-8000-000000000002',
  userName: 'Receiver',
  userAvatarUrl: null,
  userUpiId: 'receiver@upi',
  balance: '-125.50',
  direction: 'you_owe',
};

describe('settlement claim domain', () => {
  it('prompts only after an explicit UPI launch returns and never infers completion', () => {
    expect(nextUpiHandoffState('idle', 'return')).toBe('idle');
    expect(nextUpiHandoffState('idle', 'launch')).toBe('launching');
    expect(nextUpiHandoffState('launching', 'leave')).toBe('away');
    expect(nextUpiHandoffState('away', 'return')).toBe('returned');
    expect(nextUpiHandoffState('returned', 'return')).toBe('returned');
    expect(nextUpiHandoffState('returned', 'complete')).toBe('completed');
  });

  it('handles a cancelled or unavailable UPI app without marking payment complete', () => {
    expect(nextUpiHandoffState('launching', 'return')).toBe('returned');
    expect(nextUpiHandoffState('returned', 'cancel')).toBe('idle');
    expect(nextUpiHandoffState('idle', 'complete')).toBe('idle');
    expect(nextUpiHandoffState('idle', 'show-prompt')).toBe('returned');
  });

  it('normalizes exact decimal input without floating-point arithmetic', () => {
    expect(normalizeSettlementAmount('001.2')).toBe('1.20');
    expect(normalizeSettlementAmount('0')).toBeNull();
    expect(normalizeSettlementAmount('1e2')).toBeNull();
    expect(normalizeSettlementAmount('1.234')).toBeNull();
  });

  it('only exposes negative you_owe balances as payable', () => {
    expect(payableBalanceFor([payable], payable.userId)).toEqual(payable);
    expect(outstandingAmount(payable)).toBe('125.50');
    expect(payableBalanceFor([{ ...payable, direction: 'owes_you', balance: '125.50' }], payable.userId)).toBeNull();
  });

  it('rejects overpayment, long references, and missing acknowledgement', () => {
    expect(validateSettlementClaim({
      amount: '125.51',
      maximumAmount: '125.50',
      transactionRef: 'x'.repeat(201),
      acknowledged: false,
      requireAcknowledgement: true,
    })).toEqual({
      amount: 'Amount cannot exceed your latest outstanding balance.',
      transactionRef: 'Reference must be 200 characters or fewer.',
      acknowledgement: 'Confirm that the payment was sent before submitting this claim.',
    });
  });

  it('uses correlation reference only when user reference is blank', () => {
    expect(claimInput({ receiverId: payable.userId, amount: '20', transactionRef: ' ', correlationRef: 'EXPENSO-1' }))
      .toEqual({ receiverId: payable.userId, amount: '20.00', transactionRef: 'EXPENSO-1' });
  });

  it('keeps one idempotency key for an identical retry and rotates for changed input', () => {
    const factory = vi.fn()
      .mockReturnValueOnce('settlement:key-1')
      .mockReturnValueOnce('settlement:key-2');
    const manager = createSubmissionKeyManager(factory);
    const first = { receiverId: payable.userId, amount: '20.00', transactionRef: null };
    expect(manager.forClaim(first)).toBe('settlement:key-1');
    expect(manager.forClaim({ ...first })).toBe('settlement:key-1');
    expect(manager.forClaim({ ...first, amount: '21.00' })).toBe('settlement:key-2');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('filters history to the current user and supplies actionable conflict copy', () => {
    const settlement = (id: string, payerId: string, receiverId: string): Settlement => ({
      id, groupId: '00000000-0000-4000-8000-000000000010', payerId, payerName: 'Payer', receiverId,
      receiverName: 'Receiver', amount: '10.00', status: 'pending_confirmation', transactionRef: null,
      createdAt: '2026-08-14T00:00:00Z', confirmedAt: null, canRespond: false,
    });
    const mine = settlement('00000000-0000-4000-8000-000000000011', 'me', 'other');
    expect(settlementsForUser([mine, settlement('00000000-0000-4000-8000-000000000012', 'a', 'b')], 'me')).toEqual([mine]);
    expect(conflictCopy('PENDING_SETTLEMENT_EXISTS')).toContain('already awaiting confirmation');
  });

  it('keeps every item when history spans multiple backend pages', () => {
    const first = Array.from({ length: 30 }, (_, index) => `expense-${index}`);
    const second = Array.from({ length: 8 }, (_, index) => `expense-${index + 30}`);

    expect(flattenPagedItems([{ items: first }, { items: second }])).toEqual([...first, ...second]);
  });

  it('finds a targeted pending claim beyond the first 30 settlement records', async () => {
    const settlement = (id: string, status: Settlement['status'] = 'confirmed'): Settlement => ({
      id,
      groupId: '00000000-0000-4000-8000-000000000010',
      payerId: 'payer',
      payerName: 'Payer',
      receiverId: 'receiver',
      receiverName: 'Receiver',
      amount: '10.00',
      status,
      transactionRef: null,
      createdAt: '2026-08-14T00:00:00Z',
      confirmedAt: status === 'confirmed' ? '2026-08-14T00:01:00Z' : null,
      canRespond: false,
    });
    const firstPage = Array.from({ length: 30 }, (_, index) => settlement(`history-${index}`));
    const pending = settlement('pending-on-page-2', 'pending_confirmation');
    const fetchPage = vi.fn(async (cursor?: string) => {
      if (!cursor) return { items: firstPage, nextCursor: 'page-2' };
      if (cursor === 'page-2') return { items: [pending], nextCursor: 'page-3' };
      throw new Error(`Unexpected cursor: ${cursor}`);
    });

    await expect(findPendingSettlementAcrossPages(fetchPage, 'payer', 'receiver')).resolves.toEqual(pending);
    expect(fetchPage).toHaveBeenNthCalledWith(1, undefined);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 'page-2');
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('blocks settlement creation when pagination returns a repeated cursor', async () => {
    const fetchPage = vi.fn(async () => ({ items: [], nextCursor: 'same-page' }));

    await expect(findPendingSettlementAcrossPages(fetchPage, 'payer', 'receiver'))
      .rejects.toThrow('Settlement pagination returned a repeated cursor.');
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});
