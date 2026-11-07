import { NextResponse } from 'next/server';
import {
  createSupabaseMidtransService,
  type MidtransNotificationPayload,
} from '@/server/payments/midtrans.service';

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export async function POST(request: Request) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    !process.env.MIDTRANS_SERVER_KEY?.trim()
  ) {
    return errorResponse(
      503,
      'INTERNAL_ERROR',
      'Webhook service is not configured',
    );
  }

  let payload: MidtransNotificationPayload;
  try {
    payload = (await request.json()) as MidtransNotificationPayload;
  } catch {
    return errorResponse(400, 'INVALID_PAYLOAD', 'Webhook body must be JSON');
  }

  try {
    const outcome =
      await createSupabaseMidtransService().handleNotification(payload);

    if (!outcome.ok) {
      if (outcome.code === 'INVALID_SIGNATURE') {
        return errorResponse(
          401,
          'INVALID_SIGNATURE',
          'Invalid Midtrans notification signature',
        );
      }
      if (outcome.code === 'PAYMENT_NOT_FOUND') {
        return errorResponse(
          404,
          'PAYMENT_NOT_FOUND',
          'Payment transaction was not found',
        );
      }
      return errorResponse(
        400,
        'INVALID_AMOUNT',
        'Notification amount does not match payment record',
      );
    }

    return NextResponse.json(
      {
        payment_id: outcome.payment.id,
        provider_reference: outcome.payment.providerReference,
        status: outcome.payment.status,
        token_id: outcome.tokenId,
        idempotent: outcome.idempotent,
      },
      { status: 200 },
    );
  } catch {
    return errorResponse(
      500,
      'INTERNAL_ERROR',
      'Failed to process payment notification',
    );
  }
}
