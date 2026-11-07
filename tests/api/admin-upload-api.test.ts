import { beforeEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/admin/products/upload/route';
import { getLocalDevMemoryState } from '@/server/dev/local-memory-store';

describe('POST /api/admin/products/upload', () => {
  beforeEach(() => {
    const state = getLocalDevMemoryState();
    state.adminProfilesByUserId.clear();
    state.adminProfilesByUserId.set('admin-1', {
      userId: 'admin-1',
      role: 'admin',
      createdAt: '2026-11-06T00:00:00.000Z',
    });
  });

  it('rejects unauthenticated requests with 401 and non-admin requests with 403', async () => {
    const unauthForm = new FormData();
    unauthForm.append(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'shirt.jpg', { type: 'image/jpeg' }),
    );
    const unauthReq = new Request(
      'http://localhost:3000/api/admin/products/upload',
      {
        method: 'POST',
        body: unauthForm,
      },
    );
    const unauthRes = await POST(unauthReq);
    expect(unauthRes.status).toBe(401);
    const unauthData = await unauthRes.json();
    expect(unauthData).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });

    const forbiddenForm = new FormData();
    forbiddenForm.append(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'shirt.jpg', { type: 'image/jpeg' }),
    );
    const forbiddenReq = new Request(
      'http://localhost:3000/api/admin/products/upload',
      {
        method: 'POST',
        headers: { authorization: 'Bearer user:visitor-99' },
        body: forbiddenForm,
      },
    );
    const forbiddenRes = await POST(forbiddenReq);
    expect(forbiddenRes.status).toBe(403);
    const forbiddenData = await forbiddenRes.json();
    expect(forbiddenData).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('rejects missing or empty file with 400', async () => {
    const emptyForm = new FormData();
    const req = new Request('http://localhost:3000/api/admin/products/upload', {
      method: 'POST',
      headers: { 'x-flicks-dev-admin': '1' },
      body: emptyForm,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });

  it('rejects unsupported MIME types with 400', async () => {
    const formData = new FormData();
    formData.append(
      'file',
      new File(['plain text'], 'notes.txt', { type: 'text/plain' }),
    );

    const req = new Request('http://localhost:3000/api/admin/products/upload', {
      method: 'POST',
      headers: { 'x-flicks-dev-admin': '1' },
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/format/i);
  });

  it('rejects files larger than 5MB with 400', async () => {
    const oversizedBytes = new Uint8Array(5 * 1024 * 1024 + 1);
    const formData = new FormData();
    formData.append(
      'file',
      new File([oversizedBytes], 'huge.png', { type: 'image/png' }),
    );

    const req = new Request('http://localhost:3000/api/admin/products/upload', {
      method: 'POST',
      headers: { 'x-flicks-dev-admin': '1' },
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/5\s*mb/i);
  });

  it('uploads valid JPEG/PNG/WebP image and returns imagePath and previewUrl', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const file = new File([bytes], 'shirt.png', { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', file);

    const req = new Request('http://localhost:3000/api/admin/products/upload', {
      method: 'POST',
      headers: { 'x-flicks-dev-admin': '1' },
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.imagePath).toMatch(/^\/uploads\/products\/.+\.png$/);
    expect(data.previewUrl).toMatch(/^data:image\/png;base64,/);
  });
});
