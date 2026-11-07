import { NextResponse } from 'next/server';
import { createDefaultAdminService } from '@/server/admin/admin.service';
import { createSupabaseTokenService } from '@/server/tokens/token.service';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
};

// ponytail: operator token reset + automatic token release on failed AI jobs covers MVP recovery without gateway fees; add Midtrans refund API only if cash chargebacks exceed manual volume.
export async function POST(
  request: Request,
  context: { params: Promise<{ tokenId: string }> },
) {
  const service = createDefaultAdminService();
  try {
    await service.assertAdminSession(request);

    const { tokenId } = await context.params;
    const rawBody = (await request.json().catch(() => ({}))) as {
      force?: unknown;
    };

    const tokenService = createSupabaseTokenService();
    const recovered = await tokenService.releaseToken(tokenId, {
      allowConsumed: Boolean(rawBody?.force),
    });

    if (!recovered) {
      return NextResponse.json(
        {
          ok: false,
          error: 'TOKEN_NOT_RECOVERABLE',
          message:
            'Token was not found or cannot be recovered without force=true',
        },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { ok: true, token: recovered },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
    if (message === 'UNAUTHENTICATED') {
      return NextResponse.json(
        { ok: false, code: 'UNAUTHENTICATED' },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }
    if (message === 'FORBIDDEN') {
      return NextResponse.json(
        { ok: false, code: 'FORBIDDEN' },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { ok: false, error: 'INTERNAL_ERROR' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
