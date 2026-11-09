import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MODEL_ID } from '#lib/ml/model.ts';

vi.mock('$app/paths', () => ({ asset: (p: string) => `/app/${p}`, resolve: (p: string) => `/app/${p}` }));
vi.mock('#lib/ml/embedder.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('#lib/ml/embedder.ts')>();
  return { ...real, embedImage: vi.fn(async () => new Float32Array([0, 1])), embedText: vi.fn(async () => new Float32Array([1, 0])), preloadModel: vi.fn(), preloadTextModel: vi.fn() };
});

const candidate = (id: string, score: number, category: string) => ({ id, title: id, imageUrl: `${id}.jpg`, thumbnailUrl: `data/thumbs/${id}.jpg`, score, metadata: { category, origin: 'UA' } });

/** Service simulé : on garde chaque requête reçue pour vérifier ce que le client envoie. */
function stubService(model = MODEL_ID) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/meta')) return new Response(JSON.stringify({ model, dim: 2, count: 2, generatedAt: '' }));
      if (url.endsWith('/search')) return new Response(JSON.stringify({ items: [candidate('b', 0.9, 'icon')], total: 2, page: 1, pageSize: 1, candidates: [candidate('b', 0.9, 'icon'), candidate('a', 0.4, 'vessel')] }));
      if (url.endsWith('/items/b')) return new Response(JSON.stringify(candidate('b', 0, 'icon')));
      if (url.includes('/items/')) return new Response('', { status: 404 });
      if (url.endsWith('/facets')) return new Response(JSON.stringify({ category: ['icon', 'vessel'] }));
      if (url.endsWith('/archive')) return new Response(JSON.stringify({ id: 'r1', sha256: 'abc' }));
      if (url.endsWith('places.json')) return new Response(JSON.stringify({ places: {} }));
      return new Response('', { status: 500 });
    })
  );
  return calls;
}

async function fresh() {
  vi.resetModules();
  return (await import('./remoteAdapter')).remoteAdapter;
}

describe('remoteAdapter', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuse de chercher si l’index a été calculé avec un autre modèle', async () => {
    stubService('Xenova/dinov2-small');
    const api = await fresh();
    await expect(api.search({ filters: {}, page: 1, pageSize: 10 })).rejects.toThrow(/index calculé avec Xenova\/dinov2-small/);
  });

  it('envoie le vecteur et jamais l’image, puis calcule la lecture sur les candidats', async () => {
    const calls = stubService();
    const api = await fresh();
    const r = await api.search({ filters: { origin: ['UA'] }, text: 'ic', page: 1, pageSize: 1, image: new File([new Uint8Array(4)], 'q.jpg') });
    const search = calls.find((c) => c.url.endsWith('/search'))!;
    const body = JSON.parse(String(search.init?.body));
    expect(search.init?.method).toBe('POST');
    expect(body).toEqual({ text: 'ic', filters: { origin: ['UA'] }, vector: [0, 1], page: 1, pageSize: 1, candidates: 200 });
    expect(JSON.stringify(body)).not.toMatch(/image|blob/i);
    expect(r.total).toBe(2);
    expect(r.items[0].thumbnailUrl).toBe('/app/data/thumbs/b.jpg');
    expect(r.insights?.references.map((x) => x.id)).toEqual(['b', 'a']);
    expect(r.insights?.categories[0].code).toBe('icon');
    expect(r.geo?.length ?? 0).toBe(0);
  });

  it('sans image : pas de vecteur, pas de lecture agrégée ; /meta n’est interrogé qu’une fois', async () => {
    const calls = stubService();
    const api = await fresh();
    await api.search({ filters: {}, page: 1, pageSize: 1 });
    const r = await api.search({ filters: {}, page: 1, pageSize: 1 });
    expect(JSON.parse(String(calls.find((c) => c.url.endsWith('/search'))!.init?.body)).vector).toBeUndefined();
    expect(r.insights).toBeUndefined();
    expect(calls.filter((c) => c.url.endsWith('/meta'))).toHaveLength(1);
  });

  it('« par description » : le vecteur du texte part, le texte lui-même non, pas de lecture agrégée', async () => {
    const calls = stubService();
    const api = await fresh();
    const r = await api.search({ filters: {}, text: 'icône dorée', semantic: true, page: 1, pageSize: 1 });
    const body = JSON.parse(String(calls.find((c) => c.url.endsWith('/search'))!.init?.body));
    expect(body.vector).toEqual([1, 0]);
    expect(body.text).toBe('');
    expect(r.insights).toBeUndefined();
  });

  it('getItem rend null sur 404, getFacets relaie le service, info décrit l’index', async () => {
    stubService();
    const api = await fresh();
    expect(await api.info()).toMatchObject({ model: MODEL_ID, dim: 2, count: 2, engine: 'service' });
    expect((await api.getItem('b'))?.thumbnailUrl).toBe('/app/data/thumbs/b.jpg');
    expect(await api.getItem('zz')).toBeNull();
    expect(await api.getFacets()).toEqual({ category: ['icon', 'vessel'] });
  });

  it('archive l’original avec son empreinte et ses métadonnées en multipart', async () => {
    const calls = stubService();
    const api = await fresh();
    const receipt = await api.archiveImage(new File([new Uint8Array(10)], 'orig.jpg', { type: 'image/jpeg' }), { fileName: 'orig.jpg', mimeType: 'image/jpeg', sizeBytes: 10, sha256: 'abc', stripped: false });
    expect(receipt).toEqual({ id: 'r1', sha256: 'abc' });
    const form = calls.find((c) => c.url.endsWith('/archive'))!.init?.body as FormData;
    expect((form.get('file') as File).name).toBe('orig.jpg');
    expect(form.get('sha256')).toBe('abc');
    expect(JSON.parse(String(form.get('info'))).sizeBytes).toBe(10);
  });
});
