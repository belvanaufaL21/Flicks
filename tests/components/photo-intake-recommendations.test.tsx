// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PhotoIntakeForm } from '../../src/components/photo-intake/photo-intake-form';

describe('PhotoIntakeForm - Catalog Recommendations & Dual-Quota VTO', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('displays Top and Bottom quota badges and enables "COBA VIRTUAL TRY-ON" when at least one item is selected', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/recommendations')) {
        return new Response(
          JSON.stringify({
            recommendations: {
              tops: [
                {
                  id: 'top-1',
                  name: 'Terracotta Overshirt',
                  brand: 'FLICKS',
                  category: 'tops',
                  imagePath: 'https://storage/top-1.jpg',
                  sourceUrl: 'https://shopee.co.id/top-1',
                },
              ],
              bottoms: [
                {
                  id: 'bot-1',
                  name: 'Cream Chino Pants',
                  brand: 'FLICKS',
                  category: 'bottoms',
                  imagePath: 'https://storage/bot-1.jpg',
                  sourceUrl: 'https://tokopedia.com/bot-1',
                },
              ],
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <PhotoIntakeForm
        initialAnalysisComplete={{
          gender: 'male',
          bodyShape: 'trapezoid',
          colorSeason: 'warm autumn',
          userPhotoUri: 'https://storage/user-body.jpg',
          tokenId: 'tok-test-1',
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Terracotta Overshirt')).toBeDefined();
      expect(screen.getByText('Cream Chino Pants')).toBeDefined();
    });

    expect(screen.getByText(/Kuota Atasan: 1\/1 Tersedia/i)).toBeDefined();
    expect(screen.getByText(/Kuota Bawahan: 1\/1 Tersedia/i)).toBeDefined();

    const tryOnBtn = screen.getByRole('button', { name: /COBA VIRTUAL TRY-ON/i });
    expect((tryOnBtn as HTMLButtonElement).disabled).toBe(true);

    const selectTopBtn = screen.getByRole('button', { name: /Pilih Atasan: Terracotta Overshirt/i });
    fireEvent.click(selectTopBtn);

    expect((tryOnBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('executes sequential Top + Bottom VTO, updates both quotas to 0/1 Terpakai, and shows upsell CTA when exhausted', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/recommendations')) {
        return new Response(
          JSON.stringify({
            recommendations: {
              tops: [
                {
                  id: 'top-1',
                  name: 'Terracotta Overshirt',
                  brand: 'FLICKS',
                  category: 'tops',
                  imagePath: 'https://storage/top-1.jpg',
                  sourceUrl: 'https://shopee.co.id/top-1',
                },
              ],
              bottoms: [
                {
                  id: 'bot-1',
                  name: 'Cream Chino Pants',
                  brand: 'FLICKS',
                  category: 'bottoms',
                  imagePath: 'https://storage/bot-1.jpg',
                  sourceUrl: 'https://tokopedia.com/bot-1',
                },
              ],
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/api/virtual-try-on')) {
        return new Response(
          JSON.stringify({
            status: 'succeeded',
            result_image_uri: 'https://fashn.cdn/step2-full-outfit.jpg',
            quota: {
              canTryTop: false,
              canTryBottom: false,
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <PhotoIntakeForm
        initialAnalysisComplete={{
          gender: 'male',
          bodyShape: 'trapezoid',
          colorSeason: 'warm autumn',
          userPhotoUri: 'https://storage/user-body.jpg',
          tokenId: 'tok-test-2',
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Terracotta Overshirt')).toBeDefined();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Pilih Atasan: Terracotta Overshirt/i }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Pilih Bawahan: Cream Chino Pants/i }),
    );

    fireEvent.click(
      screen.getByRole('button', { name: /COBA VIRTUAL TRY-ON SEKARANG/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/Kuota Atasan: 0\/1 Terpakai/i)).toBeDefined();
      expect(screen.getByText(/Kuota Bawahan: 0\/1 Terpakai/i)).toBeDefined();
      expect(screen.getByText(/Tambah Kuota Try-On/i)).toBeDefined();
      expect(screen.getByAltText('Hasil Virtual Try-On')).toBeDefined();
    });
  });

  it('correctly loads and displays recommendations when API returns flat { tops, bottoms } structure', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/recommendations')) {
        return new Response(
          JSON.stringify({
            tops: [
              {
                id: 'top-flat-1',
                name: 'Hourglass Structured Blazer',
                brand: 'FLICKS Curated',
                category: 'tops',
                imagePath: 'https://storage/blazer.jpg',
                sourceUrl: 'https://shopee.co.id/blazer',
              },
            ],
            bottoms: [],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <PhotoIntakeForm
        initialAnalysisComplete={{
          gender: 'female',
          bodyShape: 'hourglass',
          colorSeason: 'spring',
          userPhotoUri: 'https://storage/user-female.jpg',
          tokenId: 'tok-test-3',
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Hourglass Structured Blazer')).toBeDefined();
    });
  });
});
