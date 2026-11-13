import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createDefaultAdminService } from '@/server/admin/admin.service';
import {
  getLocalDevMemoryState,
  isSupabaseConfigured,
} from '@/server/dev/local-memory-store';
import { getRequiredEnv } from '@/server/env';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_BYTES = 5 * 1024 * 1024;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
};

export async function POST(request: Request) {
  try {
    const service = createDefaultAdminService();
    await service.assertAdminSession(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
    if (message === 'UNAUTHENTICATED') {
      return NextResponse.json(
        { ok: false, code: 'UNAUTHENTICATED', error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }
    if (message === 'FORBIDDEN') {
      return NextResponse.json(
        { ok: false, code: 'FORBIDDEN', error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json(
      { ok: false, code: 'INTERNAL_ERROR', error: 'Internal Server Error' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, code: 'INVALID_FORM_DATA', error: 'Payload form tidak valid.' },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { ok: false, code: 'MISSING_FILE', error: 'File foto produk wajib dipilih.' },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      {
        ok: false,
        code: 'INVALID_MIME_TYPE',
        error: 'Format foto harus JPG, PNG, atau WebP.',
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        code: 'FILE_TOO_LARGE',
        error: 'Ukuran foto maksimal 5 MB.',
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const buffer = Buffer.from(bytes);
  const fileName = `${crypto.randomUUID()}.${ext}`;

  // ponytail: base64 previewUrl + virtual path in local dev; switch to Supabase 'product-images' bucket automatically when env vars are set.
  if (isSupabaseConfigured()) {
    const supabase = createClient(
      getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
      getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const storagePath = `products/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        {
          ok: false,
          code: 'STORAGE_UPLOAD_FAILED',
          error: uploadError.message || 'Gagal mengunggah foto produk.',
        },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData.publicUrl;
    return NextResponse.json(
      { ok: true, imagePath: publicUrl, previewUrl: publicUrl },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }

  const imagePath = `/uploads/products/${fileName}`;
  const previewUrl = `data:${file.type};base64,${buffer.toString('base64')}`;

  const state = getLocalDevMemoryState();
  state.photosByPath.set(imagePath, {
    bytes,
    mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
  });

  return NextResponse.json(
    { ok: true, imagePath, previewUrl },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}
