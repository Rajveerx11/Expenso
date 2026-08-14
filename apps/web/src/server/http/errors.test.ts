import { describe, expect, it } from 'vitest';
import { mapDataError } from './errors';

describe('Supabase data error mapping', () => {
  it.each(['PGRST202', 'PGRST205'])(
    'maps missing backend contracts (%s) to a retryable dependency failure',
    (code) => {
      expect(mapDataError({ code, message: 'schema contract missing' })).toMatchObject({
        code: 'DEPENDENCY_UNAVAILABLE',
        status: 503,
        retryable: true,
      });
    },
  );
});
