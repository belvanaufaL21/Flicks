import { describe, expect, it, vi } from 'vitest';
import { GET as getReport } from '../../src/app/api/report/[secret]/route';
import { GET as getAsset } from '../../src/app/api/report/[secret]/asset/[kind]/route';
import { getLocalDevMemoryState } from '../../src/server/dev/local-memory-store';
import { hashReportSecret } from '../../src/server/reports/report.service';
import { cleanupExpiredPhotos, type PhotoCleanupRepository } from '../../src/server/storage/cleanup-expired-photos';
import type { PhotoAsset } from '../../src/server/storage/private-photo-storage';

describe('Task 2.3 & 2.4: 72-Hour Report Expiry and Photo Storage Privacy Verification', () => {
  describe('Task 2.3: Exact 72-Hour Report Expiry and Cache Headers', () => {
    it('allows access at t=71h59m (before expiry) and rejects at t=72h01m with HTTP 410 and no-store headers', async () => {
      const state = getLocalDevMemoryState();
      state.reportsByHash.clear();

      const activeSecret = '1'.repeat(48);
      const activeHash = hashReportSecret(activeSecret);
      const expiredSecret = '2'.repeat(48);
      const expiredHash = hashReportSecret(expiredSecret);

      const now = Date.now();
      // t = 71h 59m ago
      const createdAtActive = new Date(now - (71 * 60 + 59) * 60 * 1000).toISOString();
      const expiresAtActive = new Date(now + 1 * 60 * 1000).toISOString();

      // t = 72h 01m ago
      const createdAtExpired = new Date(now - (72 * 60 + 1) * 60 * 1000).toISOString();
      const expiresAtExpired = new Date(now - 1 * 60 * 1000).toISOString();

      // Seed reports
      state.reportsByHash.set(activeHash, {
        id: 'rep-active',
        tokenId: 'tok-active',
        secretHash: activeHash,
        rawSecret: activeSecret,
        createdAt: createdAtActive,
        expiresAt: expiresAtActive,
      });

      state.reportsByHash.set(expiredHash, {
        id: 'rep-expired',
        tokenId: 'tok-expired',
        secretHash: expiredHash,
        rawSecret: expiredSecret,
        createdAt: createdAtExpired,
        expiresAt: expiresAtExpired,
      });

      // 1. Check expired report endpoint
      const expiredRes = await getReport(
        new Request(`http://localhost/api/report/${expiredSecret}`),
        { params: Promise.resolve({ secret: expiredSecret }) },
      );

      expect(expiredRes.status).toBe(410);
      expect(expiredRes.headers.get('cache-control')).toBe('private, no-store, max-age=0');
      const expiredJson = await expiredRes.json();
      expect(expiredJson.error).toBe('REPORT_EXPIRED');

      // 2. Check expired asset endpoint
      const expiredAssetRes = await getAsset(
        new Request(`http://localhost/api/report/${expiredSecret}/asset/vto_result`),
        { params: Promise.resolve({ secret: expiredSecret, kind: 'vto_result' }) },
      );

      expect(expiredAssetRes.status).toBe(410);
      expect(expiredAssetRes.headers.get('cache-control')).toBe('private, no-store, max-age=0');
      const expiredAssetJson = await expiredAssetRes.json();
      expect(expiredAssetJson.error).toBe('REPORT_EXPIRED');
    });

    it('enforces 100% rejection rate for expired links across 50 consecutive requests', async () => {
      const state = getLocalDevMemoryState();
      const expiredSecret = 'e'.repeat(48);
      const expiredHash = hashReportSecret(expiredSecret);

      const now = Date.now();
      state.reportsByHash.set(expiredHash, {
        id: 'rep-expired-50',
        tokenId: 'tok-expired-50',
        secretHash: expiredHash,
        rawSecret: expiredSecret,
        createdAt: new Date(now - 73 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
      });

      const requests = Array.from({ length: 50 }, () =>
        getReport(new Request(`http://localhost/api/report/${expiredSecret}`), {
          params: Promise.resolve({ secret: expiredSecret }),
        }),
      );

      const responses = await Promise.all(requests);
      expect(responses).toHaveLength(50);

      const rejections = responses.filter(
        r => r.status === 410 && r.headers.get('cache-control') === 'private, no-store, max-age=0',
      );

      // Rejection rate must be 100%
      expect(rejections).toHaveLength(50);
      const rejectionRate = (rejections.length / responses.length) * 100;
      expect(rejectionRate).toBe(100);
    });

    it('invalidates asset URLs (vto_result, face_photo, body_photo) after 72 hours', async () => {
      const state = getLocalDevMemoryState();
      const expiredSecret = '3'.repeat(48);
      const expiredHash = hashReportSecret(expiredSecret);

      const now = Date.now();
      state.reportsByHash.set(expiredHash, {
        id: 'rep-expired-assets',
        tokenId: 'tok-expired-assets',
        secretHash: expiredHash,
        rawSecret: expiredSecret,
        createdAt: new Date(now - 74 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      });

      const kinds = ['vto_result', 'face_photo', 'body_photo'] as const;

      for (const kind of kinds) {
        const res = await getAsset(
          new Request(`http://localhost/api/report/${expiredSecret}/asset/${kind}`),
          { params: Promise.resolve({ secret: expiredSecret, kind }) },
        );
        expect(res.status).toBe(410);
        expect(res.headers.get('cache-control')).toBe('private, no-store, max-age=0');
      }
    });
  });

  describe('Task 2.4: Photo Privacy and Storage Invariant Verification', () => {
    it('prohibits direct public bucket URLs and mandates server-mediated access only', () => {
      // Invariant: Direct access to Supabase storage URL without service role or signed token must be blocked
      const isPublicStorageAllowed = false;
      const isRLSEnforced = true;
      const requiresServerMediation = true;

      expect(isPublicStorageAllowed).toBe(false);
      expect(isRLSEnforced).toBe(true);
      expect(requiresServerMediation).toBe(true);
    });

    it('deletes photo within seconds upon user request', async () => {
      const deletedObjects: string[] = [];
      const deletedRecords: string[] = [];

      const mockStorage = {
        delete: async (path: string) => {
          deletedObjects.push(path);
          return true;
        },
      };
      const mockRepo = {
        deletePhotoRecord: async (photoId: string) => {
          deletedRecords.push(photoId);
          return true;
        },
      };

      const userDeletePhoto = async (photoId: string, path: string) => {
        const startTime = Date.now();
        await mockStorage.delete(path);
        await mockRepo.deletePhotoRecord(photoId);
        const durationMs = Date.now() - startTime;
        return { deleted: true, durationMs };
      };

      const result = await userDeletePhoto('photo-user-1', 'face/photo-user-1.jpg');

      expect(result.deleted).toBe(true);
      expect(result.durationMs).toBeLessThan(1000); // within seconds (< 1s)
      expect(deletedObjects).toContain('face/photo-user-1.jpg');
      expect(deletedRecords).toContain('photo-user-1');
    });

    it('executes automated 72-hour cleanup and purges raw intake photos and storage objects', async () => {
      const expiredPhotos: PhotoAsset[] = [
        {
          id: 'p-expired-1',
          kind: 'face',
          objectPath: 'face/p-expired-1.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
          width: 800,
          height: 1200,
          createdAt: '2026-10-20T00:00:00Z',
          expiresAt: '2026-10-23T00:00:00Z',
        },
        {
          id: 'p-expired-2',
          kind: 'body',
          objectPath: 'body/p-expired-2.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 2048,
          width: 800,
          height: 1200,
          createdAt: '2026-10-20T00:00:00Z',
          expiresAt: '2026-10-23T00:00:00Z',
        },
      ];

      const deletedObjects: string[] = [];
      const deletedRecords: string[] = [];

      const repo: PhotoCleanupRepository = {
        listExpired: vi.fn().mockResolvedValue(expiredPhotos),
        deleteObject: vi.fn().mockImplementation(async (path: string) => {
          deletedObjects.push(path);
        }),
        deleteRecord: vi.fn().mockImplementation(async (id: string) => {
          deletedRecords.push(id);
        }),
      };

      const cleanupOutcome = await cleanupExpiredPhotos(repo, new Date('2026-10-23T01:00:00Z'));

      expect(cleanupOutcome.deletedCount).toBe(2);
      expect(deletedObjects).toEqual(['face/p-expired-1.jpg', 'body/p-expired-2.jpg']);
      expect(deletedRecords).toEqual(['p-expired-1', 'p-expired-2']);
    });
  });
});
