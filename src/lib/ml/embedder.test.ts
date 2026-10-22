import { describe, it, expect } from 'vitest';
import { cosine } from './embedder';

describe('cosine', () => {
  it('vaut 1 pour des vecteurs identiques normalisés et 0 pour orthogonaux', () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });
  it('tolère des longueurs différentes', () => {
    expect(cosine(new Float32Array([0.6, 0.8]), [0.6, 0.8, 0.1])).toBeCloseTo(1, 5);
  });
});
