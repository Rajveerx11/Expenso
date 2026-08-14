// ============================================================
// Utility Functions — Expenso
// ============================================================

// ─── Money Formatting (INR) ─────────────────────────────────
const INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCompactInr(value: number): string {
  const units = [
    { threshold: 10_000_000, suffix: 'Cr' },
    { threshold: 100_000, suffix: 'L' },
    { threshold: 1_000, suffix: 'K' },
  ] as const;
  const unit = units.find(({ threshold }) => value >= threshold);
  const scaled = unit ? value / unit.threshold : value;
  const rounded = (Math.round(scaled * 10) / 10).toFixed(1).replace(/\.0$/, '');
  return `₹${rounded}${unit?.suffix ?? ''}`;
}

export function formatMoney(amount: string | number, compact = false): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '₹0.00';
  return compact ? formatCompactInr(Math.abs(num)) : INR_FORMATTER.format(Math.abs(num));
}

export function formatMoneyRaw(amount: string | number): number {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return isNaN(num) ? 0 : num;
}

export function isPositive(amount: string | number): boolean {
  return formatMoneyRaw(amount) > 0;
}

export function isNegative(amount: string | number): boolean {
  return formatMoneyRaw(amount) < 0;
}

export function isZero(amount: string | number): boolean {
  return formatMoneyRaw(amount) === 0;
}

export function moneySign(amount: string | number): 'positive' | 'negative' | 'zero' {
  const n = formatMoneyRaw(amount);
  if (n > 0) return 'positive';
  if (n < 0) return 'negative';
  return 'zero';
}

// ─── Date Formatting ─────────────────────────────────────────
function parseDisplayDate(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  return match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(dateStr);
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = parseDisplayDate(dateStr);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateShort(dateStr: string): string {
  if (!dateStr) return '';
  const date = parseDisplayDate(dateStr);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

export function formatDateTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDateShort(dateStr);
}

export function todayISO(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(monthStr: string): string {
  if (!monthStr) return '';
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function prevMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-').map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function nextMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-').map(Number);
  const date = new Date(year, month, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Name Utilities ──────────────────────────────────────────
export function getInitials(name: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0]?.toUpperCase() ?? '')
    .join('');
}

export function getFirstName(name: string): string {
  return name?.split(' ')[0] ?? name;
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── Class Utility ───────────────────────────────────────────
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ─── UPI URI Builder ─────────────────────────────────────────
export function buildUPIUri(params: {
  receiverUpiId: string;
  receiverName: string;
  amount: string;
  groupName: string;
  correlationRef: string;
}): string {
  const { receiverUpiId, receiverName, amount, groupName, correlationRef } = params;
  const tn = encodeURIComponent(`Expenso settlement for ${groupName}`);
  const pn = encodeURIComponent(receiverName);
  const tr = encodeURIComponent(correlationRef);
  return `upi://pay?pa=${receiverUpiId}&pn=${pn}&am=${amount}&cu=INR&tr=${tr}&tn=${tn}`;
}

// ─── Split Calculation ───────────────────────────────────────
// Equal split with largest-remainder allocation (blueprint §11.2)
export function calculateEqualSplit(totalAmount: string, memberIds: string[]): Record<string, string> {
  if (memberIds.length === 0) return {};
  const totalCents = Math.round(parseFloat(totalAmount) * 100);
  const baseCents = Math.floor(totalCents / memberIds.length);
  const remainder = totalCents - baseCents * memberIds.length;

  // Sort for determinism
  const sorted = [...memberIds].sort();
  const result: Record<string, string> = {};

  sorted.forEach((id, i) => {
    const cents = baseCents + (i < remainder ? 1 : 0);
    result[id] = (cents / 100).toFixed(2);
  });

  return result;
}

// ─── Percentage to money ─────────────────────────────────────
export function percentageToAmount(percentage: number, total: string): string {
  const totalCents = Math.round(parseFloat(total) * 100);
  const cents = Math.round((percentage / 100) * totalCents);
  return (cents / 100).toFixed(2);
}

// ─── Balance Text ─────────────────────────────────────────────
export function getBalanceText(balance: string): string {
  const n = parseFloat(balance);
  if (n > 0) return `You are owed ${formatMoney(balance)}`;
  if (n < 0) return `You owe ${formatMoney(Math.abs(n))}`;
  return 'Settled up';
}

// ─── Validation ──────────────────────────────────────────────
export function isValidUPI(upi: string): boolean {
  return /^[\w.\-_]+@[a-zA-Z]+$/.test(upi.trim());
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidAmount(amount: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(amount.trim()) && parseFloat(amount) > 0;
}

// ─── Avatar Color ─────────────────────────────────────────────
export const AVATAR_COLORS = [
  '#4338CA', '#6D28D9', '#BE185D', '#B91C1C',
  '#92400E', '#047857', '#0369A1', '#0E7490',
];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
