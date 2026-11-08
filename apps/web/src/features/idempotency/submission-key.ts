export interface SubmissionKeyManager {
  forSubmission(input: unknown): string;
  /** Compatibility alias for settlement callers. */
  forClaim(input: unknown): string;
  reset(): void;
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalJson(entry)]),
    );
  }
  return value;
}

export function createSubmissionKeyManager(factory: () => string): SubmissionKeyManager {
  let fingerprint: string | null = null;
  let key: string | null = null;

  function forSubmission(input: unknown): string {
    const nextFingerprint = JSON.stringify(canonicalJson(input));
    if (fingerprint !== nextFingerprint || !key) {
      fingerprint = nextFingerprint;
      key = factory();
    }
    return key;
  }

  return {
    forSubmission,
    forClaim: forSubmission,
    reset() {
      fingerprint = null;
      key = null;
    },
  };
}
