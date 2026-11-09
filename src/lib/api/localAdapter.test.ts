import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CollectionItem } from './types';

vi.mock('$app/paths', () => ({ asset: (p: string) => `/app/${p}`, resolve: (p: string) => `/app/${p}` }));
vi.mock('#lib/ml/embedder.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('#lib/ml/embedder.ts')>();
  return { ...real, embedImage: vi.fn(async () => new Float32Array([0, 1, 0])), embedText: vi.fn(async () => new Float32Array([0, 0, 1])), preloadModel: vi.fn(), preloadTextModel: vi.fn() };
});

/** Trois objets, vecteurs orthogonaux : la requête [0, 1, 0] doit retrouver « b » avec un score de 1. */
const items = [
  { id: 'a', title: 'Amphore', imageUrl: 'a.jpg', thumbnailUrl: 'data/thumbs/a.jpg', metadata: { category: 'vessel', origin: 'GR' } },
  { id: 'b', title: 'Icône', imageUrl: 'b.jpg', thumbnailUrl: 'data/thumbs/b.jpg', metadata: { category: 'icon', origin: 'UA' } },
  { id: 'c', title: 'Bague', imageUrl: 'c.jpg', thumbnailUrl: 'data/thumbs/c.jpg', metadata: { category: 'jewellery', origin: 'UA' } }
];
const vectors = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

function stubData(bin: ArrayBuffer = vectors.buffer as ArrayBuffer) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('items.json')) return new Response(JSON.stringify({ model: 'm', dim: 3, generatedAt: '', source: '', items }));
      if (url.endsWith('embeddings.bin')) return new Response(bin);
      if (url.endsWith('places.json')) return new Response(JSON.stringify({ places: {} }));
      return new Response('', { status: 404 });
    })
  );
}

async function fresh() {
  vi.resetModules();
  return (await import('./localAdapter')).localAdapter;
}

describe('localAdapter', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('charge les données une fois et sert les vignettes sous le chemin de base', async () => {
    stubData();
    const api = await fresh();
    const r1 = await api.search({ filters: {}, page: 1, pageSize: 10 });
    const r2 = await api.search({ filters: {}, page: 1, pageSize: 10 });
    expect(r1.total).toBe(3);
    expect(r2.items[0].thumbnailUrl).toBe('/app/data/thumbs/a.jpg');
    const dataCalls = vi.mocked(fetch).mock.calls.filter(([u]) => String(u).includes('/data/'));
    expect(dataCalls).toHaveLength(3); // items, embeddings, gazetier : pas de rechargement à la deuxième requête
  });

  it('refuse un embeddings.bin dont la taille ne correspond pas à n × dim', async () => {
    stubData(new Float32Array(7).buffer as ArrayBuffer);
    const api = await fresh();
    await expect(api.search({ filters: {}, page: 1, pageSize: 10 })).rejects.toThrow(/embeddings\.bin : 7 valeurs pour 3 × 3/);
  });

  it('classe par cosinus, arrondit à trois décimales et calcule la lecture agrégée', async () => {
    stubData();
    const api = await fresh();
    const r = await api.search({ filters: {}, page: 1, pageSize: 10, image: new File([new Uint8Array(4)], 'q.jpg', { type: 'image/jpeg' }) });
    expect(r.items.map((it: CollectionItem) => it.id)).toEqual(['b', 'a', 'c']);
    expect(r.items[0].score).toBe(1);
    expect(r.items[1].score).toBe(0);
    expect(r.insights?.references[0].id).toBe('b');
    expect(r.insights?.categories[0].code).toBe('icon');
    expect(r.insights?.aboveTau).toBe(1); // seul « b » dépasse τ
  });

  it('applique les filtres et le texte avant le classement, et pagine', async () => {
    stubData();
    const api = await fresh();
    const filtered = await api.search({ filters: { origin: ['UA'] }, page: 1, pageSize: 10, image: new File([new Uint8Array(4)], 'q.jpg') });
    expect(filtered.items.map((it: CollectionItem) => it.id)).toEqual(['b', 'c']);
    const text = await api.search({ filters: {}, text: 'bague', page: 1, pageSize: 10 });
    expect(text.items.map((it: CollectionItem) => it.id)).toEqual(['c']);
    const page2 = await api.search({ filters: {}, page: 2, pageSize: 2 });
    expect(page2.items.map((it: CollectionItem) => it.id)).toEqual(['c']);
    expect(page2.total).toBe(3);
  });

  it('« par description » : le texte devient un vecteur, ne filtre plus les métadonnées, et n’a pas de lecture agrégée', async () => {
    stubData();
    const api = await fresh();
    const r = await api.search({ filters: {}, text: 'bague en or', semantic: true, page: 1, pageSize: 10 });
    expect(r.items.map((it: CollectionItem) => it.id)).toEqual(['c', 'a', 'b']); // vecteur texte [0,0,1] → « c »
    expect(r.total).toBe(3); // « bague en or » ne filtre pas sur les titres
    expect(r.items[0].score).toBe(1);
    expect(r.insights).toBeUndefined();
    const plain = await api.search({ filters: {}, text: 'bague en or', semantic: false, page: 1, pageSize: 10 });
    expect(plain.total).toBe(0); // en recherche de métadonnées, la même phrase ne correspond à rien
  });

  it('info décrit la base chargée', async () => {
    stubData();
    const api = await fresh();
    expect(await api.info()).toEqual({ model: 'm', dim: 3, count: 3, generatedAt: '', source: '', engine: 'browser' });
  });

  it('getItem retrouve un objet ou rend null ; sans serveur, l’archivage rend un reçu local avec l’empreinte lue', async () => {
    stubData();
    const api = await fresh();
    expect((await api.getItem('c'))?.title).toBe('Bague');
    expect(await api.getItem('zz')).toBeNull();
    const receipt = await api.archiveImage(new File([new Uint8Array(10)], 'o.jpg'), { fileName: 'o.jpg', mimeType: 'image/jpeg', sizeBytes: 10, sha256: 'abc', stripped: true });
    expect(receipt.id).toMatch(/^local-/);
    expect(receipt.sha256).toBe('abc');
  });
});
