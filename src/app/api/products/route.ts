import { NextResponse } from 'next/server';
import {
  canUseLocalDevFallback,
  isSupabaseConfigured,
} from '@/server/dev/local-memory-store';
import { createSupabaseVirtualTryOnService } from '@/server/vto/virtual-try-on.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  if (!isSupabaseConfigured() && !canUseLocalDevFallback()) {
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Catalog service is not configured' },
      { status: 503 },
    );
  }

  try {
    const products =
      await createSupabaseVirtualTryOnService().listActiveProducts();
    return NextResponse.json({ products }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to load active products' },
      { status: 500 },
    );
  }
}
