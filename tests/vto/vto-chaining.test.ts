import { describe, it, expect, vi } from 'vitest';
import { executeVtoPipeline } from '../../src/server/vto/virtual-try-on.service';

describe('executeVtoPipeline (Sequential FASHN Chaining)', () => {
  it('executes single-step FASHN when only topProduct is provided', async () => {
    const mockProvider = {
      submitTryOn: vi.fn().mockResolvedValue({
        kind: 'completed',
        providerReference: 'pred-top-1',
        resultImageUri: 'https://fashn.cdn/top-output.jpg',
        costEstimateUsd: 0.075,
        durationMs: 4200,
      }),
      pollTryOn: vi.fn(),
    };

    const result = await executeVtoPipeline(
      {
        userPhotoUri: 'https://storage/user-body.jpg',
        topProduct: { id: 'top-1', imagePath: 'https://storage/top-1.jpg', category: 'tops' },
        bottomProduct: null,
      },
      mockProvider as any,
    );

    expect(mockProvider.submitTryOn).toHaveBeenCalledTimes(1);
    expect(mockProvider.submitTryOn).toHaveBeenCalledWith(
      expect.objectContaining({
        personImagePath: 'https://storage/user-body.jpg',
        garmentImagePath: 'https://storage/top-1.jpg',
        category: 'tops',
      }),
    );
    expect(result.status).toBe('succeeded');
    expect(result.finalImageUri).toBe('https://fashn.cdn/top-output.jpg');
    expect(result.quotaDeduction).toEqual({ top: true, bottom: false });
  });

  it('chains Step 1 (Top) output into Step 2 (Bottom) personImagePath when both are selected', async () => {
    const mockProvider = {
      submitTryOn: vi
        .fn()
        .mockResolvedValueOnce({
          kind: 'completed',
          providerReference: 'pred-top-1',
          resultImageUri: 'https://fashn.cdn/step1-top-worn.jpg',
          costEstimateUsd: 0.075,
          durationMs: 4000,
        })
        .mockResolvedValueOnce({
          kind: 'completed',
          providerReference: 'pred-bot-2',
          resultImageUri: 'https://fashn.cdn/step2-full-outfit.jpg',
          costEstimateUsd: 0.075,
          durationMs: 4500,
        }),
      pollTryOn: vi.fn(),
    };

    const result = await executeVtoPipeline(
      {
        userPhotoUri: 'https://storage/user-body.jpg',
        topProduct: { id: 'top-1', imagePath: 'https://storage/top-1.jpg', category: 'tops' },
        bottomProduct: { id: 'bot-1', imagePath: 'https://storage/bot-1.jpg', category: 'bottoms' },
      },
      mockProvider as any,
    );

    expect(mockProvider.submitTryOn).toHaveBeenCalledTimes(2);
    expect(mockProvider.submitTryOn).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        personImagePath: 'https://storage/user-body.jpg',
        garmentImagePath: 'https://storage/top-1.jpg',
        category: 'tops',
      }),
    );
    expect(mockProvider.submitTryOn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        personImagePath: 'https://fashn.cdn/step1-top-worn.jpg',
        garmentImagePath: 'https://storage/bot-1.jpg',
        category: 'bottoms',
      }),
    );
    expect(result.status).toBe('succeeded');
    expect(result.finalImageUri).toBe('https://fashn.cdn/step2-full-outfit.jpg');
    expect(result.step1ImageUri).toBe('https://fashn.cdn/step1-top-worn.jpg');
    expect(result.quotaDeduction).toEqual({ top: true, bottom: true });
  });

  it('preserves Step 1 photo and refunds Bottom quota on partial failure in Step 2', async () => {
    const mockProvider = {
      submitTryOn: vi
        .fn()
        .mockResolvedValueOnce({
          kind: 'completed',
          providerReference: 'pred-top-1',
          resultImageUri: 'https://fashn.cdn/step1-top-worn.jpg',
          costEstimateUsd: 0.075,
          durationMs: 4000,
        })
        .mockResolvedValueOnce({
          kind: 'failed',
          errorCode: 'FASHN_TIMEOUT',
          errorMessage: 'Step 2 timed out',
          durationMs: 10000,
        }),
      pollTryOn: vi.fn(),
    };

    const result = await executeVtoPipeline(
      {
        userPhotoUri: 'https://storage/user-body.jpg',
        topProduct: { id: 'top-1', imagePath: 'https://storage/top-1.jpg', category: 'tops' },
        bottomProduct: { id: 'bot-1', imagePath: 'https://storage/bot-1.jpg', category: 'bottoms' },
      },
      mockProvider as any,
    );

    expect(result.status).toBe('partial_success');
    expect(result.finalImageUri).toBe('https://fashn.cdn/step1-top-worn.jpg');
    expect(result.quotaDeduction).toEqual({ top: true, bottom: false });
    expect(result.warningMessage).toContain('bawahan gagal');
  });
});
