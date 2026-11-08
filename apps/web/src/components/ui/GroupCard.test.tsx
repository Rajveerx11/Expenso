import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { GroupSummary } from '@/lib/types';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('next/image', () => ({ default: ({ alt }: { alt: string }) => <span data-image aria-label={alt} /> }));

import { GroupCard } from './GroupCard';

const group: GroupSummary = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Goa Trip',
  description: 'Food, stays, and transport',
  imageUrl: null,
  createdBy: '00000000-0000-4000-8000-000000000002',
  defaultCurrency: 'INR',
  simplifiedDebts: true,
  createdAt: '2026-08-14T00:00:00.000Z',
  updatedAt: '2026-08-14T00:00:00.000Z',
  memberCount: 3,
  currentUserBalance: '125.50',
  currentUserRole: 'admin',
};

describe('GroupCard', () => {
  it('shows description and an explicit balance relationship', () => {
    const markup = renderToStaticMarkup(<GroupCard group={group} />);

    expect(markup).toContain('Food, stays, and transport');
    expect(markup).toContain('You are owed');
    expect(markup).toContain('₹125.50');
  });
});
