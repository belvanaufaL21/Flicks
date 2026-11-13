import { describe, expect, it } from 'vitest';
import {
  matchProductsForProfile,
  type RecommendableProduct,
} from '@/server/recommendations/recommendation.service';

const MOCK_PRODUCTS: RecommendableProduct[] = [
  {
    id: 'prod-top-1',
    name: 'Kemeja Katun Putih',
    brand: 'Minimalist Studio',
    category: 'tops',
    imagePath: '/uploads/white-shirt.png',
    sourceUrl: 'https://shopee.co.id/white-shirt',
    isActive: true,
    labels: {
      gender: 'male',
      body_shapes: ['rectangle', 'inverted_triangle'],
      color_tones: ['summer', 'winter'],
      sizes: ['M', 'L'],
    },
  },
  {
    id: 'prod-bottom-1',
    name: 'Celana Chino Slim Fit',
    brand: 'Lokal Brand',
    category: 'bottoms',
    imagePath: '/uploads/chino.png',
    sourceUrl: 'https://tokopedia.com/chino',
    isActive: true,
    labels: {
      gender: 'male',
      body_shapes: ['rectangle', 'trapezoid'],
      color_tones: ['autumn', 'summer'],
      sizes: ['30', '32'],
    },
  },
  {
    id: 'prod-top-female',
    name: 'Blouse Satin Floral',
    brand: 'Chic Style',
    category: 'tops',
    imagePath: '/uploads/blouse.png',
    sourceUrl: 'https://zalora.co.id/blouse',
    isActive: true,
    labels: {
      gender: 'female',
      body_shapes: ['pear', 'hourglass'],
      color_tones: ['spring', 'autumn'],
      sizes: ['S', 'M'],
    },
  },
  {
    id: 'prod-inactive',
    name: 'Jaket Denim Lama',
    brand: 'Retro',
    category: 'tops',
    imagePath: '/uploads/denim.png',
    sourceUrl: null,
    isActive: false,
    labels: {
      gender: 'male',
      body_shapes: ['rectangle'],
      color_tones: ['summer'],
      sizes: ['L'],
    },
  },
];

describe('Recommendation Matching Engine', () => {
  it('matches tops and bottoms according to user profile (gender, body shape, personal color)', () => {
    const result = matchProductsForProfile({
      products: MOCK_PRODUCTS,
      gender: 'male',
      bodyShape: 'rectangle',
      personalColor: 'summer',
    });

    expect(result.tops).toHaveLength(1);
    expect(result.tops[0].id).toBe('prod-top-1');
    expect(result.tops[0].brand).toBe('Minimalist Studio');
    expect(result.tops[0].sourceUrl).toBe('https://shopee.co.id/white-shirt');

    expect(result.bottoms).toHaveLength(1);
    expect(result.bottoms[0].id).toBe('prod-bottom-1');
  });

  it('excludes inactive products regardless of label matching', () => {
    const result = matchProductsForProfile({
      products: MOCK_PRODUCTS,
      gender: 'male',
      bodyShape: 'rectangle',
      personalColor: 'summer',
    });

    const inactiveFound = [...result.tops, ...result.bottoms].some(
      (p) => p.id === 'prod-inactive',
    );
    expect(inactiveFound).toBe(false);
  });

  it('filters by gender strictly so female garments do not appear for male profiles', () => {
    const result = matchProductsForProfile({
      products: MOCK_PRODUCTS,
      gender: 'male',
      bodyShape: 'rectangle',
      personalColor: 'summer',
    });

    const femaleFound = [...result.tops, ...result.bottoms].some(
      (p) => p.id === 'prod-top-female',
    );
    expect(femaleFound).toBe(false);
  });

  it('includes neutral/unmatched gender-compatible products as fallback with lower score', () => {
    const result = matchProductsForProfile({
      products: [
        ...MOCK_PRODUCTS,
        {
          id: 'prod-top-neutral',
          name: 'Kaos Basic Netral',
          brand: 'Basic',
          category: 'tops',
          imagePath: '/uploads/basic.png',
          sourceUrl: null,
          isActive: true,
          labels: { gender: 'unisex' },
        },
      ],
      gender: 'male',
      bodyShape: 'rectangle',
      personalColor: 'summer',
    });

    expect(result.tops.map((t) => t.id)).toEqual(['prod-top-1', 'prod-top-neutral']);
    expect(result.tops[0].matchScore).toBeGreaterThan(result.tops[1].matchScore);
  });

  it('categorizes skirt, shorts, and bottoms into bottoms group, and all others (dress, outerwear, etc.) into tops group', () => {
    const mixedProducts: RecommendableProduct[] = [
      {
        id: 'item-skirt',
        name: 'Pleated Midi Skirt',
        category: 'skirt',
        imagePath: '/skirt.png',
        isActive: true,
        labels: { gender: 'female', body_shapes: ['hourglass'] },
      },
      {
        id: 'item-shorts',
        name: 'Denim Shorts',
        category: 'shorts',
        imagePath: '/shorts.png',
        isActive: true,
        labels: { gender: 'female', body_shapes: ['hourglass'] },
      },
      {
        id: 'item-dress',
        name: 'Summer Floral Dress',
        category: 'dress',
        imagePath: '/dress.png',
        isActive: true,
        labels: { gender: 'female', body_shapes: ['hourglass'] },
      },
      {
        id: 'item-outerwear',
        name: 'Casual Cardigan',
        category: 'outerwear',
        imagePath: '/cardigan.png',
        isActive: true,
        labels: { gender: 'female', body_shapes: ['hourglass'] },
      },
    ];

    const result = matchProductsForProfile({
      products: mixedProducts,
      gender: 'female',
      bodyShape: 'hourglass',
      personalColor: 'spring',
    });

    // Skirt & shorts should be in bottoms
    expect(result.bottoms.map((b) => b.id)).toEqual(['item-skirt', 'item-shorts']);
    expect(result.bottoms.every((b) => b.category === 'bottoms')).toBe(true);

    // Dress & outerwear should be in tops
    expect(result.tops.map((t) => t.id)).toEqual(['item-dress', 'item-outerwear']);
    expect(result.tops.every((t) => t.category === 'tops')).toBe(true);
  });
});
