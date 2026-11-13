import { NextResponse } from 'next/server';
import { config } from "@/lib/config";
import { ensureSessionHash, readReportSecret } from "@/lib/session";
import { startCheckout } from "@/services/payment.service";
import { getFlowState } from "@/services/session-state.service";
import { storeAvailable } from "@/lib/store";
import { createSupabaseMidtransService } from '@/server/payments/midtrans.service';
import { enforceRateLimit } from '@/server/security/rate-limiter';

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export async function POST(request?: Request) {
  if (!config.paidFeaturesEnabled) {
    return NextResponse.json({ error: 'Pembelian sedang dihentikan sementara.' }, { status: 503 });
  }

  if (request) {
    const rateLimited = enforceRateLimit(request, 'checkout');
    if (rateLimited) {
      return rateLimited;
    }
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() && !process.env.SUPABASE_SECRET_KEY?.trim()) ||
    !process.env.MIDTRANS_SERVER_KEY?.trim()
  ) {
    if (storeAvailable() && config.midtrans.mode === 'mock') {
      try {
        const sessionHash = await ensureSessionHash();
        const payment = await startCheckout(sessionHash);
        return NextResponse.json(
          {
            payment_id: payment.id,
            provider_reference: payment.providerReference,
            amount: payment.amount,
            currency: payment.currency,
            status: payment.status,
            snap_token: payment.paymentUrl ?? '',
            redirect_url: payment.paymentUrl ?? '',
            qris_url: payment.paymentUrl ?? '',
            orderId: payment.providerReference,
            paymentUrl: payment.paymentUrl,
            state: await getFlowState(sessionHash, await readReportSecret()),
          },
          { status: 201 },
        );
      } catch (err) {
        return errorResponse(502, 'PROVIDER_ERROR', (err as Error).message);
      }
    }

    return errorResponse(
      503,
      'INTERNAL_ERROR',
      'Payment service is not configured',
    );
  }

  try {
    const payment =
      await createSupabaseMidtransService().createSnapTransaction();

    let sessionHash: string | null = null;
    let flowState: unknown = null;
    try {
      sessionHash = await ensureSessionHash();
      if (sessionHash) {
        flowState = await getFlowState(sessionHash, await readReportSecret());
      }
    } catch {
      // Non-critical for headless or test callers
    }

    const responsePayload: Record<string, unknown> = {
      payment_id: payment.id,
      provider_reference: payment.providerReference,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      snap_token: payment.snapToken,
      redirect_url: payment.redirectUrl,
      qris_url: payment.redirectUrl,
    };

    if (request) {
      responsePayload.orderId = payment.providerReference;
      responsePayload.paymentUrl = payment.redirectUrl;
      if (flowState) {
        responsePayload.state = flowState;
      }
    }

    return NextResponse.json(responsePayload, { status: 201 });
  } catch {
    return errorResponse(
      502,
      'PROVIDER_ERROR',
      'Failed to create Midtrans Snap transaction',
    );
  }
}
