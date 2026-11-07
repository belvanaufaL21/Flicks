import { NextResponse } from 'next/server';
import { createSupabaseMidtransService } from '@/server/payments/midtrans.service';

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ paymentId: string }> },
) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  ) {
    return errorResponse(
      503,
      'INTERNAL_ERROR',
      'Payment service is not configured',
    );
  }

  try {
    const { paymentId } = await context.params;
    const payment =
      await createSupabaseMidtransService().getVerifiedPaymentStatus(
        paymentId,
      );

    if (!payment) {
      return errorResponse(
        404,
        'PAYMENT_NOT_FOUND',
        'Payment transaction was not found',
      );
    }

    return NextResponse.json(
      {
        payment_id: payment.id,
        provider_reference: payment.providerReference,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        paid_at: payment.paidAt,
      },
      { status: 200 },
    );
  } catch {
    return errorResponse(
      500,
      'INTERNAL_ERROR',
      'Failed to retrieve payment status',
    );
  }
}
