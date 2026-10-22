import { describe, it, expect } from 'vitest';
import { computeInsights } from './insights';
import type { CollectionItem } from './types';

const mk = (id: string, score: number, origin: string, category: string, material: string[]): CollectionItem => ({
  id, title: id, imageUrl: '', metadata: { origin, category, material, period: 'medieval' }, score
});

describe('computeInsights', () => {
  it('pondère par la similarité et classe les origines', () => {
    const ranked = [mk('a', 0.95, 'UA', 'icon', ['wood']), mk('b', 0.9, 'UA', 'icon', ['wood', 'gold']), mk('c', 0.7, 'RU', 'icon', ['wood']), mk('d', 0.55, 'GR', 'vessel', ['clay'])];
    const i = computeInsights(ranked, 12);
    expect(i.topK).toBe(4);
    expect(i.origins[0].code).toBe('UA');
    expect(i.origins[0].count).toBe(2);
    expect(i.origins[0].share).toBeGreaterThan(0.7);
    expect(i.categories[0].code).toBe('icon');
    expect(i.materials[0].code).toBe('wood');
    expect(i.references.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    const total = i.origins.reduce((s, o) => s + o.share, 0);
    expect(total).toBeCloseTo(1, 5);
  });
  it('se limite à topK et ignore les objets sans score', () => {
    const ranked = [...Array.from({ length: 20 }, (_, k) => mk(String(k), 0.9 - k * 0.01, 'UA', 'icon', [])), { id: 'x', title: 'x', imageUrl: '', metadata: {} }];
    expect(computeInsights(ranked, 5).topK).toBe(5);
  });
  it('parts égales quand tout est loin', () => {
    const i = computeInsights([mk('a', 0.3, 'UA', 'icon', []), mk('b', 0.2, 'RU', 'coin', [])], 12);
    expect(i.origins.map((o) => o.share)).toEqual([0.5, 0.5]);
  });
  it('ignore les valeurs vides', () => {
    const i = computeInsights([mk('a', 0.9, '', 'icon', [])], 12);
    expect(i.origins).toEqual([]);
  });
});
