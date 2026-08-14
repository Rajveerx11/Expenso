import { describe, expect, it } from 'vitest';
import { LIVE_REFRESH_INTERVAL_MS, PUSH_REFRESH_QUERY_PREFIXES, shouldRunLiveRefresh } from './PushRefreshBridge';

describe('authenticated live refresh fallback', () => {
  it('polls only while visible and online', () => {
    expect(LIVE_REFRESH_INTERVAL_MS).toBe(15_000);
    expect(shouldRunLiveRefresh('visible', true)).toBe(true);
    expect(shouldRunLiveRefresh('hidden', true)).toBe(false);
    expect(shouldRunLiveRefresh('visible', false)).toBe(false);
  });

  it('covers inbox, dashboard, group, settlement, and personal caches', () => {
    expect(PUSH_REFRESH_QUERY_PREFIXES).toEqual(expect.arrayContaining([
      ['notifications'], ['dashboard'], ['group-balances'], ['group-settlement'], ['personal-expenses'],
    ]));
  });
});
