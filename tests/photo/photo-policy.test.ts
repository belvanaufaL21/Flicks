import { describe, expect, it } from 'vitest';
import { PHOTO_POLICY } from '../../src/shared/photo-policy';

describe('approved photo policy', () => {
  it('keeps the same input limits for both analysis photo types', () => {
    expect(PHOTO_POLICY).toEqual({
      maxBytes: 10_000_000,
      minSidePx: 512,
      maxSidePx: 4096,
      formats: ['image/jpeg', 'image/png', 'image/webp'],
      maxCount: {
        face: 1,
        fullBody: 1,
      },
    });
  });
});
