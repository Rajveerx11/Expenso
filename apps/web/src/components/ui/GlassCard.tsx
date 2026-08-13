'use client';
import { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  padding?: boolean;
  onClick?: () => void;
  role?: string;
}

export function GlassCard({ children, className = '', padding = true, onClick, role }: GlassCardProps) {
  return (
    <div
      className={`glass ${padding ? '' : ''} ${className}`}
      style={{
        borderRadius: 'var(--radius-lg)',
        padding: padding ? '20px' : undefined,
        cursor: onClick ? 'pointer' : undefined,
      }}
      onClick={onClick}
      role={role}
    >
      {children}
    </div>
  );
}

export function Card({ children, className = '', padding = true, onClick }: GlassCardProps) {
  return (
    <div
      className={`card ${onClick ? 'card-hover' : ''} ${className}`}
      style={{ padding: padding ? '16px' : undefined, cursor: onClick ? 'pointer' : undefined }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
