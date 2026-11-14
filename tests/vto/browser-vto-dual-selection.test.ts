import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startTryon, refreshTryon } from '../../src/services/tryon.service';
import { getStore } from '../../src/lib/store';
import * as fashn from '../../src/lib/ai/fashn';

vi.mock('../../src/lib/store');
vi.mock('../../src/lib/ai/fashn');
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('fake-garment-bytes')),
}));
vi.mock('../../src/services/analysis.service', () => ({
  FlowError: class extends Error {
    constructor(msg: string, public status: number) {
      super(msg);
    }
  },
  analysisForSession: vi.fn().mockResolvedValue({
    id: 'an-1',
    status: 'completed',
    tokenId: 'tok-1',
    bodyPhotoId: 'pho-body-1',
  }),
}));

describe('startTryon & refreshTryon with Dual Selection', () => {
  const mockStore = {
    product: vi.fn(),
    token: vi.fn().mockResolvedValue({ status: 'reserved' }),
    photo: vi.fn().mockResolvedValue({ bytes: Buffer.from('photo-bytes'), mime: 'image/jpeg' }),
    analysis: vi.fn().mockResolvedValue({ id: 'an-1', bodyPhotoId: 'pho-body-1', tokenId: 'tok-1' }),
    claimTryon: vi.fn(),
    updateTryonJob: vi.fn().mockImplementation((id, updates) => Promise.resolve({ id, ...updates })),
    savePhoto: vi.fn().mockResolvedValue({ id: 'pho-result-1' }),
    consumeToken: vi.fn(),
    recordUsage: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getStore).mockReturnValue(mockStore as any);
  });

  it('orders tops first and sets combined productId when both top and bottom are selected', async () => {
    mockStore.product.mockImplementation(async (id: string) => {
      if (id === 'bot-1') {
        return {
          id: 'bot-1',
          name: 'Celana Linen',
          category: 'Bawahan',
          isActive: true,
          imagePath: '/public/catalog/bot-1.jpg',
          labels: { fashnCategory: 'bottoms' },
        };
      }
      if (id === 'top-1') {
        return {
          id: 'top-1',
          name: 'Kemeja Putih',
          category: 'Atasan',
          isActive: true,
          imagePath: '/public/catalog/top-1.jpg',
          labels: { fashnCategory: 'tops' },
        };
      }
      return null;
    });

    mockStore.claimTryon.mockResolvedValue({
      kind: 'created',
      job: {
        id: 'vto-1',
        analysisId: 'an-1',
        productId: 'top-1,bot-1',
        status: 'queued',
        attempts: 1,
      },
    });

    vi.mocked(fashn.submitTryon).mockResolvedValue('fashn-job-1');

    const job = await startTryon({
      sessionHash: 'hash-1',
      analysisId: 'an-1',
      topProductId: 'top-1',
      bottomProductId: 'bot-1',
    });

    expect(mockStore.claimTryon).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'top-1,bot-1',
      }),
      expect.any(Number),
    );
    expect(fashn.submitTryon).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'tops',
      }),
    );
    expect(job.status).toBe('processing');
  });

  it('chains step 2 bottom tryon when step 1 top tryon completes', async () => {
    mockStore.product.mockImplementation(async (id: string) => {
      if (id === 'bot-1') {
        return {
          id: 'bot-1',
          name: 'Celana Linen',
          category: 'Bawahan',
          isActive: true,
          imagePath: '/public/catalog/bot-1.jpg',
          labels: { fashnCategory: 'bottoms' },
        };
      }
      if (id === 'top-1') {
        return {
          id: 'top-1',
          name: 'Kemeja Putih',
          category: 'Atasan',
          isActive: true,
          imagePath: '/public/catalog/top-1.jpg',
          labels: { fashnCategory: 'tops' },
        };
      }
      return null;
    });

    vi.mocked(fashn.getTryonStatus).mockResolvedValue({
      state: 'completed',
      output: { kind: 'url', url: 'https://fashn.cdn/step1-out.jpg' },
    });

    vi.mocked(fashn.downloadResult).mockResolvedValue({
      bytes: Buffer.from('step1-result-bytes'),
      mime: 'image/jpeg',
    });

    vi.mocked(fashn.submitTryon).mockResolvedValue('fashn-job-2');

    const job = await refreshTryon({
      id: 'vto-1',
      analysisId: 'an-1',
      productId: 'top-1,bot-1',
      idempotencyKey: 'vto:an-1',
      provider: 'fashn',
      providerJobId: 'fashn-job-1',
      status: 'processing',
      attempts: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Should initiate step 2
    expect(fashn.submitTryon).toHaveBeenCalledWith(
      expect.objectContaining({
        person: expect.objectContaining({
          bytes: Buffer.from('step1-result-bytes'),
        }),
        category: 'bottoms',
      }),
    );
    expect(mockStore.updateTryonJob).toHaveBeenCalledWith(
      'vto-1',
      expect.objectContaining({
        providerJobId: 'step2:fashn-job-2',
      }),
    );
    expect(job.providerJobId).toBe('step2:fashn-job-2');
  });
});
