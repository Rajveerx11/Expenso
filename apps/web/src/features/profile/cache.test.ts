import { describe, expect, it, vi } from 'vitest';
import { PROFILE_DEPENDENT_QUERY_PREFIXES, refreshProfileDependentQueries } from './cache';

describe('profile-dependent cache refresh', () => {
  it('refreshes every denormalized group identity surface', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);

    await refreshProfileDependentQueries({ invalidateQueries });

    for (const queryKey of PROFILE_DEPENDENT_QUERY_PREFIXES) {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey });
    }
    expect(PROFILE_DEPENDENT_QUERY_PREFIXES).toEqual(expect.arrayContaining([
      ['group-members'], ['group-balances'], ['group-expenses'], ['group-settlements'],
    ]));
  });
});
