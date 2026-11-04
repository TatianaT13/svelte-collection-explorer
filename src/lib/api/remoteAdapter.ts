import { base } from '$app/paths';
import type { ArchiveReceipt, CollectionAdapter } from './adapter';
import type { ImageInfo } from './imageInfo';
import type { CollectionItem, FacetValues, SearchQuery, SearchResult } from './types';
import { computeInsights, geoBuckets } from './insights';
import { places } from '$lib/stores/places.svelte';
import { schema } from '$lib/config/schema';

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
/** Nombre de candidats scorés rapatriés pour la lecture agrégée et la carte. */
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
    const [m, { MODEL_ID }] = await Promise.all([getJson<Meta>(`${API}/meta`), import('$lib/ml/embedder')]);
    if (m.model !== MODEL_ID) throw new Error(`index calculé avec ${m.model}, navigateur avec ${MODEL_ID}`);
    loadPlaces();
    return m;
  })().catch((e) => {
    meta = null;
    throw e;
  });
  return meta;
}

async function loadPlaces() {
  try {
    const r = await fetch(`${base}/data/places.json`);
    if (r.ok) places.set((await r.json()).places ?? {});
  } catch {
    /* gazetier absent : les lieux s'affichent par identifiant */
  }
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json() as Promise<T>;
}

function withBase(it: CollectionItem): CollectionItem {
  return { ...it, thumbnailUrl: it.thumbnailUrl ? `${base}/${it.thumbnailUrl}` : it.thumbnailUrl };
}

/** Moyenne de vecteurs normalisés, renormalisée : une seule requête pour plusieurs vues. */
function averageNormalized(vectors: Float32Array[]): Float32Array {
  if (vectors.length === 1) return vectors[0];
  const out = new Float32Array(vectors[0].length);
  for (const v of vectors) for (let i = 0; i < out.length; i++) out[i] += v[i];
  let norm = 0;
  for (let i = 0; i < out.length; i++) norm += out[i] * out[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

const queryCache = new WeakMap<File, Promise<Float32Array>>();
async function queryEmbedding(file: File): Promise<Float32Array> {
  let p = queryCache.get(file);
  if (!p) {
    p = import('$lib/ml/embedder').then(({ embedImage }) => embedImage(file));
    queryCache.set(file, p);
  }
  return p;
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
    let vector: number[] | undefined;
    if (query.image) {
      const views = [query.image, ...(query.extraImages ?? [])];
      vector = [...averageNormalized(await Promise.all(views.map(queryEmbedding)))];
    }
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
      // L'ensemble conforme est compté sur les candidats rapatriés (200) : une borne, documentée dans le README.
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
