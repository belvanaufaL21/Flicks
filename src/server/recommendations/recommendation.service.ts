import 'server-only';

// ponytail: explicit list for bottoms; all others map to tops per business rule
export function isBottomsCategory(rawCategory: string | null | undefined): boolean {
  if (!rawCategory) return false;
  const c = rawCategory.trim().toLowerCase();
  return ['bottoms', 'skirt', 'shorts', 'pants', 'bottom', 'trousers', 'bawahan', 'rok', 'celana pendek'].includes(c);
}

export function mapToRecommendationCategory(rawCategory: string | null | undefined): 'tops' | 'bottoms' {
  return isBottomsCategory(rawCategory) ? 'bottoms' : 'tops';
}

export interface RecommendableProduct {
  id: string;
  name: string;
  brand?: string | null;
  category: string;
  imagePath: string;
  sourceUrl?: string | null;
  isActive: boolean;
  labels?: {
    gender?: 'male' | 'female' | 'unisex' | string;
    body_shapes?: string[];
    color_tones?: string[];
    sizes?: string[];
    [key: string]: unknown;
  } | null;
}

export interface RecommendationMatchInput {
  products: RecommendableProduct[];
  gender: 'male' | 'female' | string;
  bodyShape: string;
  personalColor: string;
}

export interface RecommendationOutputItem {
  id: string;
  name: string;
  brand: string | null;
  category: 'tops' | 'bottoms';
  imagePath: string;
  sourceUrl: string | null;
  matchScore: number;
}

export type RecommendedProductItem = RecommendationOutputItem;

export interface RecommendationResult {
  tops: RecommendationOutputItem[];
  bottoms: RecommendationOutputItem[];
}

// ponytail: deterministic score-based filter over vector similarity; upgrade to pgvector embeddings when catalog > 500 SKUs
export function matchProductsForProfile(
  input: RecommendationMatchInput,
): RecommendationResult {
  const normalizedGender = (input.gender || 'unisex').toLowerCase();
  const normalizedBodyShape = (input.bodyShape || '').toLowerCase();
  const normalizedColor = (input.personalColor || '').toLowerCase();

  const activeProducts = input.products.filter((p) => p.isActive);

  const scoredProducts: RecommendationOutputItem[] = [];

  for (const product of activeProducts) {
    const labels = product.labels;
    const productGender = String(labels?.gender ?? 'unisex').toLowerCase();

    if (
      normalizedGender !== 'unisex' &&
      productGender !== 'unisex' &&
      productGender !== normalizedGender
    ) {
      continue;
    }

    let matchScore = 0;
    const bodyShapes = Array.isArray(labels?.body_shapes)
      ? labels.body_shapes.map((s) => String(s).toLowerCase())
      : [];
    const colorTones = Array.isArray(labels?.color_tones)
      ? labels.color_tones.map((c) => String(c).toLowerCase())
      : [];

    if (normalizedBodyShape && bodyShapes.includes(normalizedBodyShape)) {
      matchScore += 2;
    }
    if (
      normalizedColor &&
      colorTones.some(
        (tone) =>
          tone === normalizedColor || normalizedColor.includes(tone),
      )
    ) {
      matchScore += 2;
    }

    const mappedCategory = mapToRecommendationCategory(product.category);

    scoredProducts.push({
      id: product.id,
      name: product.name,
      brand: product.brand ?? null,
      category: mappedCategory,
      imagePath: product.imagePath,
      sourceUrl: product.sourceUrl ?? null,
      matchScore,
    });
  }

  scoredProducts.sort((a, b) => b.matchScore - a.matchScore);

  const filterWithNeutralFallback = (items: RecommendationOutputItem[]) => {
    const matched = items.filter((item) => item.matchScore > 0);
    if (matched.length >= 2) {
      return matched;
    }
    return items;
  };

  return {
    tops: filterWithNeutralFallback(
      scoredProducts.filter((p) => p.category === 'tops'),
    ),
    bottoms: filterWithNeutralFallback(
      scoredProducts.filter((p) => p.category === 'bottoms'),
    ),
  };
}
