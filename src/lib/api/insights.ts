import type { CollectionItem, GeoBucket, Insights, Share } from './types';

/**
 * Agrège les meilleurs résultats d'une recherche par image en une lecture simple :
 * parts pondérées par la similarité pour l'origine, le type, les matériaux et la période.
 * Pur et testable ; un backend ferait le même calcul côté serveur.
 */

/** Poids d'un score : nul sous le plancher, croissant au-dessus (accentue les très proches). */
function weightOf(score: number, floor = 0.5): number {
  const w = Math.max(0, score - floor);
  return w * w;
}

function shares(items: CollectionItem[], key: string, weights: number[]): Share[] {
  const acc = new Map<string, { w: number; n: number }>();
  let total = 0;
  items.forEach((it, i) => {
    const raw = it.metadata[key];
    const values = (Array.isArray(raw) ? raw : [raw]).map((v) => (v === null || v === undefined ? '' : String(v))).filter(Boolean);
    if (!values.length) return;
    const w = weights[i] / values.length; // une valeur multiple partage le poids de l'objet
    for (const v of values) {
      const e = acc.get(v) ?? { w: 0, n: 0 };
      e.w += w;
      e.n += 1;
      acc.set(v, e);
      total += w;
    }
  });
  if (total === 0) return [];
  return [...acc.entries()]
    .map(([code, { w, n }]) => ({ code, share: w / total, count: n }))
    .sort((a, b) => b.share - a.share);
}

export function computeInsights(ranked: CollectionItem[], topK = 12): Insights {
  const top = ranked.filter((it) => typeof it.score === 'number').slice(0, topK);
  let weights = top.map((it) => weightOf(it.score ?? 0));
  if (weights.every((w) => w === 0)) weights = top.map(() => 1); // tout est loin : parts égales
  return {
    topK: top.length,
    origins: shares(top, 'origin', weights).slice(0, 3),
    places: shares(top, 'place', weights).slice(0, 6),
    categories: shares(top, 'category', weights).slice(0, 3),
    materials: shares(top, 'material', weights).slice(0, 3),
    techniques: shares(top, 'technique', weights).slice(0, 3),
    subjects: shares(top, 'subject', weights).slice(0, 2),
    periods: shares(top, 'period', weights).slice(0, 3),
    references: top.map((it) => ({
      id: it.id,
      title: it.title,
      thumbnailUrl: it.thumbnailUrl ?? it.imageUrl,
      score: it.score ?? 0,
      origin: it.metadata.origin ? String(it.metadata.origin) : undefined
    }))
  };
}

/** Regroupe des résultats par lieu (pour la carte). */
export function geoBuckets(items: CollectionItem[]): GeoBucket[] {
  const acc = new Map<string, GeoBucket>();
  for (const it of items) {
    const place = it.metadata.place ? String(it.metadata.place) : '';
    if (!place) continue;
    const b = acc.get(place) ?? { place, count: 0, ids: [] };
    b.count++;
    b.ids.push(it.id);
    if (typeof it.score === 'number') b.bestScore = Math.max(b.bestScore ?? 0, it.score);
    acc.set(place, b);
  }
  return [...acc.values()].sort((a, b) => (b.bestScore ?? 0) - (a.bestScore ?? 0) || b.count - a.count);
}
