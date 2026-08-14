import { describe, expect, it } from 'vitest';
import { shouldShowMobileBottomNav } from './mobile-navigation';

const id = '00000000-0000-4000-8000-000000000001';

describe('mobile bottom navigation routing', () => {
  it.each(['/dashboard', '/expenses', '/groups', `/groups/${id}`, '/notifications', '/profile'])('stays visible on %s', (path) => {
    expect(shouldShowMobileBottomNav(path)).toBe(true);
  });

  it.each([
    '/expenses/new', `/expenses/${id}`, '/groups/new', `/groups/${id}/settings`,
    `/groups/${id}/expenses/new`, `/groups/${id}/expenses/${id}`, `/groups/${id}/settle/${id}`,
    `/groups/${id}/settlements/${id}`, '/profile/edit',
  ])('stays hidden during focused flow %s', (path) => {
    expect(shouldShowMobileBottomNav(path)).toBe(false);
  });
});
