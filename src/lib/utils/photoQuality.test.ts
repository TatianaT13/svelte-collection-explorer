import { describe, it, expect } from 'vitest';
import { assessPhoto, type PhotoMetrics } from './photoQuality';
import { schema } from '$lib/config/schema';

const good: PhotoMetrics = { width: 1600, height: 1200, mean: 120, std: 55, clipped: 0.01, sharpness: 0.09 };
const P = schema.photoQuality;

describe('assessPhoto', () => {
  it('photo correcte : aucun défaut', () => {
    expect(assessPhoto(good, P)).toEqual([]);
  });
  it('détecte flou, sombre, petite, reflets', () => {
    expect(assessPhoto({ ...good, sharpness: 0.002 }, P).map((i) => i.id)).toEqual(['blur']);
    expect(assessPhoto({ ...good, mean: 30 }, P).map((i) => i.id)).toEqual(['dark']);
    expect(assessPhoto({ ...good, width: 300, height: 200 }, P).map((i) => i.id)).toEqual(['small']);
    // sombre mais nette : la netteté normalisée ne dépend pas de l'exposition
    expect(assessPhoto({ ...good, mean: 30, std: 14, sharpness: 0.09 }, P).map((i) => i.id)).toEqual(['dark']);
    expect(assessPhoto({ ...good, clipped: 0.4, mean: 220 }, P).map((i) => i.id)).toEqual(['bright', 'glare']);
  });
  it('faible contraste seulement si l’exposition est normale', () => {
    expect(assessPhoto({ ...good, std: 10 }, P).map((i) => i.id)).toEqual(['flat']);
    expect(assessPhoto({ ...good, std: 10, mean: 30 }, P).map((i) => i.id)).toEqual(['dark']);
  });
});
