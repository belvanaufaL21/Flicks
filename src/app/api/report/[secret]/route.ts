import { NextResponse } from 'next/server';
import {
  canUseLocalDevFallback,
  isSupabaseConfigured,
} from '@/server/dev/local-memory-store';
import { createSupabaseReportService } from '@/server/reports/report.service';
import { getReport } from '@/services/report.service';

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json(
    { error, message },
    {
      status,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    },
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ secret: string }> | { secret: string } },
) {
  const params = await context.params;
  const secret = params?.secret?.trim();
  if (!secret) {
    return errorResponse(404, 'REPORT_NOT_FOUND', 'Report not found');
  }

  if (isSupabaseConfigured() || canUseLocalDevFallback()) {
    try {
      const reportService = createSupabaseReportService();
      const result = await reportService.getReportBySecret(secret);

      if (result.status === 'ready' && result.payload) {
        return NextResponse.json(result.payload, {
          status: 200,
          headers: {
            'Cache-Control': 'private, no-store, max-age=0',
          },
        });
      }

      if (result.status === 'expired') {
        return errorResponse(
          410,
          'REPORT_EXPIRED',
          'Masa aktif 72 jam laporan ini telah berakhir.',
        );
      }
    } catch {
      // Fallback to service check below
    }
  }

  try {
    const report = await getReport(secret);
    if (report.state === 'ready') {
      return NextResponse.json(report, {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
        },
      });
    }
    if (report.state === 'expired') {
      return errorResponse(
        410,
        'REPORT_EXPIRED',
        'Masa aktif 72 jam laporan ini telah berakhir.',
      );
    }
    if (report.state === 'pending') {
      return NextResponse.json(report, { status: 202 });
    }
  } catch {
    // Treat as not found
  }

  return errorResponse(404, 'REPORT_NOT_FOUND', 'Report not found');
}
}
