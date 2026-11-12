// @vitest-environment jsdom
import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyzePage from '../../src/app/analyze/page';

const PNG_HEADER = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

function validFile(name: string): File {
  return new File([PNG_HEADER], name, { type: 'image/png' });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function readAuthHeader(init?: RequestInit): string | null {
  if (!init?.headers) return null;
  if (init.headers instanceof Headers) {
    return init.headers.get('authorization');
  }
  if (Array.isArray(init.headers)) {
    const match = init.headers.find(
      ([k]) => k.toLowerCase() === 'authorization',
    );
    return match?.[1] ?? null;
  }
  const record = init.headers as Record<string, string>;
  return record.authorization ?? record.Authorization ?? null;
}

describe('Checkout-to-Upload E2E Flow (Section 4)', () => {
  const originalClientKey = process.env.MIDTRANS_CLIENT_KEY;
  const originalNextClientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;
  const originalIsProduction = process.env.MIDTRANS_IS_PRODUCTION;
  const originalNextIsProduction = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalScrollIntoView = Element.prototype.scrollIntoView;

  beforeEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = '';
    delete window.snap;
    process.env.MIDTRANS_CLIENT_KEY = 'SB-Mid-client-e2e';
    delete process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;
    process.env.MIDTRANS_IS_PRODUCTION = 'false';
    delete process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION;

    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 512, height: 768, close: vi.fn() }),
    );
    URL.createObjectURL = vi.fn(() => 'blob:e2e-preview');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.head.innerHTML = '';
    delete window.snap;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    Element.prototype.scrollIntoView = originalScrollIntoView;

    if (originalClientKey === undefined) delete process.env.MIDTRANS_CLIENT_KEY;
    else process.env.MIDTRANS_CLIENT_KEY = originalClientKey;
    if (originalNextClientKey === undefined)
      delete process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;
    else process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY = originalNextClientKey;
    if (originalIsProduction === undefined)
      delete process.env.MIDTRANS_IS_PRODUCTION;
    else process.env.MIDTRANS_IS_PRODUCTION = originalIsProduction;
    if (originalNextIsProduction === undefined)
      delete process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION;
    else process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION = originalNextIsProduction;
  });

  it('prompts unauthenticated visitors to buy a token and locks photo upload and AI analysis without a dev bypass', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<AnalyzePage />);

    const checkoutRegion = screen.getByRole('region', {
      name: /Pembayaran Token Analisis/i,
    });
    expect(
      within(checkoutRegion).getByRole('button', {
        name: /Beli Token Analisis — Rp19\.000/i,
      }),
    ).toBeTruthy();
    expect(within(checkoutRegion).getByText(/^QRIS$/i)).toBeTruthy();
    expect(within(checkoutRegion).getByText(/^GoPay$/i)).toBeTruthy();

    expect(
      screen.getByText(/Token analisis belum aktif.*selesaikan pembayaran/i),
    ).toBeTruthy();
    expect(screen.queryByText(/Mode Dev/i)).toBeNull();

    const faceInput = screen.getByLabelText(/foto wajah/i) as HTMLInputElement;
    const bodyInput = screen.getByLabelText(
      /foto seluruh tubuh/i,
    ) as HTMLInputElement;
    const analyzeBtn = screen.getByRole('button', {
      name: /analisis dengan gemini ai/i,
    }) as HTMLButtonElement;

    expect(faceInput.disabled).toBe(true);
    expect(bodyInput.disabled).toBe(true);
    expect(analyzeBtn.disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('unlocks PhotoIntakeForm with purchased token on checkout completion, scrolls to intake, and authenticates upload + Gemini analysis', async () => {
    const user = userEvent.setup();
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    const capturedAuthHeaders: Array<{ url: string; auth: string | null }> = [];
    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, init?: RequestInit) => {
        capturedAuthHeaders.push({ url, auth: readAuthHeader(init) });

        if (url === '/api/checkout') {
          return jsonResponse(
            {
              payment_id: 'pay-e2e-1',
              provider_reference: 'FLK-E2E-1',
              amount: 19000,
              currency: 'IDR',
              status: 'pending',
              snap_token: 'snap-e2e-1',
              redirect_url:
                'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-e2e-1',
              qris_url:
                'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-e2e-1',
            },
            201,
          );
        }

        if (url === '/api/payments/pay-e2e-1') {
          return jsonResponse({
            payment_id: 'pay-e2e-1',
            provider_reference: 'FLK-E2E-1',
            amount: 19000,
            currency: 'IDR',
            status: 'paid',
            paid_at: '2026-04-06T12:00:00Z',
            token_id: 'tok-e2e-1',
            token_secret: 'sec-e2e-secret-1',
          });
        }

        if (url === '/api/upload') {
          const fd = init?.body as FormData;
          const kind = fd?.get('kind');
          return jsonResponse(
            { photo_path: `${String(kind)}/e2e.png` },
            201,
          );
        }

        if (url === '/api/analysis') {
          return jsonResponse({ job_id: 'job-e2e-1', status: 'completed' }, 201);
        }

        if (url === '/api/analysis/job-e2e-1') {
          return jsonResponse({
            status: 'completed',
            result: {
              personal_color: {
                primary_season: 'autumn',
                sub_season: 'warm autumn',
                confidence_level: 'high',
                recommended_colors: ['Terracotta', 'Olive'],
              },
              body_shape: {
                category: 'hourglass',
                confidence_level: 'high',
                styling_guidance: ['Gunakan siluet wrap yang terstruktur'],
              },
            },
          });
        }

        if (url.startsWith('/api/recommendations')) {
          return jsonResponse({
            tops: [
              {
                id: 'top-e2e-1',
                name: 'Terracotta Silk Blouse',
                brand: 'FLICKS',
                category: 'tops',
                imagePath: 'https://storage.local/top-e2e-1.jpg',
              },
            ],
            bottoms: [],
          });
        }

        return jsonResponse({}, 404);
      });
    vi.stubGlobal('fetch', fetchMock);

    let snapCallbacks: { onSuccess?: (result: unknown) => void } | undefined;
    window.snap = {
      pay: vi.fn((_token: string, callbacks) => {
        snapCallbacks = callbacks;
      }),
    };

    render(<AnalyzePage />);

    fireEvent.click(
      screen.getByRole('button', { name: /Beli Token Analisis — Rp19\.000/i }),
    );

    await waitFor(() => {
      expect(snapCallbacks).toBeDefined();
    });

    await act(async () => {
      snapCallbacks?.onSuccess?.({ transaction_status: 'settlement' });
    });

    const faceInput = screen.getByLabelText(/foto wajah/i) as HTMLInputElement;
    const bodyInput = screen.getByLabelText(
      /foto seluruh tubuh/i,
    ) as HTMLInputElement;

    await waitFor(() => {
      expect(faceInput.disabled).toBe(false);
      expect(bodyInput.disabled).toBe(false);
    });
    expect(scrollIntoViewMock).toHaveBeenCalled();

    await user.upload(faceInput, validFile('face.png'));
    await user.upload(bodyInput, validFile('body.png'));
    await user.click(screen.getByRole('radio', { name: /wanita/i }));
    await user.click(
      screen.getByRole('checkbox', { name: /saya menyetujui pemrosesan foto/i }),
    );

    const analyzeBtn = screen.getByRole('button', {
      name: /analisis dengan gemini ai/i,
    }) as HTMLButtonElement;
    await waitFor(() => expect(analyzeBtn.disabled).toBe(false));
    await user.click(analyzeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Hasil Analisis AI \(completed\)/i)).toBeTruthy();
      expect(screen.getByText('Terracotta Silk Blouse')).toBeTruthy();
    });

    expect(
      capturedAuthHeaders.some((call) => call.url.includes('/api/dev/tokens')),
    ).toBe(false);

    const uploadCalls = capturedAuthHeaders.filter(
      (call) => call.url === '/api/upload',
    );
    expect(uploadCalls).toHaveLength(2);
    for (const call of uploadCalls) {
      expect(call.auth).toBe('Bearer sec-e2e-secret-1');
    }

    const analysisPost = capturedAuthHeaders.find(
      (call) => call.url === '/api/analysis',
    );
    expect(analysisPost?.auth).toBe('Bearer sec-e2e-secret-1');

    const analysisPoll = capturedAuthHeaders.find(
      (call) => call.url === '/api/analysis/job-e2e-1',
    );
    expect(analysisPoll?.auth).toBe('Bearer sec-e2e-secret-1');
  });

  it('passes purchased tokenId and Bearer secret to Virtual Try-On after checkout and analysis', async () => {
    const user = userEvent.setup();
    Element.prototype.scrollIntoView = vi.fn();

    let vtoRequestAuth: string | null = null;
    let vtoRequestBody: Record<string, unknown> | null = null;

    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === '/api/checkout') {
          return jsonResponse(
            {
              payment_id: 'pay-e2e-vto',
              provider_reference: 'FLK-E2E-VTO',
              amount: 19000,
              currency: 'IDR',
              status: 'pending',
              snap_token: 'snap-e2e-vto',
              redirect_url:
                'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-e2e-vto',
              qris_url:
                'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-e2e-vto',
            },
            201,
          );
        }
        if (url === '/api/payments/pay-e2e-vto') {
          return jsonResponse({
            payment_id: 'pay-e2e-vto',
            provider_reference: 'FLK-E2E-VTO',
            amount: 19000,
            currency: 'IDR',
            status: 'paid',
            paid_at: '2026-04-06T12:00:00Z',
            token_id: 'tok-e2e-vto',
            token_secret: 'sec-e2e-vto',
          });
        }
        if (url === '/api/upload') {
          const fd = init?.body as FormData;
          return jsonResponse(
            { photo_path: `${String(fd?.get('kind'))}/vto.png` },
            201,
          );
        }
        if (url === '/api/analysis') {
          return jsonResponse({ job_id: 'job-vto-1', status: 'completed' }, 201);
        }
        if (url === '/api/analysis/job-vto-1') {
          return jsonResponse({
            status: 'completed',
            result: {
              personal_color: {
                primary_season: 'winter',
                sub_season: 'deep winter',
                confidence_level: 'high',
                recommended_colors: ['Navy'],
              },
              body_shape: {
                category: 'rectangle',
                confidence_level: 'high',
                styling_guidance: ['Layered blazer'],
              },
            },
          });
        }
        if (url.startsWith('/api/recommendations')) {
          return jsonResponse({
            tops: [
              {
                id: 'top-vto-1',
                name: 'Navy Tailored Blazer',
                brand: 'FLICKS',
                category: 'tops',
                imagePath: 'https://storage.local/blazer.jpg',
              },
            ],
            bottoms: [],
          });
        }
        if (url === '/api/virtual-try-on') {
          vtoRequestAuth = readAuthHeader(init);
          vtoRequestBody = JSON.parse(String(init?.body ?? '{}')) as Record<
            string,
            unknown
          >;
          return jsonResponse({
            status: 'succeeded',
            result_image_uri: 'https://fashn.cdn/e2e-tryon.jpg',
            quota: { canTryTop: false, canTryBottom: true },
          });
        }
        return jsonResponse({}, 404);
      });
    vi.stubGlobal('fetch', fetchMock);

    let snapCallbacks: { onSuccess?: (result: unknown) => void } | undefined;
    window.snap = {
      pay: vi.fn((_token: string, callbacks) => {
        snapCallbacks = callbacks;
      }),
    };

    render(<AnalyzePage />);

    fireEvent.click(
      screen.getByRole('button', { name: /Beli Token Analisis — Rp19\.000/i }),
    );
    await waitFor(() => expect(snapCallbacks).toBeDefined());
    await act(async () => {
      snapCallbacks?.onSuccess?.({ transaction_status: 'settlement' });
    });

    const faceInput = screen.getByLabelText(/foto wajah/i) as HTMLInputElement;
    const bodyInput = screen.getByLabelText(
      /foto seluruh tubuh/i,
    ) as HTMLInputElement;
    await waitFor(() => expect(faceInput.disabled).toBe(false));

    await user.upload(faceInput, validFile('face.png'));
    await user.upload(bodyInput, validFile('body.png'));
    await user.click(screen.getByRole('radio', { name: /pria/i }));
    await user.click(
      screen.getByRole('checkbox', { name: /saya menyetujui pemrosesan foto/i }),
    );
    await user.click(
      screen.getByRole('button', { name: /analisis dengan gemini ai/i }),
    );

    const selectTopBtn = await screen.findByRole('button', {
      name: /Pilih Atasan: Navy Tailored Blazer/i,
    });
    await user.click(selectTopBtn);
    await user.click(
      screen.getByRole('button', { name: /COBA VIRTUAL TRY-ON SEKARANG/i }),
    );

    await waitFor(() => {
      expect(screen.getByAltText('Hasil Virtual Try-On')).toBeTruthy();
    });

    expect(vtoRequestAuth).toBe('Bearer sec-e2e-vto');
    expect(vtoRequestBody).toMatchObject({
      top_product_id: 'top-vto-1',
      token_id: 'tok-e2e-vto',
    });
  });

  it('allows purchasing a replacement token from #checkout-section when VTO quota is exhausted', async () => {
    const user = userEvent.setup();
    Element.prototype.scrollIntoView = vi.fn();

    let checkoutCount = 0;
    const vtoRequests: Array<{ auth: string | null; tokenId: unknown }> = [];

    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === '/api/checkout') {
          checkoutCount += 1;
          return jsonResponse(
            {
              payment_id: `pay-topup-${checkoutCount}`,
              provider_reference: `FLK-TOPUP-${checkoutCount}`,
              amount: 19000,
              currency: 'IDR',
              status: 'pending',
              snap_token: `snap-topup-${checkoutCount}`,
              redirect_url: `https://app.sandbox.midtrans.com/snap/v4/redirection/snap-topup-${checkoutCount}`,
            },
            201,
          );
        }
        if (url === '/api/payments/pay-topup-1') {
          return jsonResponse({
            payment_id: 'pay-topup-1',
            provider_reference: 'FLK-TOPUP-1',
            amount: 19000,
            currency: 'IDR',
            status: 'paid',
            paid_at: '2026-04-06T12:00:00Z',
            token_id: 'tok-topup-1',
            token_secret: 'toksec-1',
          });
        }
        if (url === '/api/payments/pay-topup-2') {
          return jsonResponse({
            payment_id: 'pay-topup-2',
            provider_reference: 'FLK-TOPUP-2',
            amount: 19000,
            currency: 'IDR',
            status: 'paid',
            paid_at: '2026-04-06T12:05:00Z',
            token_id: 'tok-topup-2',
            token_secret: 'toksec-2',
          });
        }
        if (url === '/api/upload') {
          const fd = init?.body as FormData;
          return jsonResponse(
            { photo_path: `${String(fd?.get('kind'))}/topup.png` },
            201,
          );
        }
        if (url === '/api/analysis') {
          return jsonResponse({ job_id: 'job-topup-1', status: 'completed' }, 201);
        }
        if (url === '/api/analysis/job-topup-1') {
          return jsonResponse({
            status: 'completed',
            result: {
              personal_color: {
                primary_season: 'autumn',
                sub_season: 'warm autumn',
                confidence_level: 'high',
                recommended_colors: ['Olive'],
              },
              body_shape: {
                category: 'hourglass',
                confidence_level: 'high',
                styling_guidance: ['Tailored waist'],
              },
            },
          });
        }
        if (url.startsWith('/api/recommendations')) {
          return jsonResponse({
            tops: [
              {
                id: 'top-up-1',
                name: 'Olive Linen Shirt',
                brand: 'FLICKS',
                category: 'tops',
                imagePath: 'https://storage.local/shirt.jpg',
              },
            ],
            bottoms: [],
          });
        }
        if (url === '/api/virtual-try-on') {
          const parsed = JSON.parse(String(init?.body ?? '{}')) as Record<
            string,
            unknown
          >;
          vtoRequests.push({
            auth: readAuthHeader(init),
            tokenId: parsed.token_id,
          });
          return jsonResponse({
            status: 'succeeded',
            result_image_uri: 'https://fashn.cdn/topup-tryon.jpg',
            quota:
              vtoRequests.length === 1
                ? { canTryTop: false, canTryBottom: false }
                : { canTryTop: false, canTryBottom: true },
          });
        }
        return jsonResponse({}, 404);
      });
    vi.stubGlobal('fetch', fetchMock);

    window.snap = {
      pay: vi.fn((_token: string, callbacks) => {
        callbacks?.onSuccess?.({ transaction_status: 'settlement' });
      }),
    };

    render(<AnalyzePage />);

    fireEvent.click(
      screen.getByRole('button', { name: /Beli Token Analisis — Rp19\.000/i }),
    );

    const faceInput = screen.getByLabelText(/foto wajah/i) as HTMLInputElement;
    const bodyInput = screen.getByLabelText(
      /foto seluruh tubuh/i,
    ) as HTMLInputElement;
    await waitFor(() => expect(faceInput.disabled).toBe(false));

    await user.upload(faceInput, validFile('face.png'));
    await user.upload(bodyInput, validFile('body.png'));
    await user.click(screen.getByRole('radio', { name: /pria/i }));
    await user.click(
      screen.getByRole('checkbox', { name: /saya menyetujui pemrosesan foto/i }),
    );
    await user.click(
      screen.getByRole('button', { name: /analisis dengan gemini ai/i }),
    );

    await user.click(
      await screen.findByRole('button', { name: /Pilih Atasan: Olive Linen Shirt/i }),
    );
    await user.click(
      screen.getByRole('button', { name: /COBA VIRTUAL TRY-ON SEKARANG/i }),
    );

    const upsellLink = await screen.findByRole('link', {
      name: /Tambah Kuota Try-On/i,
    });
    expect(upsellLink.getAttribute('href')).toBe('#checkout-section');

    const repeatBuyBtn = await screen.findByRole('button', {
      name: /Beli Token Baru — Rp19\.000/i,
    });
    await user.click(repeatBuyBtn);

    await waitFor(() => {
      expect(screen.getByText(/Token analisis aktif \(tok-topup-2\)/i)).toBeTruthy();
      expect(screen.getByText(/Kuota Atasan: 1\/1 Tersedia/i)).toBeTruthy();
    });

    await user.click(
      await screen.findByRole('button', { name: /Pilih Atasan: Olive Linen Shirt/i }),
    );
    await user.click(
      screen.getByRole('button', { name: /COBA VIRTUAL TRY-ON SEKARANG/i }),
    );

    await waitFor(() => {
      expect(vtoRequests).toHaveLength(2);
    });
    expect(vtoRequests[1]).toEqual({
      auth: 'Bearer toksec-2',
      tokenId: 'tok-topup-2',
    });
  });

  it('forwards server-side MIDTRANS_CLIENT_KEY and MIDTRANS_IS_PRODUCTION into snap.js script tag', () => {
    process.env.MIDTRANS_CLIENT_KEY = 'SB-Mid-client-server-env';
    process.env.MIDTRANS_IS_PRODUCTION = 'false';

    render(<AnalyzePage />);

    const sandboxScript = document.head.querySelector(
      'script[data-midtrans-snap="true"]',
    );
    expect(sandboxScript?.getAttribute('data-client-key')).toBe(
      'SB-Mid-client-server-env',
    );
    expect(sandboxScript?.getAttribute('src')).toBe(
      'https://app.sandbox.midtrans.com/snap/snap.js',
    );

    cleanup();
    document.head.innerHTML = '';

    process.env.MIDTRANS_CLIENT_KEY = 'Mid-client-prod-env';
    process.env.MIDTRANS_IS_PRODUCTION = 'true';

    render(<AnalyzePage />);

    const prodScript = document.head.querySelector(
      'script[data-midtrans-snap="true"]',
    );
    expect(prodScript?.getAttribute('data-client-key')).toBe(
      'Mid-client-prod-env',
    );
    expect(prodScript?.getAttribute('src')).toBe(
      'https://app.midtrans.com/snap/snap.js',
    );
  });
});
