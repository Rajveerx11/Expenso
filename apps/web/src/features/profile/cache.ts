import type { QueryClient } from '@tanstack/react-query';

export const PROFILE_DEPENDENT_QUERY_PREFIXES = [
  ['dashboard'],
  ['groups'],
  ['group'],
  ['group-members'],
  ['group-expenses'],
  ['group-expense'],
  ['group-balances'],
  ['group-settlements'],
  ['group-settlement'],
] as const;

export async function refreshProfileDependentQueries(
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
): Promise<void> {
  await Promise.all(PROFILE_DEPENDENT_QUERY_PREFIXES.map((queryKey) => (
    queryClient.invalidateQueries({ queryKey })
  )));
}
