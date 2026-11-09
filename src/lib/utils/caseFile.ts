import type { CollectionInfo } from '#lib/api/adapter.ts';
import { readInsights } from '#lib/api/reading.ts';
import type { CollectionItem, Insights } from '#lib/api/types.ts';
import { riskFor } from '#lib/config/risk.ts';
import { schema } from '#lib/config/schema.ts';
import { i18n } from '#lib/i18n/index.svelte.ts';
import { MODEL_ID, MODEL_REVISION } from '#lib/ml/model.ts';
import { lastQuery } from '#lib/stores/query.svelte.ts';

/**
 * Dossier de contrôle : photo de référence (sans l'image), lecture, candidats, décision — et tout ce qu'il faut
 * pour rejouer le résultat plus tard : modèle et révision du navigateur, base interrogée (modèle, date, taille),
 * seuils en vigueur (τ calibré et sa source), scores de chaque candidat.
 */
export function buildCaseFile(items: CollectionItem[], insights?: Insights | null, info?: CollectionInfo) {
  const reading = insights ? readInsights(insights, schema.similarity) : undefined;
  return {
    exportedAt: new Date().toISOString(),
    collection: i18n.l(schema.name),
    locale: i18n.locale,
    engine: { model: MODEL_ID, revision: MODEL_REVISION, inference: 'navigateur (transformers.js, int8)' },
    dataset: info,
    thresholds: schema.similarity,
    referencePhoto: lastQuery.record,
    reading:
      insights && reading
        ? {
            topK: insights.topK,
            bestScore: reading.best,
            reliable: reading.reliable,
            confidence: reading.confidence,
            conformal: reading.conformal ? { tau: reading.conformal.tau, alpha: reading.conformal.alpha, aboveTau: reading.conformal.total, inconclusive: reading.conformal.inconclusive } : undefined,
            categories: insights.categories,
            origins: insights.origins,
            materials: insights.materials,
            periods: insights.periods,
            risks: reading.risks.map((r) => r.id)
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
