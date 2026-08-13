'use client';
import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { FormField, Input, Textarea } from '@/components/ui/FormField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { CategoryPicker } from '@/components/ui/CategoryPicker';
import { Avatar } from '@/components/ui/Avatar';
import { PrimaryButton } from '@/components/ui/Buttons';
import { SuccessOverlay } from '@/components/ui/SuccessOverlay';
import { calculateEqualSplit, formatMoney, todayISO } from '@/lib/utils';
import { MOCK_MEMBERS, MOCK_GROUPS } from '@/lib/mockData';

export default function AddGroupExpensePage() {
  const { groupId } = useParams<{ groupId: string }>();
  const router = useRouter();
  const group = MOCK_GROUPS.find(g => g.id === groupId) ?? MOCK_GROUPS[0];
  const members = MOCK_MEMBERS[groupId] ?? MOCK_MEMBERS['grp-001'];
  const currentUserId = 'usr-001-yuvraj';

  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Other');
  const [date, setDate] = useState(todayISO());
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [splitType, setSplitType] = useState('equal');
  const [selectedMembers, setSelectedMembers] = useState(members.map(m => m.userId));
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const equalSplits = useMemo(() => {
    if (!amount || selectedMembers.length === 0) return {};
    return calculateEqualSplit(amount, selectedMembers);
  }, [amount, selectedMembers]);

  function toggleMember(userId: string) {
    setSelectedMembers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // TODO: POST /api/v1/groups/{groupId}/expenses
    await new Promise(r => setTimeout(r, 900));
    setLoading(false);
    setSuccess(true);
  }

  return (
    <>
      <AppHeader title="Add Group Expense" showBack />
      <PageShell>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingTop: '16px', paddingBottom: '32px' }}>
          {/* Amount */}
          <FormField label="Total Amount" required>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '20px', fontWeight: 700, color: 'var(--color-primary-deep)' }}>₹</span>
              <input
                type="number" min="0.01" step="0.01" placeholder="0.00"
                value={amount} onChange={e => setAmount(e.target.value)}
                className="input" inputMode="decimal"
                style={{ paddingLeft: '36px', fontSize: '24px', fontWeight: 700, color: 'var(--color-primary-deep)' }}
                required
              />
            </div>
          </FormField>

          <FormField label="Title" required>
            <Input type="text" placeholder="What was it for?" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} required />
          </FormField>

          <FormField label="Category">
            <CategoryPicker selected={category} onChange={setCategory} expenseOnly />
          </FormField>

          <FormField label="Date">
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} max={todayISO()} />
          </FormField>

          {/* Paid By */}
          <FormField label="Paid By">
            <div className="scrollbar-hide" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
              {members.map(m => (
                <button
                  key={m.userId} type="button"
                  onClick={() => setPaidBy(m.userId)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                    padding: '10px 14px', borderRadius: '14px', flexShrink: 0, cursor: 'pointer',
                    background: paidBy === m.userId ? 'var(--color-primary-lightest)' : 'var(--color-light)',
                    border: paidBy === m.userId ? '2px solid var(--color-primary-medium)' : '2px solid transparent',
                    transition: 'all 0.1s',
                  }}
                >
                  <Avatar name={m.fullName} imageUrl={m.avatarUrl} size="sm" />
                  <span style={{ fontSize: '11px', fontWeight: paidBy === m.userId ? 600 : 400, color: paidBy === m.userId ? 'var(--color-primary-deep)' : 'var(--color-dark)', maxWidth: '60px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.fullName.split(' ')[0]}
                  </span>
                </button>
              ))}
            </div>
          </FormField>

          {/* Split Type */}
          <FormField label="Split Type">
            <SegmentedControl
              value={splitType}
              onChange={setSplitType}
              options={[
                { value: 'equal', label: 'Equal' },
                { value: 'exact', label: 'Exact' },
                { value: 'percentage', label: '%' },
              ]}
            />
          </FormField>

          {/* Split Preview */}
          <div className="card" style={{ padding: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-dark)', marginBottom: '12px' }}>Split Details</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {members.map(m => {
                const isSelected = selectedMembers.includes(m.userId);
                return (
                  <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: '10px', opacity: isSelected ? 1 : 0.4 }}>
                    {splitType === 'equal' && (
                      <input type="checkbox" checked={isSelected} onChange={() => toggleMember(m.userId)} style={{ width: 18, height: 18, accentColor: 'var(--color-primary-deep)', cursor: 'pointer', flexShrink: 0 }} />
                    )}
                    <Avatar name={m.fullName} imageUrl={m.avatarUrl} size="xs" />
                    <span style={{ flex: 1, fontSize: '14px', fontWeight: 500, color: 'var(--color-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.fullName}</span>
                    {splitType === 'equal' && (
                      <span style={{ fontSize: '14px', fontWeight: 700, color: isSelected ? 'var(--color-primary-deep)' : 'var(--color-medium)' }}>
                        {isSelected && equalSplits[m.userId] ? formatMoney(equalSplits[m.userId]) : '-'}
                      </span>
                    )}
                    {splitType === 'exact' && (
                      <input
                        type="number" min="0" step="0.01" placeholder="0.00"
                        value={exactAmounts[m.userId] ?? ''}
                        onChange={e => setExactAmounts(prev => ({ ...prev, [m.userId]: e.target.value }))}
                        className="input" inputMode="decimal"
                        style={{ width: '90px', padding: '8px 10px', fontSize: '14px', textAlign: 'right' }}
                      />
                    )}
                    {splitType === 'percentage' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                          type="number" min="0" max="100" step="0.01" placeholder="0"
                          value={percentages[m.userId] ?? ''}
                          onChange={e => setPercentages(prev => ({ ...prev, [m.userId]: e.target.value }))}
                          className="input" inputMode="decimal"
                          style={{ width: '70px', padding: '8px 10px', fontSize: '14px', textAlign: 'right' }}
                        />
                        <span style={{ fontSize: '14px', color: 'var(--color-medium)' }}>%</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <FormField label="Note">
            <Textarea placeholder="Optional note..." value={note} onChange={e => setNote(e.target.value)} maxLength={500} />
          </FormField>

          <PrimaryButton type="submit" fullWidth size="lg" loading={loading}>Add Expense</PrimaryButton>
        </form>
      </PageShell>
      <SuccessOverlay show={success} message="Expense added!" onComplete={() => router.back()} />
    </>
  );
}
