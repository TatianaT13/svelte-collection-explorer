import type { CollectionItem, Insights } from '$lib/api/types';
import { riskFor } from '$lib/config/risk';
import { schema } from '$lib/config/schema';
import { i18n } from '$lib/i18n/index.svelte';
import { lastQuery } from '$lib/stores/query.svelte';

/** Dossier de contrôle : photo de référence (sans l'image), lecture, candidats, décision. */
export function buildCaseFile(items: CollectionItem[], insights?: Insights | null) {
  return {
    exportedAt: new Date().toISOString(),
    collection: i18n.l(schema.name),
    locale: i18n.locale,
    referencePhoto: lastQuery.record,
    reading: insights
      ? {
          topK: insights.topK,
          categories: insights.categories,
          origins: insights.origins,
          materials: insights.materials,
          periods: insights.periods
        }
      : undefined,
    candidates: items.map((it) => ({
      id: it.id,
      title: it.title,
      score: it.score,
      imageUrl: it.imageUrl,
      metadata: it.metadata,
      redLists: riskFor(it).map((r) => i18n.l(r.label))
    }))
  };
}

export function caseFileName(): string {
  return `dossier-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
}

export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
