import type { Insights, Reference, Share } from './types';
import type { SimilarityThresholds } from '#lib/config/schema.ts';
import { riskForCodes, type RiskRule } from '#lib/config/risk.ts';

/**
 * Lecture d'un `Insights` : fiabilité, confiance, hésitations et signaux de risque.
 * Pur et testé ; partagé par le panneau de l'explorateur et la page Contrôle.
 */
export type Confidence = 'strong' | 'medium' | 'weak';

export interface Ambiguity {
  kind: 'category' | 'origin';
  options: Share[];
}

/**
 * Ensemble conforme : les objets de similarité ≥ τ. Sur le jeu de calibration, le bon objet dépasse τ
 * dans une part visée de 1 − α des cas ; cette propriété ne vaut que pour des requêtes de même
 * distribution que la calibration (vues de studio), elle n'est pas une garantie en conditions réelles.
 * `total` compte sur le classement complet quand l'adapter le fournit (`Insights.aboveTau`) ;
 * `candidates` est la partie visible (références du top-K). Vide : résultat non concluant.
 */
export interface ConformalSet {
  alpha: number;
  tau: number;
  /** Références affichables au-dessus de τ (sous-ensemble du top-K). */
  candidates: Reference[];
  /** Taille de l'ensemble sur le classement complet (ou sur les candidats connus). */
  total: number;
  /** Vrai si l'ensemble dépasse ce que `candidates` montre. */
  truncated: boolean;
  /** Aucun objet au-dessus de τ : non concluant, pas « absent de la base ». */
  inconclusive: boolean;
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
  /** Présent seulement si le schéma porte une calibration. */
  conformal?: ConformalSet;
}

export function conformalSet(references: Reference[], alpha: number, tau: number, aboveTau?: number): ConformalSet {
  const candidates = references.filter((r) => r.score >= tau);
  const total = aboveTau ?? candidates.length;
  return { alpha, tau, candidates, total, truncated: total > candidates.length, inconclusive: total === 0 };
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
  // Seuil de fiabilité : τ calibré quand il existe ; sinon on exige une similarité forte.
  const conformal = t.calibration ? conformalSet(insights.references, t.calibration.alpha, t.calibration.tau, insights.aboveTau) : undefined;
  const reliable = best >= (t.calibration?.tau ?? t.strong);
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

  return { best, reliable, confidence, topCategory, topPeriod, origins, ambiguities, risks, conformal };
}
