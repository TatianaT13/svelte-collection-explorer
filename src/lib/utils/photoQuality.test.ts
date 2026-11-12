import { describe, it, expect } from 'vitest';
import { assessPhoto, metricsFromImageData, type PhotoMetrics } from './photoQuality';
import { schema } from '#lib/config/schema.ts';

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
  it('objet coupé par le bord : seulement si la politique le demande et si la mesure existe', () => {
    expect(assessPhoto({ ...good, borderEdges: 2.5 }, P).map((i) => i.id)).toEqual(['cut']);
    expect(assessPhoto({ ...good, borderEdges: 0.4 }, P)).toEqual([]);
    expect(assessPhoto({ ...good }, P)).toEqual([]); // photo importée : pas de mesure de bord
    expect(assessPhoto({ ...good, borderEdges: 2.5 }, { ...P, cutEdges: undefined })).toEqual([]);
  });

  it('faible contraste seulement si l’exposition est normale', () => {
    expect(assessPhoto({ ...good, std: 10 }, P).map((i) => i.id)).toEqual(['flat']);
    expect(assessPhoto({ ...good, std: 10, mean: 30 }, P).map((i) => i.id)).toEqual(['dark']);
  });
});

/** Image synthétique : fond gris uni, objet rayé (texture) placé au centre ou collé aux bords. */
function synthetic(w: number, h: number, box: { x: number; y: number; w: number; h: number }): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
      const v = inside ? (Math.floor(x / 4) % 2 ? 40 : 90) : 170;
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe('metricsFromImageData', () => {
  it('un objet entier laisse la bande du bord calme ; un objet coupé par le cadre la remplit de contours', () => {
    const whole = metricsFromImageData(synthetic(100, 100, { x: 30, y: 30, w: 40, h: 40 }), 100, 100, 100, 100, true);
    const cut = metricsFromImageData(synthetic(100, 100, { x: 0, y: 0, w: 60, h: 100 }), 100, 100, 100, 100, true);
    expect(whole.borderEdges).toBeLessThan(0.1);
    expect(cut.borderEdges).toBeGreaterThan(0.6);
    expect(assessPhoto({ ...whole, width: 1600, height: 1200, sharpness: 0.09 }, P).map((i) => i.id)).toEqual([]);
    expect(assessPhoto({ ...cut, width: 1600, height: 1200, sharpness: 0.09 }, P).map((i) => i.id)).toContain('cut');
  });
  it('sans demande de bord, la mesure n’est pas calculée', () => {
    expect(metricsFromImageData(synthetic(50, 50, { x: 10, y: 10, w: 20, h: 20 }), 50, 50).borderEdges).toBeUndefined();
  });
});
