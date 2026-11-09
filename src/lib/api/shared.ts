import { asset } from '$app/paths';
import type { AssetPath } from '$app/types';
import type { CollectionItem } from './types';
import { places } from '#lib/stores/places.svelte.ts';

/** Ce que les adapters local et distant ont en commun : gazetier, vignettes, vecteur de requête. */

export async function loadPlaces(): Promise<void> {
  try {
    const r = await fetch(asset('data/places.json'));
    if (r.ok) places.set((await r.json()).places ?? {});
  } catch {
    /* gazetier absent : les lieux s'affichent par identifiant */
  }
}

/** Les vignettes sont servies sous le chemin de base de l'application (GitHub Pages). */
export function withBase(it: CollectionItem): CollectionItem {
  return { ...it, thumbnailUrl: it.thumbnailUrl ? asset(it.thumbnailUrl as AssetPath) : it.thumbnailUrl };
}

/** Moyenne de vecteurs normalisés, renormalisée : une seule requête pour plusieurs vues du même objet. */
export function averageNormalized(vectors: Float32Array[]): Float32Array {
  if (vectors.length === 1) return vectors[0];
  const out = new Float32Array(vectors[0].length);
  for (const v of vectors) for (let i = 0; i < out.length; i++) out[i] += v[i];
  let norm = 0;
  for (let i = 0; i < out.length; i++) norm += out[i] * out[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

/** Embedding de la photo envoyée, calculé une fois par fichier (le modèle n'est chargé qu'à la première requête). */
const queryCache = new WeakMap<File, Promise<Float32Array>>();
export function queryEmbedding(file: File): Promise<Float32Array> {
  let p = queryCache.get(file);
  if (!p) {
    p = import('#lib/ml/embedder.ts').then(({ embedImage }) => embedImage(file));
    queryCache.set(file, p);
  }
  return p;
}

/** Vecteur de requête pour une image principale et ses vues supplémentaires. */
export async function queryVector(image: File, extra: File[] = []): Promise<Float32Array> {
  return averageNormalized(await Promise.all([image, ...extra].map(queryEmbedding)));
}
