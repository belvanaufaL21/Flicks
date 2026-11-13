// @vitest-environment jsdom
import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SnapCheckout } from '../../src/components/checkout/snap-checkout';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('SnapCheckout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = '';
    delete window.snap;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete window.snap;
    document.head.innerHTML = '';
  });

  it('renders Rp19.000 checkout button with QRIS and GoPay badges', () => {
    render(
      <SnapCheckout
        clientKey="SB-Mid-client-test"
        onSuccess={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: /Rp19\.000/i }),
    ).toBeDefined();
    expect(screen.getByText(/QRIS/i)).toBeDefined();
    expect(screen.getByText(/GoPay/i)).toBeDefined();
    expect(screen.queryByText(/Virtual Account/i)).toBeNull();
  });

  it('injects sandbox or production snap.js script with data-client-key without duplicating', () => {
    const { rerender } = render(
      <SnapCheckout
        clientKey="SB-Mid-client-sandbox"
        isProduction={false}
        onSuccess={vi.fn()}
      />,
    );

    const sandboxScripts = document.head.querySelectorAll(
      'script[data-midtrans-snap="true"]',
    );
    expect(sandboxScripts.length).toBe(1);
    expect(sandboxScripts[0]?.getAttribute('src')).toBe(
      'https://app.sandbox.midtrans.com/snap/snap.js',
    );
    expect(sandboxScripts[0]?.getAttribute('data-client-key')).toBe(
      'SB-Mid-client-sandbox',
    );

    rerender(
      <SnapCheckout
        clientKey="SB-Mid-client-sandbox"
        isProduction={false}
        onSuccess={vi.fn()}
      />,
    );
    expect(
      document.head.querySelectorAll('script[data-midtrans-snap="true"]').length,
    ).toBe(1);

    document.head.innerHTML = '';
    render(
      <SnapCheckout
        clientKey="Mid-client-prod"
        isProduction={true}
        onSuccess={vi.fn()}
      />,
    );
    const prodScript = document.head.querySelector(
      'script[data-midtrans-snap="true"]',
    );
    expect(prodScript?.getAttribute('src')).toBe(
      'https://app.midtrans.com/snap/snap.js',
    );
    expect(prodScript?.getAttribute('data-client-key')).toBe(
      'Mid-client-prod',
    );
  });

  it('shows loading state during checkout creation, opens window.snap.pay, and hands over token on onSuccess', async () => {
    let resolveCheckout!: (res: Response) => void;
    const checkoutPromise = new Promise<Response>((resolve) => {
      resolveCheckout = resolve;
    });

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/checkout') {
        return checkoutPromise;
      }
      if (url === '/api/payments/pay-1') {
        return Promise.resolve(
          jsonResponse({
            payment_id: 'pay-1',
            provider_reference: 'FLK-ORD-1',
            amount: 19000,
            currency: 'IDR',
            status: 'paid',
            paid_at: '2026-04-06T12:00:00Z',
            token_id: 'tok-1',
            token_secret: 'sec-1',
          }),
        );
      }
      return Promise.resolve(jsonResponse({}, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    let snapCallbacks:
      | {
          onSuccess?: (res: unknown) => void;
          onPending?: (res: unknown) => void;
          onError?: (res: unknown) => void;
          onClose?: () => void;
        }
      | undefined;

    const payMock = vi.fn((_token: string, callbacks) => {
      snapCallbacks = callbacks;
    });
    window.snap = { pay: payMock };

    const onSuccess = vi.fn();
    render(
      <SnapCheckout clientKey="SB-Mid-client-test" onSuccess={onSuccess} />,
    );

    const cta = screen.getByRole('button', { name: /Rp19\.000/i });
    fireEvent.click(cta);

    expect(cta.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('status').textContent).toMatch(/Membuat/i);

    await act(async () => {
      resolveCheckout(
        jsonResponse(
          {
            payment_id: 'pay-1',
            provider_reference: 'FLK-ORD-1',
            amount: 19000,
            currency: 'IDR',
            status: 'pending',
            snap_token: 'snap-tok-123',
            redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-tok-123',
            qris_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-tok-123',
          },
          201,
        ),
      );
    });

    await waitFor(() => {
      expect(payMock).toHaveBeenCalledTimes(1);
    });
    expect(payMock.mock.calls[0]?.[0]).toBe('snap-tok-123');

    await act(async () => {
      snapCallbacks?.onSuccess?.({ transaction_status: 'settlement' });
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(onSuccess).toHaveBeenCalledWith({
      paymentId: 'pay-1',
      providerReference: 'FLK-ORD-1',
      tokenId: 'tok-1',
      tokenSecret: 'sec-1',
    });
  });

  it('polls every 2 seconds up to 60 seconds when payment status is still pending after onSuccess', async () => {
    vi.useFakeTimers();

    let pollCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/checkout') {
        return jsonResponse(
          {
            payment_id: 'pay-poll',
            provider_reference: 'FLK-ORD-POLL',
            amount: 19000,
            currency: 'IDR',
            status: 'pending',
            snap_token: 'snap-tok-poll',
            redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-tok-poll',
            qris_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-tok-poll',
          },
          201,
        );
      }
      if (url === '/api/payments/pay-poll') {
        pollCount += 1;
        if (pollCount < 3) {
          return jsonResponse({
            payment_id: 'pay-poll',
            provider_reference: 'FLK-ORD-POLL',
            amount: 19000,
            currency: 'IDR',
            status: 'pending',
            paid_at: null,
          });
        }
        return jsonResponse({
          payment_id: 'pay-poll',
          provider_reference: 'FLK-ORD-POLL',
          amount: 19000,
          currency: 'IDR',
          status: 'paid',
          paid_at: '2026-04-06T12:00:05Z',
          token_id: 'tok-poll',
          token_secret: 'sec-poll',
        });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    let snapCallbacks: { onSuccess?: (r: unknown) => void } | undefined;
    window.snap = {
      pay: vi.fn((_token: string, callbacks) => {
        snapCallbacks = callbacks;
      }),
    };

    const onSuccess = vi.fn();
    render(
      <SnapCheckout clientKey="SB-Mid-client-test" onSuccess={onSuccess} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Rp19\.000/i }));
      await Promise.resolve();
    });

    await act(async () => {
      snapCallbacks?.onSuccess?.({ transaction_status: 'capture' });
      await Promise.resolve();
    });

    expect(pollCount).toBe(1);
    expect(onSuccess).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(pollCount).toBe(2);
    expect(onSuccess).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(pollCount).toBe(3);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith({
      paymentId: 'pay-poll',
      providerReference: 'FLK-ORD-POLL',
      tokenId: 'tok-poll',
      tokenSecret: 'sec-poll',
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(pollCount).toBe(3);
  });

  it('stops polling after 60 seconds timeout when payment stays pending', async () => {
    vi.useFakeTimers();

    let pollCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/checkout') {
        return jsonResponse(
          {
            payment_id: 'pay-timeout',
            provider_reference: 'FLK-ORD-TIMEOUT',
            amount: 19000,
            currency: 'IDR',
            status: 'pending',
            snap_token: 'snap-tok-timeout',
            redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-tok-timeout',
            qris_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-tok-timeout',
          },
          201,
        );
      }
      if (url === '/api/payments/pay-timeout') {
        pollCount += 1;
        return jsonResponse({
          payment_id: 'pay-timeout',
          provider_reference: 'FLK-ORD-TIMEOUT',
          amount: 19000,
          currency: 'IDR',
          status: 'pending',
          paid_at: null,
        });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    let snapCallbacks: { onPending?: (r: unknown) => void } | undefined;
    window.snap = {
      pay: vi.fn((_token: string, callbacks) => {
        snapCallbacks = callbacks;
      }),
    };

    const onSuccess = vi.fn();
    render(
      <SnapCheckout clientKey="SB-Mid-client-test" onSuccess={onSuccess} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Rp19\.000/i }));
      await Promise.resolve();
    });

    await act(async () => {
      snapCallbacks?.onPending?.({ transaction_status: 'pending' });
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });

    const countAt60s = pollCount;
    expect(countAt60s).toBeGreaterThanOrEqual(2);
    expect(countAt60s).toBeLessThanOrEqual(31);
    expect(onSuccess).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(pollCount).toBe(countAt60s);
    expect(
      screen.getByRole('button', { name: /Cek Status Pembayaran/i }),
    ).toBeDefined();
  });

  it('allows reopening Snap popup on onClose without creating a duplicate checkout order', async () => {
    let checkoutCalls = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/checkout') {
        checkoutCalls += 1;
        return jsonResponse(
          {
            payment_id: 'pay-reopen',
            provider_reference: 'FLK-ORD-REOPEN',
            amount: 19000,
            currency: 'IDR',
            status: 'pending',
            snap_token: 'snap-tok-reopen',
            redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-tok-reopen',
            qris_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-tok-reopen',
          },
          201,
        );
      }
      if (url === '/api/payments/pay-reopen') {
        return jsonResponse({
          payment_id: 'pay-reopen',
          provider_reference: 'FLK-ORD-REOPEN',
          amount: 19000,
          currency: 'IDR',
          status: 'pending',
          paid_at: null,
        });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    let snapCallbacks: { onClose?: () => void } | undefined;
    const payMock = vi.fn((_token: string, callbacks) => {
      snapCallbacks = callbacks;
    });
    window.snap = { pay: payMock };

    render(
      <SnapCheckout clientKey="SB-Mid-client-test" onSuccess={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Rp19\.000/i }));

    await waitFor(() => {
      expect(payMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      snapCallbacks?.onClose?.();
    });

    const reopenBtn = await screen.findByRole('button', {
      name: /Buka Kembali Pembayaran/i,
    });
    fireEvent.click(reopenBtn);

    expect(payMock).toHaveBeenCalledTimes(2);
    expect(payMock.mock.calls[1]?.[0]).toBe('snap-tok-reopen');
    expect(checkoutCalls).toBe(1);
  });

  it('shows ad-blocker guidance and redirect_url fallback when snap.js fails to load', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/checkout') {
        return jsonResponse(
          {
            payment_id: 'pay-fallback',
            provider_reference: 'FLK-ORD-FALLBACK',
            amount: 19000,
            currency: 'IDR',
            status: 'pending',
            snap_token: 'snap-tok-fallback',
            redirect_url:
              'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-tok-fallback',
            qris_url:
              'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-tok-fallback',
          },
          201,
        );
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <SnapCheckout clientKey="SB-Mid-client-test" onSuccess={vi.fn()} />,
    );

    const script = document.head.querySelector(
      'script[data-midtrans-snap="true"]',
    );
    expect(script).not.toBeNull();
    fireEvent.error(script as Element);

    fireEvent.click(screen.getByRole('button', { name: /Rp19\.000/i }));

    const fallbackLink = await screen.findByRole('link', {
      name: /Lanjutkan Pembayaran di Midtrans/i,
    });
    expect(fallbackLink.getAttribute('href')).toBe(
      'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-tok-fallback',
    );
    expect(screen.getByRole('alert').textContent).toMatch(/pemblokir iklan|ad-blocker/i);
  });

  it('displays error message when onError callback is triggered', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          payment_id: 'pay-err',
          provider_reference: 'FLK-ORD-ERR',
          amount: 19000,
          currency: 'IDR',
          status: 'pending',
          snap_token: 'snap-tok-err',
          redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-tok-err',
          qris_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-tok-err',
        },
        201,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    let snapCallbacks: { onError?: (err: unknown) => void } | undefined;
    window.snap = {
      pay: vi.fn((_token: string, callbacks) => {
        snapCallbacks = callbacks;
      }),
    };

    render(
      <SnapCheckout clientKey="SB-Mid-client-test" onSuccess={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Rp19\.000/i }));

    await waitFor(() => {
      expect(snapCallbacks).toBeDefined();
    });

    await act(async () => {
      snapCallbacks?.onError?.({ status_message: 'Payment failed' });
    });

    expect(screen.getByRole('alert').textContent).toMatch(
      /Pembayaran gagal diproses/i,
    );
  });

  it('supports manual status check button and React StrictMode snap.js script load', async () => {
    let pollStep = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/checkout') {
        return jsonResponse(
          {
            payment_id: 'pay-manual',
            provider_reference: 'FLK-ORD-MANUAL',
            amount: 19000,
            currency: 'IDR',
            status: 'pending',
            snap_token: 'snap-tok-manual',
            redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-tok-manual',
            qris_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-tok-manual',
          },
          201,
        );
      }
      if (url === '/api/payments/pay-manual') {
        pollStep += 1;
        if (pollStep === 1) {
          return jsonResponse({
            payment_id: 'pay-manual',
            provider_reference: 'FLK-ORD-MANUAL',
            amount: 19000,
            currency: 'IDR',
            status: 'pending',
            paid_at: null,
          });
        }
        return jsonResponse({
          payment_id: 'pay-manual',
          provider_reference: 'FLK-ORD-MANUAL',
          amount: 19000,
          currency: 'IDR',
          status: 'paid',
          paid_at: '2026-04-06T12:00:05Z',
          token_id: 'tok-manual',
          token_secret: 'sec-manual',
        });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const payMock = vi.fn((_token: string, callbacks?: { onPending?: (r: unknown) => void }) => {
      callbacks?.onPending?.({ transaction_status: 'pending' });
    });

    const onSuccess = vi.fn();
    render(
      <React.StrictMode>
        <SnapCheckout clientKey="SB-Mid-client-test" onSuccess={onSuccess} />
      </React.StrictMode>,
    );

    const script = document.head.querySelector('script[data-midtrans-snap="true"]');
    expect(script).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Rp19\.000/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/checkout', expect.anything());
    });

    window.snap = { pay: payMock };
    fireEvent.load(script as Element);

    const checkBtn = await screen.findByRole('button', {
      name: /Cek Status Pembayaran/i,
    });
    fireEvent.click(checkBtn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({
        paymentId: 'pay-manual',
        providerReference: 'FLK-ORD-MANUAL',
        tokenId: 'tok-manual',
        tokenSecret: 'sec-manual',
      });
    });
  });

  it('allows starting a repeat purchase after payment succeeds (upsell / top-up)', async () => {
    let checkoutCall = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/checkout') {
        checkoutCall += 1;
        return jsonResponse(
          {
            payment_id: `pay-repeat-${checkoutCall}`,
            provider_reference: `FLK-ORD-R${checkoutCall}`,
            amount: 19000,
            currency: 'IDR',
            status: 'pending',
            snap_token: `snap-tok-r${checkoutCall}`,
            redirect_url: `https://app.sandbox.midtrans.com/snap/v2/vtweb/r${checkoutCall}`,
          },
          201,
        );
      }
      if (url === '/api/payments/pay-repeat-1') {
        return jsonResponse({
          payment_id: 'pay-repeat-1',
          provider_reference: 'FLK-ORD-R1',
          amount: 19000,
          currency: 'IDR',
          status: 'paid',
          paid_at: '2026-04-06T12:00:05Z',
          token_id: 'tok-r1',
          token_secret: 'sec-r1',
        });
      }
      if (url === '/api/payments/pay-repeat-2') {
        return jsonResponse({
          payment_id: 'pay-repeat-2',
          provider_reference: 'FLK-ORD-R2',
          amount: 19000,
          currency: 'IDR',
          status: 'paid',
          paid_at: '2026-04-06T12:05:05Z',
          token_id: 'tok-r2',
          token_secret: 'sec-r2',
        });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    window.snap = {
      pay: vi.fn((_token, callbacks) => {
        callbacks?.onSuccess?.({ transaction_status: 'settlement' });
      }),
    };

    const onSuccess = vi.fn();
    render(<SnapCheckout clientKey="SB-Mid-client-test" onSuccess={onSuccess} />);

    fireEvent.click(
      screen.getByRole('button', { name: /Beli Token Analisis — Rp19\.000/i }),
    );

    await waitFor(() => {
      expect(onSuccess).toHaveBeenNthCalledWith(1, {
        paymentId: 'pay-repeat-1',
        providerReference: 'FLK-ORD-R1',
        tokenId: 'tok-r1',
        tokenSecret: 'sec-r1',
      });
    });

    const repeatBtn = await screen.findByRole('button', {
      name: /Beli Token Baru — Rp19\.000/i,
    });
    fireEvent.click(repeatBtn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenNthCalledWith(2, {
        paymentId: 'pay-repeat-2',
        providerReference: 'FLK-ORD-R2',
        tokenId: 'tok-r2',
        tokenSecret: 'sec-r2',
      });
    });
    expect(window.snap.pay).toHaveBeenNthCalledWith(
      2,
      'snap-tok-r2',
      expect.any(Object),
    );
  });

  it('clears prior order controls when repeat checkout creation fails', async () => {
    let checkoutCall = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/checkout') {
        checkoutCall += 1;
        if (checkoutCall === 1) {
          return jsonResponse(
            {
              payment_id: 'pay-ok-1',
              provider_reference: 'FLK-ORD-OK1',
              amount: 19000,
              currency: 'IDR',
              status: 'pending',
              snap_token: 'snap-tok-ok1',
              redirect_url: 'https://app.sandbox.midtrans.com/snap/v2/vtweb/ok1',
            },
            201,
          );
        }
        return jsonResponse({ message: 'Gateway sementara sibuk.' }, 502);
      }
      if (url === '/api/payments/pay-ok-1') {
        return jsonResponse({
          payment_id: 'pay-ok-1',
          provider_reference: 'FLK-ORD-OK1',
          amount: 19000,
          currency: 'IDR',
          status: 'paid',
          paid_at: '2026-04-06T12:00:05Z',
          token_id: 'tok-ok1',
          token_secret: 'sec-ok1',
        });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    window.snap = {
      pay: vi.fn((_token, callbacks) => {
        callbacks?.onSuccess?.({ transaction_status: 'settlement' });
      }),
    };

    const onSuccess = vi.fn();
    render(<SnapCheckout clientKey="SB-Mid-client-test" onSuccess={onSuccess} />);

    fireEvent.click(
      screen.getByRole('button', { name: /Beli Token Analisis — Rp19\.000/i }),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));

    const repeatBtn = await screen.findByRole('button', {
      name: /Beli Token Baru — Rp19\.000/i,
    });
    fireEvent.click(repeatBtn);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Gateway sementara sibuk.');
    expect(
      screen.queryByRole('button', { name: /Cek Status Pembayaran/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Buka Kembali Pembayaran/i }),
    ).toBeNull();
  });

  it('auto-resumes verification when redirected back with ?order_id=flicks-... and unlocks token', async () => {
    window.history.replaceState(
      {},
      '',
      '/?order_id=flicks-pay-redir&status_code=200&transaction_status=settlement',
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/payments/pay-redir') {
        return jsonResponse({
          payment_id: 'pay-redir',
          provider_reference: 'flicks-pay-redir',
          amount: 19000,
          currency: 'IDR',
          status: 'paid',
          paid_at: '2026-04-06T12:00:05Z',
          token_id: 'tok-redir',
          token_secret: 'sec-redir',
        });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const onSuccess = vi.fn();
    try {
      render(
        <SnapCheckout clientKey="SB-Mid-client-test" onSuccess={onSuccess} />,
      );

      await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
      expect(onSuccess).toHaveBeenCalledWith({
        paymentId: 'pay-redir',
        providerReference: 'flicks-pay-redir',
        tokenId: 'tok-redir',
        tokenSecret: 'sec-redir',
      });
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('ignores client transaction_status=settlement when backend is still pending and hides reopen button without snapToken', async () => {
    window.history.replaceState(
      {},
      '',
      '/?order_id=flicks-pay-pending-redir&status_code=200&transaction_status=settlement',
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/payments/pay-pending-redir') {
        return jsonResponse({
          payment_id: 'pay-pending-redir',
          provider_reference: 'flicks-pay-pending-redir',
          amount: 19000,
          currency: 'IDR',
          status: 'pending',
          paid_at: null,
        });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const onSuccess = vi.fn();
    try {
      render(
        <SnapCheckout clientKey="SB-Mid-client-test" onSuccess={onSuccess} />,
      );

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith('/api/payments/pay-pending-redir'),
      );
      expect(onSuccess).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', { name: /Cek Status Pembayaran/i }),
      ).toBeDefined();
      expect(
        screen.queryByRole('button', { name: /Buka Kembali Pembayaran/i }),
      ).toBeNull();
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('completes ?order_id= auto-resume cleanly under React StrictMode', async () => {
    window.history.replaceState(
      {},
      '',
      '/?order_id=flicks-pay-strict&status_code=200&transaction_status=settlement',
    );

    let resolveFirstFetch!: (res: Response) => void;
    let callCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/payments/pay-strict') {
        callCount += 1;
        if (callCount === 1) {
          return new Promise<Response>((resolve) => {
            resolveFirstFetch = resolve;
          });
        }
        return Promise.resolve(
          jsonResponse({
            payment_id: 'pay-strict',
            provider_reference: 'flicks-pay-strict',
            amount: 19000,
            currency: 'IDR',
            status: 'paid',
            paid_at: '2026-04-06T12:00:05Z',
            token_id: 'tok-strict',
            token_secret: 'sec-strict',
          }),
        );
      }
      return Promise.resolve(jsonResponse({}, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    const onSuccess = vi.fn();
    try {
      render(
        <React.StrictMode>
          <SnapCheckout clientKey="SB-Mid-client-test" onSuccess={onSuccess} />
        </React.StrictMode>,
      );

      await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
      expect(callCount).toBe(2);
      resolveFirstFetch(
        jsonResponse({
          payment_id: 'pay-strict',
          provider_reference: 'flicks-pay-strict',
          amount: 19000,
          currency: 'IDR',
          status: 'pending',
          paid_at: null,
        }),
      );
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });
});
