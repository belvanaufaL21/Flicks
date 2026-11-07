import { beforeEach, describe, expect, it } from 'vitest';
import {
  createInMemoryAdminRepository,
  createInMemoryReportRepository,
  getLocalDevMemoryState,
} from '../../src/server/dev/local-memory-store';

describe('local memory store extensions (reports, admin profiles & catalog)', () => {
  beforeEach(() => {
    const state = getLocalDevMemoryState();
    state.reportsByHash.clear();
    state.adminProfilesByUserId.clear();
  });

  it('persists and retrieves report records by secret hash and token ID', async () => {
    const repo = createInMemoryReportRepository();
    const created = await repo.create({
      id: 'report-1',
      tokenId: 'token-1',
      secretHash: 'hash-abc-123',
      createdAt: '2026-11-04T12:00:00.000Z',
      expiresAt: '2026-11-07T12:00:00.000Z',
    });

    expect(created.id).toBe('report-1');
    const found = await repo.findBySecretHash('hash-abc-123');
    expect(found).toEqual(created);

    const byToken = await repo.findByTokenId('token-1');
    expect(byToken).toEqual(created);

    const missing = await repo.findBySecretHash('non-existent');
    expect(missing).toBeNull();
  });

  it('checks admin profile role by user ID', async () => {
    const repo = createInMemoryAdminRepository();
    await repo.setProfile({
      userId: 'user-admin-1',
      role: 'admin',
      createdAt: '2026-11-04T12:00:00.000Z',
    });

    const profile = await repo.findProfileByUserId('user-admin-1');
    expect(profile?.role).toBe('admin');

    const nonAdmin = await repo.findProfileByUserId('user-visitor-2');
    expect(nonAdmin).toBeNull();
  });

  it('seeds default catalog product with extended metadata in memory state', () => {
    const state = getLocalDevMemoryState();
    expect(state.productsById).toBeDefined();
    const defaultProduct = state.productsById.get('prod-active-1');
    expect(defaultProduct).toMatchObject({
      id: 'prod-active-1',
      name: 'Terracotta Linen Overshirt',
      category: 'tops',
      isActive: true,
    });
  });
});
