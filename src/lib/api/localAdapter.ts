import { base } from '$app/paths';
import type { ArchiveReceipt, CollectionAdapter } from './adapter';
import type { ImageInfo } from './imageInfo';
import type { CollectionItem, FacetValues, SearchQuery, SearchResult } from './types';
import { matchesFilters, matchesText, paginate } from './filtering';
import { computeInsights, geoBuckets } from './insights';
import { loadPlaces, queryVector, withBase } from './shared';
import { schema } from '$lib/config/schema';
import { i18n } from '$lib/i18n/index.svelte';

/**
 * Adapter local : métadonnées (static/data/items.json) et vecteurs (static/data/embeddings.bin,
 * Float32 n × dim dans le même ordre), produits par scripts/build-data.mjs ; recherche par image
 * calculée dans le navigateur. Aucun serveur : convient à GitHub Pages et aux démonstrations hors ligne.
 */
interface Dataset {
  model: string;
  dim: number;
  generatedAt: string;
  source: string;
  items: CollectionItem[];
}
interface Loaded {
  items: CollectionItem[];
  /** Vecteur de chaque objet, vue sur le tampon binaire : construit une fois, pas à chaque requête. */
  vectorOf: Map<string, Float32Array>;
}

let loaded: Promise<Loaded> | null = null;

async function fetchOk(path: string): Promise<Response> {
  const r = await fetch(`${base}/data/${path}`);
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r;
}

function load(): Promise<Loaded> {
  loaded ??= Promise.all([fetchOk('items.json').then((r) => r.json() as Promise<Dataset>), fetchOk('embeddings.bin').then((r) => r.arrayBuffer()), loadPlaces()])
    .then(([d, buf]) => {
      const all = new Float32Array(buf);
      if (all.length !== d.items.length * d.dim) throw new Error(`embeddings.bin : ${all.length} valeurs pour ${d.items.length} × ${d.dim}`);
      const items = d.items.map(withBase);
      return { items, vectorOf: new Map(items.map((it, i) => [it.id, all.subarray(i * d.dim, (i + 1) * d.dim)])) };
    })
    .catch((e) => {
      loaded = null;
      throw e;
    });
  return loaded;
}

export const localAdapter: CollectionAdapter = {
  async search(query: SearchQuery): Promise<SearchResult> {
    const { items, vectorOf } = await load();
    const locale = i18n.locale;
    let results = items.filter((it) => matchesFilters(it, query.filters) && matchesText(it, query.text, locale));

    let insights;
    if (query.image) {
      const [{ cosine }, q] = await Promise.all([import('$lib/ml/embedder'), queryVector(query.image, query.extraImages)]);
      results = results
        .map((it) => ({ ...it, score: Math.round(cosine(q, vectorOf.get(it.id) ?? []) * 1000) / 1000 }))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      insights = computeInsights(results, schema.similarity.topK, schema.similarity.calibration?.tau);
    }

    return {
      items: paginate(results, query.page, query.pageSize),
      total: results.length,
      page: query.page,
      pageSize: query.pageSize,
      insights,
      geo: geoBuckets(results)
    };
  },

  async getItem(id: string): Promise<CollectionItem | null> {
    const { items } = await load();
    return items.find((x) => x.id === id) ?? null;
  },

  async getFacets(): Promise<FacetValues> {
    return {};
  },

  /** Sans serveur, rien n'est archivé : on rend un identifiant local et l'empreinte lue côté client. */
  async archiveImage(original: File, info?: ImageInfo): Promise<ArchiveReceipt> {
    return { id: `local-${Date.now().toString(36)}-${original.size.toString(36)}`, sha256: info?.sha256 };
  }
};
