import { NextResponse } from 'next/server';
import { createDefaultAdminService } from '@/server/admin/admin.service';
import {
  getKillSwitchState,
  setKillSwitchState,
} from '@/server/security/kill-switch';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
};

function mapAdminErrorToResponse(error: unknown) {
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
    { ok: false, code: 'INTERNAL_ERROR' },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}

export async function GET(request: Request) {
  try {
    const service = createDefaultAdminService();
    await service.assertAdminSession(request);
    const killSwitch = await getKillSwitchState();
    return NextResponse.json(
      { ok: true, killSwitch },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return mapAdminErrorToResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const service = createDefaultAdminService();
    await service.assertAdminSession(request);

    let body: { paidWorkPaused?: unknown; reason?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { ok: false, code: 'INVALID_BODY', message: 'Body must be valid JSON' },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    if (typeof body.paidWorkPaused !== 'boolean') {
      return NextResponse.json(
        {
          ok: false,
          code: 'INVALID_BODY',
          message: 'paidWorkPaused must be a boolean',
        },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const killSwitch = await setKillSwitchState({
      paidWorkPaused: body.paidWorkPaused,
      reason: typeof body.reason === 'string' ? body.reason : null,
    });

    return NextResponse.json(
      { ok: true, killSwitch },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return mapAdminErrorToResponse(error);
  }
}
