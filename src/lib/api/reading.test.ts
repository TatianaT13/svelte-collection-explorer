import { describe, it, expect } from 'vitest';
import { conformalSet, isAmbiguous, readInsights } from './reading';
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
  it('une origine marginale ne déclenche pas de liste rouge', () => {
    const r = readInsights(base({ categories: [{ code: 'icon', share: 0.82, count: 10 }], origins: [{ code: 'IL', share: 0.85, count: 9 }, { code: 'UA', share: 0.02, count: 1 }] }), schema.similarity);
    expect(r.risks).toEqual([]);
    const r2 = readInsights(base({ categories: [{ code: 'icon', share: 0.82, count: 10 }], origins: [{ code: 'IL', share: 0.6, count: 6 }, { code: 'UA', share: 0.3, count: 3 }] }), schema.similarity);
    expect(r2.risks.some((x) => x.id === 'icom-ua-2022')).toBe(true);
  });
  it('cas net : confiance forte', () => {
    const r = readInsights(base({ categories: [{ code: 'painting', share: 0.84, count: 10 }], origins: [{ code: 'FR', share: 1, count: 10 }] }), schema.similarity);
    expect(r.confidence).toBe('strong');
    expect(r.ambiguities).toEqual([]);
  });
  it('sans calibration, pas d’ensemble conforme', () => {
    const r = readInsights(base({}), { ...schema.similarity, calibration: undefined });
    expect(r.conformal).toBeUndefined();
  });
});

describe('ensemble conforme', () => {
  const calibrated = { ...schema.similarity, calibration: { model: 'test', alpha: 0.1, tau: 0.7, source: 'test' } };
  const refs = [
    { id: 'a', title: 'a', score: 0.9 },
    { id: 'b', title: 'b', score: 0.72 },
    { id: 'c', title: 'c', score: 0.69 }
  ];
  it('garde les références au-dessus de τ, dans l’ordre', () => {
    const r = readInsights(base({ references: refs }), calibrated);
    expect(r.conformal?.candidates.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r.conformal?.total).toBe(2);
    expect(r.conformal?.truncated).toBe(false);
    expect(r.conformal?.inconclusive).toBe(false);
    expect(r.reliable).toBe(true);
  });
  it('compte sur le classement complet quand l’adapter le fournit, pas sur le top-K', () => {
    const r = readInsights(base({ references: refs, aboveTau: 7 }), calibrated);
    expect(r.conformal?.candidates.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r.conformal?.total).toBe(7);
    expect(r.conformal?.truncated).toBe(true);
  });
  it('ensemble vide : non concluant, lecture non fiable', () => {
    const r = readInsights(base({ references: [{ id: 'c', title: 'c', score: 0.69 }], aboveTau: 0 }), calibrated);
    expect(r.conformal?.inconclusive).toBe(true);
    expect(r.conformal?.candidates).toEqual([]);
    expect(r.reliable).toBe(false);
  });
  it('τ fait foi quand il existe ; sans calibration, il faut une similarité forte', () => {
    expect(readInsights(base({ references: [{ id: 'a', title: 'a', score: 0.74 }] }), calibrated).reliable).toBe(true);
    const uncalibrated = { ...schema.similarity, calibration: undefined };
    expect(readInsights(base({ references: [{ id: 'a', title: 'a', score: 0.74 }] }), uncalibrated).reliable).toBe(false);
    expect(readInsights(base({ references: [{ id: 'a', title: 'a', score: 0.85 }] }), uncalibrated).reliable).toBe(true);
  });
  it('conformalSet est pur', () => {
    expect(conformalSet(refs, 0.05, 0.95)).toEqual({ alpha: 0.05, tau: 0.95, candidates: [], total: 0, truncated: false, inconclusive: true });
  });
});
