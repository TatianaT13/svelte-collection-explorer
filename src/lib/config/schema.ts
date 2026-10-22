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
import type { LocalizedLabel } from '$lib/i18n/index.svelte';

export type FieldKind =
  | 'text'
  | 'longtext'
  | 'number'
  | 'boolean'
  | 'select' // options fournies par le backend (facettes dynamiques)
  | 'country' // code ISO 3166-1, liste complète, nom via Intl.DisplayNames
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

export interface CollectionSchema {
  name: LocalizedLabel;
  /** Taille de page par défaut des résultats. */
  pageSize: number;
  /**
   * Politique d'envoi des images. La version réduite sert à la recherche ;
   * l'original est conservé côté client et destiné à `adapter.archiveImage`.
   */
  upload: UploadPolicy;
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
  upload: { maxPx: 1600, skipBelowBytes: 2 * 1024 * 1024, quality: 0.85 },
  fields: [
    { key: 'category', label: { fr: 'Type d’objet', en: 'Object type' }, kind: 'vocab', vocabulary: 'category', showOnCard: true, filterable: true, group: G.identification },
    { key: 'origin', label: { fr: 'Origine', en: 'Origin' }, kind: 'country', showOnCard: true, filterable: true, group: G.identification },
    { key: 'period', label: { fr: 'Période', en: 'Period' }, kind: 'vocab', vocabulary: 'period', showOnCard: true, filterable: true, group: G.identification },
    { key: 'year', label: { fr: 'Date estimée', en: 'Estimated date' }, kind: 'number', group: G.identification },
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

    { key: 'inventory', label: { fr: 'N° inventaire', en: 'Inventory no.' }, kind: 'text', group: G.management }
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
