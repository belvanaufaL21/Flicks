import { beforeEach, describe, expect, it } from 'vitest';
import { resetLocalDevMemoryState } from '@/server/dev/local-memory-store';
import {
  checkVtoQuota,
  consumeVtoQuota,
} from '@/server/vto/virtual-try-on.service';

describe('VTO Dual-Quota Tracking (1 Top + 1 Bottom)', () => {
  beforeEach(() => {
    resetLocalDevMemoryState();
  });

  it('initializes a fresh token with 1 top and 1 bottom quota available', () => {
    const tokenId = 'test-token-fresh';
    const quota = checkVtoQuota(tokenId);

    expect(quota.topUsed).toBe(false);
    expect(quota.bottomUsed).toBe(false);
    expect(quota.topsRemaining).toBe(1);
    expect(quota.bottomsRemaining).toBe(1);
    expect(quota.canTryTop).toBe(true);
    expect(quota.canTryBottom).toBe(true);
  });

  it('deducts top quota when top is consumed and leaves bottom quota intact', () => {
    const tokenId = 'test-token-top-only';
    const consumed = consumeVtoQuota(tokenId, {
      consumeTop: true,
      consumeBottom: false,
    });

    expect(consumed.success).toBe(true);
    expect(consumed.quota.topUsed).toBe(true);
    expect(consumed.quota.bottomUsed).toBe(false);
    expect(consumed.quota.topsRemaining).toBe(0);
    expect(consumed.quota.bottomsRemaining).toBe(1);
    expect(consumed.quota.canTryTop).toBe(false);
    expect(consumed.quota.canTryBottom).toBe(true);
  });

  it('deducts both quotas when both items are consumed', () => {
    const tokenId = 'test-token-both';
    const consumed = consumeVtoQuota(tokenId, {
      consumeTop: true,
      consumeBottom: true,
    });

    expect(consumed.success).toBe(true);
    expect(consumed.quota.topUsed).toBe(true);
    expect(consumed.quota.bottomUsed).toBe(true);
    expect(consumed.quota.topsRemaining).toBe(0);
    expect(consumed.quota.bottomsRemaining).toBe(0);
    expect(consumed.quota.canTryTop).toBe(false);
    expect(consumed.quota.canTryBottom).toBe(false);
  });

  it('rejects consumption when quota is already exhausted', () => {
    const tokenId = 'test-token-exhausted';
    consumeVtoQuota(tokenId, { consumeTop: true, consumeBottom: false });

    const secondTry = consumeVtoQuota(tokenId, {
      consumeTop: true,
      consumeBottom: false,
    });
    expect(secondTry.success).toBe(false);
    expect(secondTry.error).toBe('TOP_QUOTA_EXHAUSTED');

    consumeVtoQuota(tokenId, { consumeTop: false, consumeBottom: true });
    const thirdTry = consumeVtoQuota(tokenId, {
      consumeTop: false,
      consumeBottom: true,
    });
    expect(thirdTry.success).toBe(false);
    expect(thirdTry.error).toBe('BOTTOM_QUOTA_EXHAUSTED');
  });
});
