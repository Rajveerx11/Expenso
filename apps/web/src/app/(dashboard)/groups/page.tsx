'use client';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { GroupCard } from '@/components/ui/GroupCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { PrimaryButton } from '@/components/ui/Buttons';
import { MOCK_GROUPS } from '@/lib/mockData';

export default function GroupsPage() {
  const groups = MOCK_GROUPS;

  return (
    <>
      <AppHeader
        title="Groups"
        rightAction={
          <Link href="/groups/new">
            <button className="btn btn-primary btn-sm" style={{ gap: '4px' }}>
              <Plus size={16} /> New
            </button>
          </Link>
        }
      />
      <PageShell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '16px' }}>
          {groups.length === 0 ? (
            <EmptyState
              icon="👥"
              title="No groups yet"
              description="Create a group to start splitting expenses with friends"
              action={<Link href="/groups/new"><PrimaryButton>Create Group</PrimaryButton></Link>}
            />
          ) : (
            groups.map((group, i) => (
              <div key={group.id} className={`animate-slideUp stagger-${Math.min(i + 1, 5)}`}>
                <GroupCard group={group} />
              </div>
            ))
          )}
        </div>
      </PageShell>
    </>
  );
}
