import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$app/paths', () => ({ asset: (p: string) => `/app/${p}`, resolve: (p: string) => `/app/${p}` }));
vi.mock('#lib/ml/embedder.ts', () => ({
  MODEL_ID: 'Xenova/clip-vit-base-patch32',
  embedImage: vi.fn(async (file: Blob) => (file.size % 2 ? new Float32Array([1, 0]) : new Float32Array([0, 1]))),
  cosine: (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1]
}));

import { averageNormalized, queryEmbedding, queryVector, withBase, loadPlaces } from './shared';
import { places } from '#lib/stores/places.svelte.ts';
import { embedImage } from '#lib/ml/embedder.ts';

const file = (size: number) => new File([new Uint8Array(size)], `f${size}.jpg`, { type: 'image/jpeg' });

describe('shared : ce que les deux adapters partagent', () => {
  // Accolades obligatoires : une fonction rendue par beforeEach serait appelée comme nettoyage (Vitest 5).
  beforeEach(() => {
    vi.mocked(embedImage).mockClear();
  });

  it('averageNormalized : une seule vue rend le vecteur tel quel, plusieurs vues leur moyenne renormalisée', () => {
    const a = new Float32Array([1, 0]);
    expect(averageNormalized([a])).toBe(a);
    const m = averageNormalized([a, new Float32Array([0, 1])]);
    expect(m[0]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(m[1]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(Math.hypot(m[0], m[1])).toBeCloseTo(1, 5);
  });

  it('withBase préfixe la vignette par le chemin de base et laisse l’absence de vignette intacte', () => {
    expect(withBase({ id: '1', title: 't', imageUrl: 'x', thumbnailUrl: 'data/thumbs/1.jpg', metadata: {} }).thumbnailUrl).toBe('/app/data/thumbs/1.jpg');
    expect(withBase({ id: '1', title: 't', imageUrl: 'x', metadata: {} }).thumbnailUrl).toBeUndefined();
  });

  it('queryEmbedding ne vectorise chaque fichier qu’une fois', async () => {
    const f = file(3);
    const [a, b] = await Promise.all([queryEmbedding(f), queryEmbedding(f)]);
    expect(a).toBe(b);
    expect(embedImage).toHaveBeenCalledTimes(1);
    await queryEmbedding(file(5));
    expect(embedImage).toHaveBeenCalledTimes(2);
  });

  it('queryVector moyenne la photo principale et ses vues supplémentaires', async () => {
    const v = await queryVector(file(7), [file(8)]);
    expect(v[0]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(v[1]).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('loadPlaces charge le gazetier et tolère son absence', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ places: { Q1: { id: 'Q1', label: { fr: 'Kyiv', en: 'Kyiv' }, countryIso: 'UA', lat: 50, lon: 30 } } }))));
    await loadPlaces();
    expect(places.label('Q1', 'fr')).toBe('Kyiv');
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/app/data/places.json');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    await expect(loadPlaces()).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});
