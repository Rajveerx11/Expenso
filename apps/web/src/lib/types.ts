// ============================================================
// Shared TypeScript Types — Expenso
// Matches blueprint section 10 exactly
// ============================================================

export type UUID = string;
export type ISODate = string;       // YYYY-MM-DD
export type ISODateTime = string;   // UTC ISO-8601
export type Money = string;         // /^\d{1,10}\.\d{2}$/
export type CurrencyCode = 'INR';

export type TransactionType = 'income' | 'expense';
export type GroupRole = 'admin' | 'editor';
export type SplitType = 'equal' | 'exact' | 'percentage';
export type SettlementStatus = 'pending_confirmation' | 'confirmed' | 'rejected';
export type NotificationType =
  | 'expense_added'
  | 'member_added'
  | 'settlement_request'
  | 'settlement_confirmed'
  | 'settlement_rejected';

export interface Profile {
  id: UUID;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  upiId: string | null;
  totalIncome: Money;
  totalBalance: Money;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface PersonalTransaction {
  id: UUID;
  title: string;
  amount: Money;
  category: string;
  type: TransactionType;
  note: string | null;
  sourceGroupExpenseId: UUID | null;
  expenseDate: ISODate;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  editable: boolean;
}

export interface Group {
  id: UUID;
  name: string;
  description: string | null;
  imageUrl: string | null;
  createdBy: UUID;
  defaultCurrency: CurrencyCode;
  simplifiedDebts: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface GroupSummary extends Group {
  memberCount: number;
  currentUserBalance: Money;
  currentUserRole: GroupRole;
}

export interface GroupMember {
  membershipId: UUID;
  userId: UUID;
  role: GroupRole;
  joinedAt: ISODateTime;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  upiIdAvailable: boolean;
}

export interface GroupExpense {
  id: UUID;
  groupId: UUID;
  paidBy: UUID;
  paidByName: string;
  title: string;
  totalAmount: Money;
  category: string;
  splitType: SplitType | 'shares';
  note: string | null;
  expenseDate: ISODate;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  canDelete: boolean;
}

export interface ExpenseSplit {
  id: UUID;
  expenseId: UUID;
  userId: UUID;
  userName: string;
  owedAmount: Money;
  settledAmount: Money;
  isSettled: boolean;
  settledAt: ISODateTime | null;
}

export interface GroupBalance {
  userId: UUID;
  userName: string;
  userAvatarUrl: string | null;
  userUpiId: string | null;
  balance: Money;
  direction: 'owes_you' | 'you_owe' | 'settled';
}

export interface Settlement {
  id: UUID;
  groupId: UUID;
  payerId: UUID;
  payerName: string;
  receiverId: UUID;
  receiverName: string;
  amount: Money;
  status: SettlementStatus;
  transactionRef: string | null;
  createdAt: ISODateTime;
  confirmedAt: ISODateTime | null;
  canRespond: boolean;
}

export interface AppNotification {
  id: UUID;
  type: NotificationType;
  title: string;
  message: string;
  groupId: UUID | null;
  relatedId: UUID | null;
  href: string;
  isRead: boolean;
  createdAt: ISODateTime;
}

export interface DashboardData {
  profile: Profile;
  month: string;
  monthlyIncome: Money;
  monthlyExpenses: Money;
  monthlyNet: Money;
  totalYouOwe: Money;
  totalOwedToYou: Money;
  pendingConfirmationCount: number;
  unreadNotificationCount: number;
  recentTransactions: PersonalTransaction[];
}

export interface Analytics {
  month: string;
  monthlyIncome: Money;
  monthlyExpenses: Money;
  monthlyNet: Money;
  lifetimeIncome: Money;
  lifetimeExpenses: Money;
  lifetimeNet: Money;
  categoryBreakdown: Array<{
    category: string;
    amount: Money;
    percentage: number;
  }>;
}

// ─── Category Definitions ────────────────────────────────────
export const CATEGORIES = [
  { id: 'Food', label: 'Food', emoji: '🍕', color: '#FF6B6B' },
  { id: 'Transport', label: 'Transport', emoji: '🚌', color: '#4ECDC4' },
  { id: 'Shopping', label: 'Shopping', emoji: '🛍️', color: '#FFE66D' },
  { id: 'Entertainment', label: 'Fun', emoji: '🎮', color: '#A8E6CF' },
  { id: 'Bills', label: 'Bills', emoji: '⚡', color: '#FFD93D' },
  { id: 'Health', label: 'Health', emoji: '💊', color: '#6BCB77' },
  { id: 'Education', label: 'Study', emoji: '📚', color: '#4D96FF' },
  { id: 'Travel', label: 'Travel', emoji: '✈️', color: '#C77DFF' },
  { id: 'Groceries', label: 'Groceries', emoji: '🛒', color: '#69B4B0' },
  { id: 'Rent', label: 'Rent', emoji: '🏠', color: '#F4A261' },
  { id: 'Salary', label: 'Salary', emoji: '💼', color: '#2EC4B6' },
  { id: 'Freelance', label: 'Freelance', emoji: '💻', color: '#E9C46A' },
  { id: 'Other', label: 'Other', emoji: '📦', color: '#9CA3AF' },
] as const;

export type CategoryId = typeof CATEGORIES[number]['id'];

export function getCategoryInfo(categoryId: string) {
  return CATEGORIES.find(c => c.id === categoryId) ?? CATEGORIES[CATEGORIES.length - 1];
}
