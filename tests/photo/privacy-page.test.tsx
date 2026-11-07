// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PrivacyPage from '../../src/app/privacy/page';

describe('PrivacyPage and private storage SQL policy', () => {
  afterEach(() => {
    cleanup();
  });

  it('publishes collection purpose, private storage, third-party processing, 72-hour retention, deletion, and pending contact notice', () => {
    render(<PrivacyPage />);

    expect(
      screen.getByRole('heading', {
        name: /kebijakan privasi & penanganan foto/i,
      }),
    ).toBeTruthy();
    expect(screen.getAllByText(/Personal Color/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Body Shape/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Google Gemini/i)).toBeTruthy();
    expect(screen.getByText(/FASHN/i)).toBeTruthy();
    expect(screen.getAllByText(/72 jam/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/menunggu konfirmasi pemilik proyek/i)).toBeTruthy();
  });

  it('enforces private bucket and denies anon/authenticated direct access in SQL migration (QA-12)', () => {
    const sqlPath = resolve(
      __dirname,
      '../../supabase/migrations/20261023120000_photo_private_storage.sql',
    );
    const sql = readFileSync(sqlPath, 'utf8');

    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/force row level security/i);
    expect(sql).toMatch(
      /revoke all on table public\.photo_assets from public, anon, authenticated/i,
    );
    expect(sql).toMatch(/grant all on table public\.photo_assets to service_role/i);
    expect(sql).toMatch(/'flicks-private-photos'[\s\S]*false/);
    expect(sql).toMatch(/expires_at <= created_at \+ interval '72 hours'/i);
  });
});
