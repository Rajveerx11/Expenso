'use client';
import { Crown, Trash2 } from 'lucide-react';
import { Avatar } from './Avatar';
import type { GroupMember } from '@/lib/types';

interface MemberRowProps {
  member: GroupMember;
  isCurrentUser: boolean;
  isAdminView: boolean;
  isSoleAdmin: boolean;
  onRemove?: (member: GroupMember) => void;
}

export function MemberRow({ member, isCurrentUser, isAdminView, isSoleAdmin, onRemove }: MemberRowProps) {
  const canRemove = isAdminView && !isCurrentUser && !(member.role === 'admin' && isSoleAdmin);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0' }}>
      <Avatar name={member.fullName} imageUrl={member.avatarUrl} size="sm" />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {member.fullName}
          </span>
          {isCurrentUser && <span className="chip chip-primary" style={{ fontSize: '10px', padding: '2px 7px' }}>You</span>}
          {member.role === 'admin' && <Crown size={12} color="var(--color-amber)" />}
        </div>
        <span style={{ fontSize: '12px', color: 'var(--color-medium)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {member.email}
        </span>
      </div>
      <span style={{ fontSize: '12px', color: 'var(--color-medium)', textTransform: 'capitalize', flexShrink: 0 }}>{member.role}</span>
      {canRemove && (
        <button
          className="btn btn-ghost btn-icon"
          style={{ color: 'var(--color-red)', width: 36, height: 36 }}
          onClick={() => onRemove?.(member)}
          aria-label={`Remove ${member.fullName}`}
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}
