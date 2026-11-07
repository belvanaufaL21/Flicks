// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ReportView } from '../../src/app/result/[secret]/report-view';

describe('ReportView Recommendations & External Store Links', () => {
  it('renders recommended tops and bottoms with clickable external store links', () => {
    const mockReport = {
      reportId: 'rep-123',
      status: 'ready' as const,
      createdAt: '2026-11-06T00:00:00.000Z',
      expiresAt: '2026-11-13T00:00:00.000Z',
      remainingSeconds: 259200,
      isExpired: false,
      personalColor: {
        status: 'completed',
        primarySeason: 'autumn',
        subSeason: 'warm autumn',
        confidenceLevel: 'high',
        alternativeCandidates: [],
        recommendedColors: ['#8B4513'],
        colorsToTest: [],
        photoQuality: null,
        disclaimer: 'Disclaimer',
      },
      bodyShape: {
        status: 'completed',
        category: 'hourglass',
        confidenceLevel: 'high',
        alternativeCandidates: [],
        stylingGuidance: ['Use fitted waists'],
        photoQuality: null,
        limitationsNote: null,
        disclaimer: 'Disclaimer',
      },
      vto: {
        jobId: 'vto-1',
        status: 'completed',
        productId: 'top-1',
        resultImageUrl: 'https://fashn.cdn/outfit.jpg',
        errorMessage: null,
      },
      recommendations: {
        tops: [
          {
            id: 'top-1',
            name: 'Terracotta Linen Shirt',
            brand: 'FLICKS Studio',
            category: 'tops',
            imagePath: 'https://storage/top-1.jpg',
            sourceUrl: 'https://shopee.co.id/terracotta-shirt',
            matchReasons: ['Warm Autumn', 'Hourglass'],
          },
        ],
        bottoms: [
          {
            id: 'bot-1',
            name: 'High-Waist Cream Trousers',
            brand: 'FLICKS Studio',
            category: 'bottoms',
            imagePath: 'https://storage/bot-1.jpg',
            sourceUrl: 'https://tokopedia.com/cream-trousers',
            matchReasons: ['Warm Autumn', 'Hourglass'],
          },
        ],
      },
      partialFailureMessage: null,
    };

    render(<ReportView secret="test-secret-1234567890" initialReport={mockReport as any} />);

    expect(screen.getByText('Rekomendasi Produk & Tautan Toko')).toBeDefined();
    expect(screen.getByText('Terracotta Linen Shirt')).toBeDefined();
    expect(screen.getByText('High-Waist Cream Trousers')).toBeDefined();

    const links = screen.getAllByRole('link', { name: /Beli di Toko/i });
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('https://shopee.co.id/terracotta-shirt');
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(links[1].getAttribute('href')).toBe('https://tokopedia.com/cream-trousers');
  });
});
