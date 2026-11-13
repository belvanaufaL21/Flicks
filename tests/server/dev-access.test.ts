import { describe, expect, it } from 'vitest';
import {
  hasMatchingSecret,
  hasValidDevelopmentAccess,
} from '../../src/server/dev/access';

describe('hasMatchingSecret', () => {
  it('matches configured secrets without accepting blank or different values', () => {
    expect(hasMatchingSecret('cron-secret', 'cron-secret')).toBe(true);
    expect(hasMatchingSecret(undefined, 'cron-secret')).toBe(false);
    expect(hasMatchingSecret('cron-secret', '')).toBe(false);
    expect(hasMatchingSecret('expected', 'different')).toBe(false);
  });
});

describe('hasValidDevelopmentAccess', () => {
  it('rejects all provider-test requests in production', () => {
    expect(
      hasValidDevelopmentAccess(
        'production',
        'configured-token',
        'configured-token',
      ),
    ).toBe(false);
  });

  it('rejects missing or incorrect development tokens', () => {
    expect(hasValidDevelopmentAccess('development', undefined, 'token')).toBe(
      false,
    );
    expect(
      hasValidDevelopmentAccess('development', 'expected', 'incorrect'),
    ).toBe(false);
  });

  it('allows a matching token only outside production', () => {
    expect(
      hasValidDevelopmentAccess(
        'development',
        'configured-token',
        'configured-token',
      ),
    ).toBe(true);
  });
});
