import { describe, expect, it, vi } from 'vitest';
import {
  FASHN_CREDIT_COST_IDR,
  FASHN_DEFAULT_MODEL,
  normalizeFashnCategory,
  pollFashnTryOnStatus,
  submitFashnTryOn,
} from '../../src/server/providers/fashn';

describe('FASHN Provider (tryon-v1.6, submit and async poll)', () => {
  it('normalizes categories to tops, bottoms, one-pieces, or auto', () => {
    expect(normalizeFashnCategory('shirt')).toBe('tops');
    expect(normalizeFashnCategory('pants')).toBe('bottoms');
    expect(normalizeFashnCategory('dress')).toBe('one-pieces');
    expect(normalizeFashnCategory('unknown')).toBe('auto');
  });

  it('submits job to FASHN with tryon-v1.6, quality mode, and return_base64: true', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'fashn-pred-123',
          error: null,
          status: 'in_queue',
        }),
        { status: 200 },
      ),
    );

    const result = await submitFashnTryOn(
      {
        modelImageDataUri: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
        garmentImage: 'https://example.com/shirt.jpg',
        category: 'tops',
        idempotencyKey: 'job-1',
      },
      {
        apiKey: 'test-key',
        fetchImpl: fetchMock as unknown as typeof fetch,
      },
    );

    expect(result.providerReference).toBe('fashn-pred-123');
    expect(result.status).toBe('processing');

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('https://api.fashn.ai/v1/run');
    const sentBody = JSON.parse(call[1].body as string);
    expect(sentBody.model_name).toBe(FASHN_DEFAULT_MODEL);
    expect(sentBody.mode).toBe('quality');
    expect(sentBody.return_base64).toBe(true);
    expect(sentBody.output_format).toBe('jpeg');
    expect(sentBody.inputs.category).toBe('tops');
    expect(sentBody.inputs.mode).toBe('quality');
    expect(sentBody.inputs.return_base64).toBe(true);
    expect(sentBody.inputs.output_format).toBe('jpeg');
  });

  it('polls status and handles processing, completed with base64 output, and failed', async () => {
    // 1. Processing
    const pollProcessingFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'fashn-pred-123', status: 'processing' }), {
        status: 200,
      }),
    );
    const procResult = await pollFashnTryOnStatus('fashn-pred-123', {
      apiKey: 'test-key',
      fetchImpl: pollProcessingFetch as unknown as typeof fetch,
    });
    expect(procResult.status).toBe('processing');

    // 2. Completed with credits header
    const pollCompletedFetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'fashn-pred-123',
          status: 'completed',
          output: ['data:image/jpeg;base64,/9j/4completedOutput=='],
        }),
        {
          status: 200,
          headers: { 'x-fashn-credits-used': '1' },
        },
      ),
    );
    const compResult = await pollFashnTryOnStatus('fashn-pred-123', {
      apiKey: 'test-key',
      fetchImpl: pollCompletedFetch as unknown as typeof fetch,
    });
    expect(compResult.status).toBe('completed');
    if (compResult.status === 'completed') {
      expect(compResult.outputDataUri).toBe('data:image/jpeg;base64,/9j/4completedOutput==');
      expect(compResult.creditsUsed).toBe(1);
      expect(compResult.estimatedCostIdr).toBe(FASHN_CREDIT_COST_IDR);
    }

    // 2b. Completed without output fails with invalid_response
    const pollCompletedEmptyFetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'fashn-pred-123',
          status: 'completed',
          output: [],
        }),
        { status: 200 },
      ),
    );
    const compEmptyResult = await pollFashnTryOnStatus('fashn-pred-123', {
      apiKey: 'test-key',
      fetchImpl: pollCompletedEmptyFetch as unknown as typeof fetch,
    });
    expect(compEmptyResult.status).toBe('failed');
    if (compEmptyResult.status === 'failed') {
      expect(compEmptyResult.errorCode).toBe('invalid_response');
      expect(compEmptyResult.errorMessage).toBe('FASHN prediction completed without output');
    }

    // 3. Failed
    const pollFailedFetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'fashn-pred-123',
          status: 'failed',
          error: { name: 'PoseError', message: 'Model pose could not be detected' },
        }),
        { status: 200 },
      ),
    );
    const failedResult = await pollFashnTryOnStatus('fashn-pred-123', {
      apiKey: 'test-key',
      fetchImpl: pollFailedFetch as unknown as typeof fetch,
    });
    expect(failedResult.status).toBe('failed');
    if (failedResult.status === 'failed') {
      expect(failedResult.errorCode).toBe('pose_error');
      expect(failedResult.errorMessage).toContain('Model pose could not be detected');
    }
  });

  it('does not retry 4xx errors (e.g. 402 Out of credits, 400 Bad Request)', async () => {
    const fetch402 = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Out of credits' }), { status: 402 }),
    );

    await expect(
      submitFashnTryOn(
        {
          modelImageDataUri: 'data:image/jpeg;base64,abc',
          garmentImage: 'https://example.com/shirt.jpg',
          category: 'tops',
        },
        { apiKey: 'test-key', maxRetries: 2, fetchImpl: fetch402 as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({
      code: 'out_of_credits',
      attempts: 1,
    });
    expect(fetch402).toHaveBeenCalledTimes(1);
  });
});
