/**
 * Schéma de métadonnées : décrit les champs d'un objet et comment
 * les afficher / filtrer. Adapter ce fichier suffit pour changer de domaine.
 *
 * Les libellés sont multilingues ({ fr, en, … }) ; `i18n.l()` choisit la langue courante.
 * Les champs suivent le standard Object ID (ICOM / Interpol / UNESCO) :
 * type d'objet, matériaux et techniques, mesures, inscriptions et marques,
 * signes distinctifs, titre, sujet, date ou période, auteur.
 */
import type { VocabularyId } from './vocabularies';
import clipCalibration from '../../../eval/calibration-clip.json';
import type { LocalizedLabel } from '#lib/i18n/index.svelte.ts';

export type FieldKind =
  | 'text'
  | 'longtext'
  | 'number'
  | 'boolean'
  | 'select' // options fournies par le backend (facettes dynamiques)
  | 'country' // code ISO 3166-1, liste complète, nom via Intl.DisplayNames
  | 'place' // identifiant Wikidata d'un lieu, hiérarchie et coordonnées via le gazetier
  | 'vocab'; // code d'un vocabulaire contrôlé (voir vocabularies.ts)

export interface FieldGroup {
  id: string;
  label: LocalizedLabel;
}

export interface FieldSchema {
  /** Clé dans `item.metadata`. */
  key: string;
  label: LocalizedLabel;
  kind: FieldKind;
  /** Vocabulaire utilisé quand kind = 'vocab'. */
  vocabulary?: VocabularyId;
  /** Plusieurs valeurs possibles (tableau de codes). */
  multiple?: boolean;
  /** Affiché sur la carte résultat (sinon seulement en détail / comparaison). */
  showOnCard?: boolean;
  /** Proposé comme filtre dans le panneau latéral. */
  filterable?: boolean;
  /** Unité affichée après la valeur. */
  unit?: string;
  /** Regroupement visuel dans la comparaison / le détail. */
  group?: FieldGroup;
}

export interface UploadPolicy {
  /** Côté maximal (px) de l'image envoyée pour la recherche. */
  maxPx: number;
  /** En dessous de ce poids (octets), l'image part telle quelle, sans recompression. */
  skipBelowBytes: number;
  /** Qualité JPEG de la version réduite (0..1). */
  quality: number;
}

/**
 * Seuil conforme : τ = quantile d'ordre α des similarités du bon objet sur un jeu de calibration
 * (vues alternatives d'objets connus, même modèle). Garantie : le bon objet est parmi les candidats de
 * similarité ≥ τ avec probabilité ≥ 1 − α, sur la distribution de calibration. Produit par scripts/calibrate.mjs,
 * lu directement dans son fichier de résultats : rien n'est recopié à la main.
 */
export interface Calibration {
  /** Modèle pour lequel τ a été mesuré ; doit être celui du navigateur et de l'index. */
  model: string;
  alpha: number;
  tau: number;
  /** Fichier de résultats d'où vient τ, pour la traçabilité. */
  source: string;
}


/** Extrait la ligne α d'un fichier produit par scripts/calibrate.mjs. */
function calibrationFrom(report: { model: string; generatedAt: string; thresholds: { alpha: number; tau: number }[] }, alpha: number, source: string): Calibration {
  const row = report.thresholds.find((t) => t.alpha === alpha);
  if (!row) throw new Error(`${source} : pas de seuil pour α = ${alpha}`);
  return { model: report.model, alpha, tau: row.tau, source: `${source} · ${report.generatedAt.slice(0, 10)}` };
}

export interface SimilarityThresholds {
  /** Seuils calibrés ; absents, `reliable` fait foi. */
  calibration?: Calibration;
  /** Score (cosinus) à partir duquel la similarité est dite forte. */
  strong: number;
  /**
   * Score à partir duquel elle est dite moyenne ; en dessous, faible.
   * La fiabilité de la lecture (hésitations examinées, signaux de risque émis) est jugée sur τ quand une
   * calibration existe ; sans calibration, sur `strong` — on exige alors une similarité forte.
   */
  medium: number;
  /** Nombre de meilleurs résultats utilisés pour la lecture agrégée (identification, provenance). */
  topK: number;
}

export interface PhotoQualityPolicy {
  /** Petit côté minimal (px) de l'image ou de la zone cadrée. */
  minSide: number;
  /** Netteté normalisée (variance du laplacien / variance de luminance, à 512 px) en dessous de laquelle la photo est floue. */
  blur: number;
  /** Luminance moyenne (0..255) en dessous de laquelle la photo est sombre. */
  dark: number;
  /** Luminance moyenne au-dessus de laquelle elle est surexposée. */
  bright: number;
  /** Écart-type de luminance en dessous duquel elle manque de contraste. */
  lowContrast: number;
  /** Part de pixels saturés au-delà de laquelle on suspecte des reflets. */
  clipped: number;
  /** Prise de vue guidée : seuil de contours au bord (objet coupé) et inclinaison maximale en degrés. */
  cutEdges?: number;
  maxTilt?: number;
}

export interface CollectionSchema {
  name: LocalizedLabel;
  /** Taille de page par défaut des résultats. */
  pageSize: number;
  /** Lecture du score de similarité renvoyé par le backend (0..1). */
  similarity: SimilarityThresholds;
  /**
   * Politique d'envoi des images. La version réduite sert à la recherche ;
   * l'original est conservé côté client et destiné à `adapter.archiveImage`.
   */
  upload: UploadPolicy;
  /** Seuils du contrôle qualité de la photo avant analyse. */
  photoQuality: PhotoQualityPolicy;
  fields: FieldSchema[];
}

const G = {
  identification: { id: 'identification', label: { fr: 'Identification', en: 'Identification' } },
  materials: { id: 'materials', label: { fr: 'Matériaux et techniques', en: 'Materials and techniques' } },
  measures: { id: 'measures', label: { fr: 'Mesures', en: 'Measurements' } },
  description: { id: 'description', label: { fr: 'Description', en: 'Description' } },
  management: { id: 'management', label: { fr: 'Gestion', en: 'Management' } }
} satisfies Record<string, FieldGroup>;

export const schema: CollectionSchema = {
  name: { fr: 'Objets culturels', en: 'Cultural objects' },
  pageSize: 12,
  similarity: {
    strong: 0.8,
    medium: 0.65,
    topK: 12,
    // τ mesuré par `npm run calibrate -- --model clip` sur 400 paires (principale, vue alternative) du Met, 69 en
    // calibration : le bon objet est à similarité ≥ τ dans 90 % des cas sur ce jeu (0,747 au 6 novembre 2026). Avant
    // calibration, le seuil réglé à la main valait 0,75 (images sans rapport 0,63–0,72, vraies correspondances 0,93–0,97).
    calibration: calibrationFrom(clipCalibration, 0.1, 'eval/calibration-clip.json')
  },
  upload: { maxPx: 1600, skipBelowBytes: 2 * 1024 * 1024, quality: 0.85 },
  // Calibré sur des photos de test : nette 0,08–0,16, floutée 0,001 ; contraste d'un tableau aux tons doux ≈ 20.
  // cutEdges et maxTilt ne servent qu'en prise de vue guidée (flux caméra) : contours au bord du cadre, inclinaison.
  photoQuality: { minSide: 300, blur: 0.02, dark: 55, bright: 205, lowContrast: 15, clipped: 0.25, cutEdges: 0.6, maxTilt: 6 },
  fields: [
    { key: 'category', label: { fr: 'Type d’objet', en: 'Object type' }, kind: 'vocab', vocabulary: 'category', showOnCard: true, filterable: true, group: G.identification },
    { key: 'origin', label: { fr: 'Origine', en: 'Origin' }, kind: 'country', showOnCard: true, filterable: true, group: G.identification },
    { key: 'origin_basis', label: { fr: 'Base de l’origine', en: 'Origin basis' }, kind: 'vocab', vocabulary: 'origin_basis', filterable: true, group: G.identification },
    { key: 'place', label: { fr: 'Lieu', en: 'Place' }, kind: 'place', filterable: true, group: G.identification },
    { key: 'period', label: { fr: 'Période', en: 'Period' }, kind: 'vocab', vocabulary: 'period', showOnCard: true, filterable: true, group: G.identification },
    { key: 'date_text', label: { fr: 'Date', en: 'Date' }, kind: 'text', group: G.identification },
    { key: 'year', label: { fr: 'Année (début)', en: 'Year (start)' }, kind: 'number', group: G.identification },
    { key: 'maker', label: { fr: 'Auteur / atelier', en: 'Maker / workshop' }, kind: 'text', filterable: true, group: G.identification },

    { key: 'material', label: { fr: 'Matériaux', en: 'Materials' }, kind: 'vocab', vocabulary: 'material', multiple: true, filterable: true, group: G.materials },
    { key: 'technique', label: { fr: 'Techniques', en: 'Techniques' }, kind: 'vocab', vocabulary: 'technique', multiple: true, filterable: true, group: G.materials },

    { key: 'height_cm', label: { fr: 'Hauteur', en: 'Height' }, kind: 'number', unit: 'cm', group: G.measures },
    { key: 'width_cm', label: { fr: 'Largeur', en: 'Width' }, kind: 'number', unit: 'cm', group: G.measures },
    { key: 'depth_cm', label: { fr: 'Profondeur', en: 'Depth' }, kind: 'number', unit: 'cm', group: G.measures },
    { key: 'weight_g', label: { fr: 'Poids', en: 'Weight' }, kind: 'number', unit: 'g', group: G.measures },

    { key: 'subject', label: { fr: 'Sujet', en: 'Subject' }, kind: 'vocab', vocabulary: 'subject', filterable: true, group: G.description },
    { key: 'inscriptions', label: { fr: 'Inscriptions et marques', en: 'Inscriptions and markings' }, kind: 'longtext', group: G.description },
    { key: 'distinguishing_features', label: { fr: 'Signes distinctifs', en: 'Distinguishing features' }, kind: 'longtext', group: G.description },
    { key: 'description', label: { fr: 'Description', en: 'Description' }, kind: 'longtext', group: G.description },

    { key: 'inventory', label: { fr: 'N° inventaire', en: 'Inventory no.' }, kind: 'text', group: G.management },
    { key: 'source', label: { fr: 'Source', en: 'Source' }, kind: 'longtext', group: G.management }
  ]
};

export const cardFields = schema.fields.filter((f) => f.showOnCard);
export const filterFields = schema.fields.filter((f) => f.filterable);

/** Champs regroupés, dans l'ordre du schéma. */
export const fieldGroups: { group: FieldGroup | null; fields: FieldSchema[] }[] = schema.fields.reduce(
  (groups, f) => {
    const g = groups.find((x) => x.group?.id === (f.group?.id ?? null) || (x.group === null && !f.group));
    if (g) g.fields.push(f);
    else groups.push({ group: f.group ?? null, fields: [f] });
    return groups;
  },
  [] as { group: FieldGroup | null; fields: FieldSchema[] }[]
);
