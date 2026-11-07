import { NextResponse } from 'next/server';
import {
  canUseLocalDevFallback,
  isSupabaseConfigured,
} from '@/server/dev/local-memory-store';
import {
  createSupabaseReportService,
  type ReportAssetKind,
} from '@/server/reports/report.service';
import { createSupabasePhotoStorage } from '@/server/storage/private-photo-storage';

const ALLOWED_KINDS = new Set<ReportAssetKind>([
  'vto_result',
  'face_photo',
  'body_photo',
]);

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ secret: string; kind: string }> },
) {
  if (!isSupabaseConfigured() && !canUseLocalDevFallback()) {
    return errorResponse(
      503,
      'INTERNAL_ERROR',
      'Report asset service is not configured',
    );
  }

  const { secret: rawSecret, kind: rawKind } = await context.params;
  const secret = rawSecret?.trim();
  const kind = rawKind?.trim() as ReportAssetKind;

  if (!secret || !ALLOWED_KINDS.has(kind)) {
    return errorResponse(404, 'ASSET_NOT_FOUND', 'Asset not found');
  }

  const reportService = createSupabaseReportService();
  const resolution = await reportService.getAssetPathForReport(secret, kind);

  if (resolution.status === 'expired') {
    return errorResponse(
      410,
      'REPORT_EXPIRED',
      'Masa aktif 72 jam laporan ini telah berakhir.',
    );
  }

  if (resolution.status === 'not_found' || !resolution.objectPath) {
    return errorResponse(404, 'ASSET_NOT_FOUND', 'Asset not found');
  }

  const storage = createSupabasePhotoStorage();
  const downloaded = await storage.read(resolution.objectPath);

  if (!downloaded) {
    return errorResponse(404, 'ASSET_NOT_FOUND', 'Stored asset not found');
  }

  return new NextResponse(Buffer.from(downloaded.bytes), {
    status: 200,
    headers: {
      'Content-Type': downloaded.mimeType,
      'Content-Length': String(downloaded.bytes.byteLength),
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}
