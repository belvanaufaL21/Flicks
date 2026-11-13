import { NextResponse } from 'next/server';
import { createDefaultAdminService } from '@/server/admin/admin.service';
import {
  canUseLocalDevFallback,
  isSupabaseConfigured,
} from '@/server/dev/local-memory-store';
import { recordOperationalEvent } from '@/server/monitoring/monitor';
import { createSupabasePhotoCleanupService } from '@/server/storage/cleanup-expired-photos';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
};

export async function POST(request: Request) {
  const service = createDefaultAdminService();
  try {
    const admin = await service.assertAdminSession(request);

    if (!isSupabaseConfigured() && !canUseLocalDevFallback()) {
      return NextResponse.json(
        { ok: false, error: 'SERVER_MISCONFIGURED' },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    const cleanupService = createSupabasePhotoCleanupService();
    const { deletedCount } = await cleanupService.run();

    recordOperationalEvent({
      category: 'operator_action',
      severity: 'info',
      code: 'MANUAL_PHOTO_CLEANUP_EXECUTED',
      message: 'Operator triggered manual expired photo cleanup',
      metadata: {
        actor: admin?.userId ?? 'admin',
        deletedCount,
      },
    });

    return NextResponse.json(
      { ok: true, deletedCount, failedCount: 0 },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CLEANUP_FAILED';
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
      { ok: false, error: 'CLEANUP_FAILED' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
