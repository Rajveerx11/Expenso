'use client';

import { useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { FormField, Input, Textarea } from '@/components/ui/FormField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { CategoryPicker } from '@/components/ui/CategoryPicker';
import { Avatar } from '@/components/ui/Avatar';
import { PrimaryButton } from '@/components/ui/Buttons';
import { SuccessOverlay } from '@/components/ui/SuccessOverlay';
import { BackgroundRefreshError, PageError, PageLoading, queryErrorPresentation } from '@/components/ui/AsyncState';
import {
  api,
  createIdempotencyKey,
  fieldErrorFor,
  fieldErrorsFor,
  focusFirstInvalidField,
  messageForError,
  type ApiFieldErrors,
  type GroupExpenseInput,
} from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import type { GroupMember, GroupSummary, Profile, SplitType } from '@/lib/types';
import { calculateEqualSplit, formatMoney, todayISO } from '@/lib/utils';
import { buildSharedExpenseInput } from '@/features/shared-expenses/domain';
import { createSubmissionKeyManager } from '@/features/idempotency/submission-key';

export default function AddGroupExpensePage() {
  const { groupId } = useParams<{ groupId: string }>();
  const groupQuery = useQuery({ queryKey: queryKeys.group(groupId), queryFn: () => api.groups.get(groupId), enabled: Boolean(groupId) });
  const membersQuery = useQuery({ queryKey: queryKeys.members(groupId), queryFn: () => api.groups.members(groupId), enabled: Boolean(groupId) });
  const profileQuery = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile.get });
  const header = <AppHeader title="Add Group Expense" showBack backHref={`/groups/${groupId}`} />;
  const pending = groupQuery.isPending || membersQuery.isPending || profileQuery.isPending;
  const requestError = groupQuery.error ?? membersQuery.error ?? profileQuery.error;
  const errorPresentation = queryErrorPresentation(
    requestError,
    groupQuery.data !== undefined && membersQuery.data !== undefined && profileQuery.data !== undefined,
  );
  const refetchAll = () => { void Promise.all([groupQuery.refetch(), membersQuery.refetch(), profileQuery.refetch()]); };

  if (pending) return <>{header}<PageLoading label="Loading group members" /></>;
  if (errorPresentation === 'blocking') return <>{header}<PageError message={messageForError(requestError)} retry={refetchAll} /></>;

  return (
    <GroupExpenseForm
      group={groupQuery.data!}
      members={membersQuery.data!}
      profile={profileQuery.data!}
      refreshWarning={errorPresentation === 'background'}
      retry={refetchAll}
      isRetrying={groupQuery.isFetching || membersQuery.isFetching || profileQuery.isFetching}
    />
  );
}

function GroupExpenseForm({
  group,
  members,
  profile,
  refreshWarning,
  retry,
  isRetrying,
}: {
  group: GroupSummary;
  members: GroupMember[];
  profile: Profile;
  refreshWarning: boolean;
  retry: () => void;
  isRetrying: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Other');
  const [date, setDate] = useState(todayISO());
  const [paidBy, setPaidBy] = useState(profile.id);
  const [splitType, setSplitType] = useState<Extract<SplitType, 'equal' | 'exact' | 'percentage'>>('equal');
  const [selectedMembers, setSelectedMembers] = useState(() => members.map((member) => member.userId));
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [success, setSuccess] = useState(false);
  const [createdExpenseId, setCreatedExpenseId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ApiFieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const keyManager = useRef(createSubmissionKeyManager(() => createIdempotencyKey(`group-expense:${group.id}`)));
  const createExpense = useMutation({
    mutationFn: (variables: { input: GroupExpenseInput; idempotencyKey: string }) => (
      api.groups.createExpense(group.id, variables.input, variables.idempotencyKey)
    ),
    retry: false,
  });

  const equalSplits = useMemo(() => amount && selectedMembers.length > 0 ? calculateEqualSplit(amount, selectedMembers) : {}, [amount, selectedMembers]);

  function toggleMember(userId: string) {
    setSelectedMembers((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
    clearFieldError('splits');
  }

  function clearFieldError(...keys: string[]) {
    setFieldErrors((current) => {
      const next = { ...current };
      keys.forEach((key) => delete next[key]);
      return next;
    });
  }

  function buildInput(): GroupExpenseInput | null {
    const result = buildSharedExpenseInput({
      paidBy, title, totalAmount: amount, category, expenseDate: date, note, splitType,
      memberIds: members.map((member) => member.userId), selectedMemberIds: selectedMembers,
      exactAmounts, percentages,
    });
    if (result.error) {
      setError(result.error);
      setFieldErrors({ [result.field]: [result.error] });
      focusFirstInvalidField(formRef.current);
    }
    return result.input;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setFieldErrors({});
    const input = buildInput();
    if (!input) return;
    try {
      const created = await createExpense.mutateAsync({
        input,
        idempotencyKey: keyManager.current.forSubmission(input),
      });
      setCreatedExpenseId(created.expense.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.groupExpenses(group.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.group(group.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.balances(group.id) }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['personal-expenses'] }),
        queryClient.invalidateQueries({ queryKey: ['personal-analytics'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.profile }),
      ]);
      setSuccess(true);
    } catch (requestError) {
      setError(messageForError(requestError));
      setFieldErrors(fieldErrorsFor(requestError));
      focusFirstInvalidField(formRef.current);
    }
  }

  const amountError = fieldErrorFor(fieldErrors, 'totalAmount', 'amount');
  const titleError = fieldErrorFor(fieldErrors, 'title');
  const categoryError = fieldErrorFor(fieldErrors, 'category');
  const dateError = fieldErrorFor(fieldErrors, 'expenseDate', 'date');
  const paidByError = fieldErrorFor(fieldErrors, 'paidBy');
  const splitTypeError = fieldErrorFor(fieldErrors, 'splitType');
  const splitsError = fieldErrorFor(fieldErrors, 'splits');
  const noteError = fieldErrorFor(fieldErrors, 'note');

  return (
    <>
      <AppHeader title="Add Group Expense" showBack backHref={`/groups/${group.id}`} />
      <PageShell>
        <form ref={formRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 16, paddingBottom: 32 }}>
          {refreshWarning && <BackgroundRefreshError retry={retry} isRetrying={isRetrying} />}
          <FormField label="Total Amount" htmlFor="group-expense-amount" messageId="group-expense-amount" error={amountError} required>
            <div style={{ position: 'relative' }}>
              <span aria-hidden="true" style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 20, fontWeight: 700, color: 'var(--color-primary-deep)' }}>₹</span>
              <input id="group-expense-amount" type="number" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={(event) => { setAmount(event.target.value); clearFieldError('totalAmount', 'amount'); }} className={`input ${amountError ? 'input-error' : ''}`} inputMode="decimal" aria-invalid={Boolean(amountError)} aria-describedby={amountError ? 'group-expense-amount-error' : undefined} style={{ paddingLeft: 36, fontSize: 24, fontWeight: 700, color: 'var(--color-primary-deep)' }} required />
            </div>
          </FormField>
          <FormField label="Title" error={titleError} required><Input placeholder="What was it for?" value={title} onChange={(event) => { setTitle(event.target.value); clearFieldError('title'); }} maxLength={120} error={Boolean(titleError)} required /></FormField>
          <FormField label="Category" error={categoryError}><div role="group" data-invalid={Boolean(categoryError)}><CategoryPicker selected={category} onChange={(value) => { setCategory(value); clearFieldError('category'); }} expenseOnly /></div></FormField>
          <FormField label="Date" error={dateError}><Input type="date" value={date} onChange={(event) => { setDate(event.target.value); clearFieldError('expenseDate', 'date'); }} error={Boolean(dateError)} max={todayISO()} required /></FormField>
          <FormField label="Paid By" error={paidByError}>
            <div className="scrollbar-hide" role="group" data-invalid={Boolean(paidByError)} style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {members.map((member) => (
                <button key={member.userId} type="button" onClick={() => { setPaidBy(member.userId); clearFieldError('paidBy'); }} aria-pressed={paidBy === member.userId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 14, flexShrink: 0, cursor: 'pointer', background: paidBy === member.userId ? 'var(--color-primary-lightest)' : 'var(--color-light)', border: paidBy === member.userId ? '2px solid var(--color-primary-medium)' : '2px solid transparent' }}>
                  <Avatar name={member.fullName} imageUrl={member.avatarUrl} size="sm" />
                  <span style={{ fontSize: 11, fontWeight: paidBy === member.userId ? 600 : 400, color: paidBy === member.userId ? 'var(--color-primary-deep)' : 'var(--color-dark)', maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.userId === profile.id ? 'You' : member.fullName.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </FormField>
          <FormField label="Split Type" error={splitTypeError}>
            <div role="group" data-invalid={Boolean(splitTypeError)}>
              <SegmentedControl value={splitType} onChange={(value) => { setSplitType(value as typeof splitType); clearFieldError('splitType', 'splits'); }} options={[{ value: 'equal', label: 'Equal' }, { value: 'exact', label: 'Exact' }, { value: 'percentage', label: '%' }]} />
            </div>
          </FormField>
          <FormField label="Split Details" error={splitsError}>
          <div className="card" data-invalid={Boolean(splitsError)} style={{ padding: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {members.map((member) => {
                const selected = selectedMembers.includes(member.userId);
                return (
                  <div key={member.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: splitType === 'equal' && !selected ? 0.5 : 1 }}>
                    {splitType === 'equal' && <input aria-label={`Include ${member.fullName}`} type="checkbox" checked={selected} onChange={() => toggleMember(member.userId)} style={{ width: 18, height: 18, accentColor: 'var(--color-primary-deep)' }} />}
                    <Avatar name={member.fullName} imageUrl={member.avatarUrl} size="xs" />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--color-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.fullName}</span>
                    {splitType === 'equal' && <span style={{ fontSize: 14, fontWeight: 700, color: selected ? 'var(--color-primary-deep)' : 'var(--color-medium)' }}>{selected && equalSplits[member.userId] ? formatMoney(equalSplits[member.userId]) : '—'}</span>}
                    {splitType === 'exact' && <Input aria-label={`${member.fullName} exact share`} type="number" min="0" step="0.01" placeholder="0.00" value={exactAmounts[member.userId] ?? ''} onChange={(event) => { setExactAmounts((current) => ({ ...current, [member.userId]: event.target.value })); clearFieldError('splits'); }} inputMode="decimal" style={{ width: 96, padding: '8px 10px', textAlign: 'right' }} />}
                    {splitType === 'percentage' && <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Input aria-label={`${member.fullName} percentage share`} type="number" min="0" max="100" step="0.0001" placeholder="0" value={percentages[member.userId] ?? ''} onChange={(event) => { setPercentages((current) => ({ ...current, [member.userId]: event.target.value })); clearFieldError('splits'); }} inputMode="decimal" style={{ width: 86, padding: '8px 10px', textAlign: 'right' }} /><span>%</span></div>}
                  </div>
                );
              })}
            </div>
          </div>
          </FormField>
          <FormField label="Note" error={noteError}><Textarea placeholder="Optional note..." value={note} onChange={(event) => { setNote(event.target.value); clearFieldError('note'); }} error={Boolean(noteError)} maxLength={500} /></FormField>
          {error && <p role="alert" style={{ color: 'var(--color-red)', fontSize: 13 }}>{error}</p>}
          <PrimaryButton type="submit" fullWidth size="lg" loading={createExpense.isPending}>Add Expense</PrimaryButton>
        </form>
      </PageShell>
      <SuccessOverlay show={success} message="Expense added!" onComplete={() => router.replace(createdExpenseId ? `/groups/${group.id}/expenses/${createdExpenseId}` : `/groups/${group.id}`)} />
    </>
  );
}
