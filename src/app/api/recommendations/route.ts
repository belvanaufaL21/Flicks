import { NextResponse } from 'next/server';
import {
  canUseLocalDevFallback,
  isSupabaseConfigured,
} from '@/server/dev/local-memory-store';
import { matchProductsForProfile } from '@/server/recommendations/recommendation.service';
import { createSupabaseVirtualTryOnService } from '@/server/vto/virtual-try-on.service';

export async function GET(request: Request) {
  if (!isSupabaseConfigured() && !canUseLocalDevFallback()) {
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Database is not configured' },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const gender = searchParams.get('gender')?.toLowerCase();
  const bodyShape =
    searchParams.get('body_shape') ?? searchParams.get('bodyShape') ?? '';
  const colorTone =
    searchParams.get('color_tone') ??
    searchParams.get('colorTone') ??
    searchParams.get('color_season') ??
    searchParams.get('colorSeason') ??
    '';

  if (gender !== 'male' && gender !== 'female') {
    return NextResponse.json(
      { error: 'INVALID_INPUT', message: 'gender must be male or female' },
      { status: 400 },
    );
  }

  try {
    const vtoService = createSupabaseVirtualTryOnService();
    const rawProducts = await vtoService.listActiveProducts();

    const result = matchProductsForProfile({
      products: rawProducts,
      gender,
      bodyShape,
      personalColor: colorTone,
    });

    // ponytail: return top-level tops/bottoms and nested recommendations for dual-spec consumer compatibility
    return NextResponse.json(
      {
        ...result,
        recommendations: result,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to fetch recommendations',
      },
      { status: 500 },
    );
  }
}
