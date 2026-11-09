import type { ArchiveReceipt, CollectionAdapter } from './adapter';
import type { ImageInfo } from './imageInfo';
import type { CollectionItem, FacetValues, SearchQuery, SearchResult } from './types';
import { computeInsights, geoBuckets } from './insights';
import { loadPlaces, queryVector, withBase } from './shared';
import { schema } from '#lib/config/schema.ts';

/**
 * Adapter distant : l'index des vecteurs vit dans un service séparé (service/main.py, HNSW), le
 * navigateur garde l'inférence. Pour une recherche par image, le vecteur est calculé ici, et seuls
 * ses quelques centaines de nombres partent au service : l'image ne quitte pas le poste.
 * Le service renvoie la page demandée et les meilleurs candidats ; la lecture agrégée (insights,
 * carte) est calculée côté client avec les mêmes fonctions pures que l'adapter local.
 *
 *   VITE_ADAPTER=remote VITE_API_URL=http://localhost:8000 npm run dev
 */
const API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';
/** Nombre de candidats scorés rapatriés pour la lecture agrégée et la carte (borne de l'ensemble conforme). */
const CANDIDATES = 200;

interface Meta {
  model: string;
  dim: number;
  count: number;
  generatedAt: string;
}

let meta: Promise<Meta> | null = null;
/** L'index et le navigateur doivent utiliser le même modèle : un vecteur CLIP contre un index DINO ne renvoie que du bruit. */
async function checkMeta(): Promise<Meta> {
  meta ??= (async () => {
    const [m, { MODEL_ID }] = await Promise.all([getJson<Meta>(`${API}/meta`), import('#lib/ml/embedder.ts')]);
    if (m.model !== MODEL_ID) throw new Error(`index calculé avec ${m.model}, navigateur avec ${MODEL_ID}`);
    loadPlaces();
    return m;
  })().catch((e) => {
    meta = null;
    throw e;
  });
  return meta;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json() as Promise<T>;
}

interface RemoteSearch {
  items: CollectionItem[];
  total: number;
  page: number;
  pageSize: number;
  candidates: CollectionItem[];
}

export const remoteAdapter: CollectionAdapter = {
  async search(query: SearchQuery): Promise<SearchResult> {
    await checkMeta();
    const vector = query.image ? [...(await queryVector(query.image, query.extraImages))] : undefined;
    const r = await getJson<RemoteSearch>(`${API}/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: query.text ?? '', filters: query.filters, vector, page: query.page, pageSize: query.pageSize, candidates: CANDIDATES })
    });
    const candidates = r.candidates.map(withBase);
    return {
      items: r.items.map(withBase),
      total: r.total,
      page: r.page,
      pageSize: r.pageSize,
      insights: vector ? computeInsights(candidates, schema.similarity.topK, schema.similarity.calibration?.tau) : undefined,
      geo: geoBuckets(candidates)
    };
  },

  async getItem(id: string): Promise<CollectionItem | null> {
    await checkMeta();
    const r = await fetch(`${API}/items/${encodeURIComponent(id)}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${r.status} ${API}/items/${id}`);
    return withBase((await r.json()) as CollectionItem);
  },

  async getFacets(): Promise<FacetValues> {
    await checkMeta();
    return getJson<FacetValues>(`${API}/facets`);
  },

  /** L'original part tel quel ; le service recalcule l'empreinte et refuse si elle ne correspond pas. */
  async archiveImage(original: File, info?: ImageInfo): Promise<ArchiveReceipt> {
    await checkMeta();
    const form = new FormData();
    form.append('file', original, original.name);
    if (info?.sha256) form.append('sha256', info.sha256);
    if (info) form.append('info', JSON.stringify(info));
    return getJson<ArchiveReceipt>(`${API}/archive`, { method: 'POST', body: form });
  }
};
