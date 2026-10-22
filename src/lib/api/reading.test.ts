import { describe, it, expect } from 'vitest';
import { isAmbiguous, readInsights } from './reading';
import type { Insights } from './types';
import { schema } from '$lib/config/schema';

const base = (over: Partial<Insights>): Insights => ({
  topK: 12, origins: [], places: [], categories: [], materials: [], techniques: [], subjects: [], periods: [], references: [{ id: 'a', title: 'a', score: 0.9 }], ...over
});

describe('isAmbiguous', () => {
  it('deux hypothèses proches', () => {
    expect(isAmbiguous([{ code: 'icon', share: 0.45, count: 5 }, { code: 'painting', share: 0.4, count: 4 }])).toBe(true);
  });
  it('une hypothèse dominante', () => {
    expect(isAmbiguous([{ code: 'icon', share: 0.8, count: 9 }, { code: 'painting', share: 0.1, count: 1 }])).toBe(false);
  });
  it('seconde trop faible', () => {
    expect(isAmbiguous([{ code: 'icon', share: 0.5, count: 5 }, { code: 'painting', share: 0.2, count: 2 }])).toBe(false);
  });
});

describe('readInsights', () => {
  it('hésitation sur le type : confiance plafonnée et risque examiné pour les deux types', () => {
    const r = readInsights(base({ categories: [{ code: 'painting', share: 0.45, count: 5 }, { code: 'icon', share: 0.4, count: 4 }], origins: [{ code: 'UA', share: 0.9, count: 9 }] }), schema.similarity);
    expect(r.ambiguities.map((a) => a.kind)).toEqual(['category']);
    expect(r.confidence).toBe('medium');
    expect(r.risks.some((x) => x.id === 'icom-ua-2022')).toBe(true);
  });
  it('non fiable : aucune hésitation ni risque', () => {
    const r = readInsights(base({ references: [{ id: 'a', title: 'a', score: 0.6 }], categories: [{ code: 'icon', share: 0.45, count: 5 }, { code: 'coin', share: 0.4, count: 4 }], origins: [{ code: 'UA', share: 0.5, count: 5 }, { code: 'RU', share: 0.45, count: 4 }] }), schema.similarity);
    expect(r.reliable).toBe(false);
    expect(r.ambiguities).toEqual([]);
    expect(r.risks).toEqual([]);
    expect(r.confidence).toBe('weak');
  });
  it('cas net : confiance forte', () => {
    const r = readInsights(base({ categories: [{ code: 'painting', share: 0.84, count: 10 }], origins: [{ code: 'FR', share: 1, count: 10 }] }), schema.similarity);
    expect(r.confidence).toBe('strong');
    expect(r.ambiguities).toEqual([]);
  });
});
