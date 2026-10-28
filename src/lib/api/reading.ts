import type { Insights, Share } from './types';
import type { SimilarityThresholds } from '$lib/config/schema';
import { riskForCodes, type RiskRule } from '$lib/config/risk';

/**
 * Lecture d'un `Insights` : fiabilité, confiance, hésitations et signaux de risque.
 * Pur et testé ; partagé par le panneau de l'explorateur et la page Contrôle.
 */
export type Confidence = 'strong' | 'medium' | 'weak';

export interface Ambiguity {
  kind: 'category' | 'origin';
  options: Share[];
}

export interface Reading {
  best: number;
  reliable: boolean;
  confidence: Confidence;
  topCategory?: Share;
  topPeriod?: Share;
  origins: Share[];
  ambiguities: Ambiguity[];
  risks: RiskRule[];
}

/** Deux hypothèses trop proches pour trancher : la première ne domine pas, la seconde pèse. */
export function isAmbiguous(shares: Share[]): boolean {
  if (shares.length < 2) return false;
  const [a, b] = shares;
  return a.share < 0.55 && b.share >= 0.25 && a.share - b.share < 0.2;
}

/** Part minimale d'une origine pour qu'elle compte dans les signaux de risque. */
export const RISK_ORIGIN_MIN_SHARE = 0.15;

export function readInsights(insights: Insights, t: SimilarityThresholds): Reading {
  const best = insights.references[0]?.score ?? 0;
  const reliable = best >= t.reliable;
  const origins = insights.origins.filter((o) => o.share >= 0.005);
  const topCategory = insights.categories[0];
  const topPeriod = insights.periods[0];

  const ambiguities: Ambiguity[] = [];
  if (reliable && isAmbiguous(insights.categories)) ambiguities.push({ kind: 'category', options: insights.categories.slice(0, 2) });
  if (reliable && isAmbiguous(origins)) ambiguities.push({ kind: 'origin', options: origins.slice(0, 2) });

  let confidence: Confidence = 'weak';
  if (reliable && topCategory) {
    confidence = best >= t.strong && topCategory.share >= 0.6 ? 'strong' : topCategory.share >= 0.4 ? 'medium' : 'weak';
    if (ambiguities.length && confidence === 'strong') confidence = 'medium';
  }

  const risks: RiskRule[] = [];
  if (reliable) {
    // En cas d'hésitation sur le type, on examine les deux hypothèses.
    const categories = ambiguities.some((a) => a.kind === 'category') ? insights.categories.slice(0, 2) : topCategory ? [topCategory] : [];
    const seen = new Set<string>();
    // Une origine marginale (2 % d'Ukraine derrière 85 % d'Israël) ne déclenche pas de liste.
    const significant = origins.filter((o) => o.share >= RISK_ORIGIN_MIN_SHARE);
    for (const c of categories) {
      for (const o of significant) {
        for (const r of riskForCodes(o.code, c.code)) {
          if (!seen.has(r.id)) {
            seen.add(r.id);
            risks.push(r);
          }
        }
      }
    }
  }

  return { best, reliable, confidence, topCategory, topPeriod, origins, ambiguities, risks };
}
