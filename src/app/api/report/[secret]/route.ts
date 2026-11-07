import { NextResponse } from 'next/server';
import {
  canUseLocalDevFallback,
  isSupabaseConfigured,
} from '@/server/dev/local-memory-store';
import { createSupabaseReportService } from '@/server/reports/report.service';

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ secret: string }> },
) {
  if (!isSupabaseConfigured() && !canUseLocalDevFallback()) {
    return errorResponse(
      503,
      'INTERNAL_ERROR',
      'Report service is not configured',
    );
  }

  const { secret: rawSecret } = await context.params;
  const secret = rawSecret?.trim();
  if (!secret) {
    return errorResponse(404, 'REPORT_NOT_FOUND', 'Report not found');
  }

  const reportService = createSupabaseReportService();
  const result = await reportService.getReportBySecret(secret);

  if (result.status === 'not_found') {
    return errorResponse(404, 'REPORT_NOT_FOUND', 'Report not found');
  }

  if (result.status === 'expired' || !result.payload) {
    return errorResponse(
      410,
      'REPORT_EXPIRED',
      'Masa aktif 72 jam laporan ini telah berakhir.',
    );
  }

  return NextResponse.json(result.payload, {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}
