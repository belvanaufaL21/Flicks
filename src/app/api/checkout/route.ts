import { NextResponse } from 'next/server';
import { createSupabaseMidtransService } from '@/server/payments/midtrans.service';
import { enforceRateLimit } from '@/server/security/rate-limiter';

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export async function POST(request?: Request) {
  const rateLimited = enforceRateLimit(request, 'checkout');
  if (rateLimited) {
    return rateLimited;
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    !process.env.MIDTRANS_SERVER_KEY?.trim()
  ) {
    return errorResponse(
      503,
      'INTERNAL_ERROR',
      'Payment service is not configured',
    );
  }

  try {
    const payment =
      await createSupabaseMidtransService().createSnapTransaction();

    return NextResponse.json(
      {
        payment_id: payment.id,
        provider_reference: payment.providerReference,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        snap_token: payment.snapToken,
        redirect_url: payment.redirectUrl,
        qris_url: payment.redirectUrl,
      },
      { status: 201 },
    );
  } catch {
    return errorResponse(
      502,
      'PROVIDER_ERROR',
      'Failed to create Midtrans Snap transaction',
    );
  }
}
