import { base } from '$app/paths';
import type { ArchiveReceipt, CollectionAdapter } from './adapter';
import type { ImageInfo } from './imageInfo';
import type { CollectionItem, FacetValues, SearchQuery, SearchResult } from './types';
import { matchesFilters, matchesText, paginate } from './filtering';
import { i18n } from '$lib/i18n/index.svelte';

/**
 * Adapter local : jeu de données statique (static/data/items.json, produit par
 * scripts/build-data.mjs) et recherche par image calculée dans le navigateur.
 * Aucun serveur : convient à GitHub Pages et aux démonstrations hors ligne.
 */
interface DataItem extends CollectionItem {
  embedding: number[];
}
interface Dataset {
  model: string;
  generatedAt: string;
  source: string;
  items: DataItem[];
}

let dataset: Promise<Dataset> | null = null;

function loadDataset(): Promise<Dataset> {
  dataset ??= fetch(`${base}/data/items.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`items.json ${r.status}`);
      return r.json() as Promise<Dataset>;
    })
    .then((d) => ({
      ...d,
      items: d.items.map((it) => ({ ...it, thumbnailUrl: it.thumbnailUrl ? `${base}/${it.thumbnailUrl}` : it.thumbnailUrl }))
    }))
    .catch((e) => {
      dataset = null;
      throw e;
    });
  return dataset;
}

/** Embedding de la photo envoyée, calculé une fois par fichier. */
const queryCache = new WeakMap<File, Promise<Float32Array>>();
async function queryEmbedding(file: File): Promise<Float32Array> {
  let p = queryCache.get(file);
  if (!p) {
    p = import('$lib/ml/embedder').then(({ embedImage }) => embedImage(file));
    queryCache.set(file, p);
  }
  return p;
}

function strip({ embedding: _e, ...item }: DataItem): CollectionItem {
  return item;
}

export const localAdapter: CollectionAdapter = {
  async search(query: SearchQuery): Promise<SearchResult> {
    const { items } = await loadDataset();
    const locale = i18n.locale;
    let results: CollectionItem[] = items
      .filter((it) => matchesFilters(it, query.filters) && matchesText(it, query.text, locale))
      .map(strip);

    if (query.image) {
      const q = await queryEmbedding(query.image);
      const { cosine } = await import('$lib/ml/embedder');
      const byId = new Map(items.map((it) => [it.id, it.embedding]));
      results = results
        .map((it) => ({ ...it, score: Math.round(cosine(q, byId.get(it.id) ?? []) * 1000) / 1000 }))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }

    return { items: paginate(results, query.page, query.pageSize), total: results.length, page: query.page, pageSize: query.pageSize };
  },

  async getItem(id: string): Promise<CollectionItem | null> {
    const { items } = await loadDataset();
    const it = items.find((x) => x.id === id);
    return it ? strip(it) : null;
  },

  async getFacets(): Promise<FacetValues> {
    return {};
  },

  async archiveImage(original: File, info?: ImageInfo): Promise<ArchiveReceipt> {
    return { id: `local-${Date.now().toString(36)}-${original.size.toString(36)}`, sha256: info?.sha256 };
  }
};
