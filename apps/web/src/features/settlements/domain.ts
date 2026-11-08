import type { GroupBalance, Settlement } from '@/lib/types';
export { createSubmissionKeyManager } from '@/features/idempotency/submission-key';
export type { SubmissionKeyManager } from '@/features/idempotency/submission-key';

export function flattenPagedItems<T>(pages: Array<{ items: T[] }>): T[] {
  return pages.flatMap((page) => page.items);
}

export type UpiHandoffState = 'idle' | 'launching' | 'away' | 'returned' | 'completed';
export type UpiHandoffEvent = 'launch' | 'leave' | 'return' | 'show-prompt' | 'complete' | 'cancel';

export function nextUpiHandoffState(state: UpiHandoffState, event: UpiHandoffEvent): UpiHandoffState {
  if (event === 'launch') return 'launching';
  if (event === 'show-prompt') return 'returned';
  if (event === 'cancel') return 'idle';
  if (event === 'leave') return state === 'launching' ? 'away' : state;
  if (event === 'return') return state === 'launching' || state === 'away' ? 'returned' : state;
  if (event === 'complete') return state === 'returned' ? 'completed' : state;
  return state;
}

const MONEY_INPUT = /^\d{1,10}(?:\.\d{1,2})?$/;

export interface SettlementClaimInput {
  receiverId: string;
  amount: string;
  transactionRef?: string | null;
}

export interface SettlementClaimValidation {
  amount?: string;
  transactionRef?: string;
  acknowledgement?: string;
}

function unsignedMoneyToCents(value: string): bigint | null {
  if (!MONEY_INPUT.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
}

function signedMoneyToCents(value: string): bigint | null {
  const negative = value.startsWith('-');
  const cents = unsignedMoneyToCents(negative ? value.slice(1) : value);
  if (cents === null) return null;
  return negative ? -cents : cents;
}

export function normalizeSettlementAmount(value: string): string | null {
  const trimmed = value.trim();
  const cents = unsignedMoneyToCents(trimmed);
  if (cents === null || cents <= BigInt(0)) return null;
  return `${cents / BigInt(100)}.${(cents % BigInt(100)).toString().padStart(2, '0')}`;
}

export function payableBalanceFor(
  balances: GroupBalance[],
  receiverId: string,
): GroupBalance | null {
  const balance = balances.find((entry) => entry.userId === receiverId);
  if (!balance || balance.direction !== 'you_owe') return null;
  const cents = signedMoneyToCents(balance.balance);
  return cents !== null && cents < BigInt(0) ? balance : null;
}

export function outstandingAmount(balance: GroupBalance): string {
  const cents = signedMoneyToCents(balance.balance);
  if (cents === null || cents >= BigInt(0)) return '0.00';
  const absolute = -cents;
  return `${absolute / BigInt(100)}.${(absolute % BigInt(100)).toString().padStart(2, '0')}`;
}

export function validateSettlementClaim(options: {
  amount: string;
  maximumAmount: string;
  transactionRef: string;
  acknowledged?: boolean;
  requireAcknowledgement?: boolean;
}): SettlementClaimValidation {
  const errors: SettlementClaimValidation = {};
  const normalizedAmount = normalizeSettlementAmount(options.amount);
  const maximumCents = unsignedMoneyToCents(options.maximumAmount);

  if (!normalizedAmount) {
    errors.amount = 'Enter a positive amount with no more than two decimal places.';
  } else {
    const amountCents = unsignedMoneyToCents(normalizedAmount)!;
    if (maximumCents === null || amountCents > maximumCents) {
      errors.amount = 'Amount cannot exceed your latest outstanding balance.';
    }
  }

  if (options.transactionRef.trim().length > 200) {
    errors.transactionRef = 'Reference must be 200 characters or fewer.';
  }
  if (options.requireAcknowledgement && !options.acknowledged) {
    errors.acknowledgement = 'Confirm that the payment was sent before submitting this claim.';
  }
  return errors;
}

export function claimInput(options: {
  receiverId: string;
  amount: string;
  transactionRef: string;
  correlationRef?: string;
}): SettlementClaimInput {
  const normalizedAmount = normalizeSettlementAmount(options.amount);
  if (!normalizedAmount) throw new Error('Settlement amount must be validated first.');
  const reference = options.transactionRef.trim() || options.correlationRef?.trim() || null;
  return {
    receiverId: options.receiverId,
    amount: normalizedAmount,
    transactionRef: reference,
  };
}

export function settlementsForUser(settlements: Settlement[], userId: string): Settlement[] {
  return settlements.filter((settlement) => (
    settlement.payerId === userId || settlement.receiverId === userId
  ));
}

interface SettlementPage {
  items: Settlement[];
  nextCursor: string | null;
}

export async function findPendingSettlementAcrossPages(
  fetchPage: (cursor?: string) => Promise<SettlementPage>,
  payerId: string,
  receiverId: string,
): Promise<Settlement | null> {
  let cursor: string | undefined;
  const visitedCursors = new Set<string>();

  while (true) {
    const page = await fetchPage(cursor);
    const pending = page.items.find((settlement) => (
      settlement.payerId === payerId
      && settlement.receiverId === receiverId
      && settlement.status === 'pending_confirmation'
    ));
    if (pending) return pending;
    if (!page.nextCursor) return null;
    if (visitedCursors.has(page.nextCursor)) {
      throw new Error('Settlement pagination returned a repeated cursor.');
    }
    visitedCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}

export function conflictCopy(code?: string): string {
  if (code === 'SETTLEMENT_EXCEEDS_BALANCE') {
    return 'Your balance changed. Latest amount loaded; review it before trying again.';
  }
  if (code === 'PENDING_SETTLEMENT_EXISTS') {
    return 'A payment claim is already awaiting confirmation. Latest settlement history loaded.';
  }
  return 'This settlement changed while you were reviewing it. Latest status loaded.';
}
