import { NextResponse } from 'next/server';
import {
  createDefaultAdminService,
  type UpdateProductInput,
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
  if (message === 'PRODUCT_NOT_FOUND') {
    return NextResponse.json(
      { ok: false, code: 'PRODUCT_NOT_FOUND' },
      { status: 404, headers: NO_STORE_HEADERS },
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const service = createDefaultAdminService();
    await service.assertAdminSession(request);
    const body = (await request.json().catch(() => null)) as UpdateProductInput | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { ok: false, code: 'INVALID_PRODUCT_INPUT' },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const { id } = await Promise.resolve(context.params);
    const product = await service.updateProduct(id, body);
    return NextResponse.json(
      { ok: true, product },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return mapAdminErrorToResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const service = createDefaultAdminService();
    await service.assertAdminSession(request);
    const { id } = await Promise.resolve(context.params);
    const url = new URL(request.url);
    if (url.searchParams.get('permanent') === 'true') {
      await service.deleteProduct(id);
      return NextResponse.json(
        { ok: true, deletedId: id },
        { status: 200, headers: NO_STORE_HEADERS },
      );
    }
    const product = await service.deactivateProduct(id);
    return NextResponse.json(
      { ok: true, product },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return mapAdminErrorToResponse(error);
  }
}
