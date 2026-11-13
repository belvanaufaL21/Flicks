import { NextResponse } from 'next/server';
import {
  createDefaultAdminService,
  type CreateProductInput,
} from '@/server/admin/admin.service';

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
  if (message === 'INVALID_PRODUCT_INPUT') {
    return NextResponse.json(
      { ok: false, code: 'INVALID_PRODUCT_INPUT' },
      { status: 400, headers: NO_STORE_HEADERS },
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
    const products = await service.getProducts();
    return NextResponse.json(
      { ok: true, products },
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
    const body = (await request.json().catch(() => null)) as CreateProductInput | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { ok: false, code: 'INVALID_PRODUCT_INPUT' },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const product = await service.createProduct(body);
    return NextResponse.json(
      { ok: true, product },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return mapAdminErrorToResponse(error);
  }
}
