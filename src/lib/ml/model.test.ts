import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { MODEL_ID, MODEL_REVISION } from './model';
import { schema } from '$lib/config/schema';

/** Le navigateur, l'index et les scripts doivent charger exactement les mêmes poids, et τ doit avoir été mesuré avec eux. */
describe('révision du modèle', () => {
  it('est une empreinte git complète', () => {
    expect(MODEL_REVISION).toMatch(/^[0-9a-f]{40}$/);
  });
  it.each(['scripts/build-data.mjs', 'scripts/lib/models.mjs'])('%s épingle la même révision et le même modèle', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(src).toContain(MODEL_ID);
    expect(src).toContain(MODEL_REVISION);
  });
  it('le seuil calibré du schéma vient du modèle du navigateur', () => {
    const c = schema.similarity.calibration;
    expect(c?.model).toBe(MODEL_ID);
    expect(c?.tau).toBeGreaterThan(0.5);
    expect(c?.tau).toBeLessThan(1);
    expect(c?.source).toMatch(/^eval\/calibration-clip\.json · \d{4}-\d{2}-\d{2}$/);
  });
});
