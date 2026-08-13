'use client';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { Avatar } from './Avatar';
import { BalanceChip } from './BalanceChip';
import type { GroupSummary } from '@/lib/types';

interface GroupCardProps {
  group: GroupSummary;
}

export function GroupCard({ group }: GroupCardProps) {
  return (
    <Link href={`/groups/${group.id}`} style={{ textDecoration: 'none' }}>
      <div className="card card-hover" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Group Avatar */}
        <div style={{
          width: 52, height: 52, borderRadius: '16px', flexShrink: 0, overflow: 'hidden',
          background: 'linear-gradient(135deg, var(--color-primary-lightest), var(--color-primary-container))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {group.imageUrl
            ? <img src={group.imageUrl} alt={group.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: '22px' }}>👥</span>
          }
        </div>

        {/* Info */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {group.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
            <Users size={12} color="var(--color-medium)" />
            <span style={{ fontSize: '12px', color: 'var(--color-medium)' }}>{group.memberCount} members</span>
          </div>
        </div>

        {/* Balance */}
        <BalanceChip balance={group.currentUserBalance} />
      </div>
    </Link>
  );
}
