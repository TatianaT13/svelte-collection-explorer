/**
 * Schéma de métadonnées : décrit les champs d'un objet et comment
 * les afficher / filtrer. Adapter ce fichier suffit pour changer de domaine.
 *
 * Les champs suivent le standard Object ID (ICOM / Interpol / UNESCO) :
 * type d'objet, matériaux et techniques, mesures, inscriptions et marques,
 * signes distinctifs, titre, sujet, date ou période, auteur.
 */
import type { VocabularyId } from './vocabularies';

export type FieldKind =
  | 'text'
  | 'longtext'
  | 'number'
  | 'boolean'
  | 'select' // options fournies par le backend (facettes dynamiques)
  | 'country' // code ISO 3166-1, liste complète, nom via Intl.DisplayNames
  | 'vocab'; // code d'un vocabulaire contrôlé (voir vocabularies.ts)

export interface FieldSchema {
  /** Clé dans `item.metadata`. */
  key: string;
  label: string;
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
  group?: string;
}

export interface CollectionSchema {
  name: string;
  /** Locale d'affichage (noms de pays, libellés, dates, tri). */
  locale: string;
  /** Taille de page par défaut des résultats. */
  pageSize: number;
  fields: FieldSchema[];
}

export const schema: CollectionSchema = {
  name: 'Objets culturels',
  locale: 'fr',
  pageSize: 12,
  fields: [
    // Identification
    { key: 'category', label: 'Type d’objet', kind: 'vocab', vocabulary: 'category', showOnCard: true, filterable: true, group: 'Identification' },
    { key: 'origin', label: 'Origine', kind: 'country', showOnCard: true, filterable: true, group: 'Identification' },
    { key: 'period', label: 'Période', kind: 'vocab', vocabulary: 'period', showOnCard: true, filterable: true, group: 'Identification' },
    { key: 'year', label: 'Date estimée', kind: 'number', group: 'Identification' },
    { key: 'maker', label: 'Auteur / atelier', kind: 'text', filterable: true, group: 'Identification' },

    // Matériaux et techniques
    { key: 'material', label: 'Matériaux', kind: 'vocab', vocabulary: 'material', multiple: true, filterable: true, group: 'Matériaux et techniques' },
    { key: 'technique', label: 'Techniques', kind: 'vocab', vocabulary: 'technique', multiple: true, filterable: true, group: 'Matériaux et techniques' },

    // Mesures
    { key: 'height_cm', label: 'Hauteur', kind: 'number', unit: 'cm', group: 'Mesures' },
    { key: 'width_cm', label: 'Largeur', kind: 'number', unit: 'cm', group: 'Mesures' },
    { key: 'depth_cm', label: 'Profondeur', kind: 'number', unit: 'cm', group: 'Mesures' },
    { key: 'weight_g', label: 'Poids', kind: 'number', unit: 'g', group: 'Mesures' },

    // Description
    { key: 'subject', label: 'Sujet', kind: 'vocab', vocabulary: 'subject', filterable: true, group: 'Description' },
    { key: 'inscriptions', label: 'Inscriptions et marques', kind: 'longtext', group: 'Description' },
    { key: 'distinguishing_features', label: 'Signes distinctifs', kind: 'longtext', group: 'Description' },
    { key: 'description', label: 'Description', kind: 'longtext', group: 'Description' },

    // Gestion
    { key: 'inventory', label: 'N° inventaire', kind: 'text', group: 'Gestion' }
  ]
};

export const cardFields = schema.fields.filter((f) => f.showOnCard);
export const filterFields = schema.fields.filter((f) => f.filterable);

/** Champs regroupés, dans l'ordre du schéma. */
export const fieldGroups: { name: string; fields: FieldSchema[] }[] = schema.fields.reduce(
  (groups, f) => {
    const name = f.group ?? '';
    const g = groups.find((x) => x.name === name);
    if (g) g.fields.push(f);
    else groups.push({ name, fields: [f] });
    return groups;
  },
  [] as { name: string; fields: FieldSchema[] }[]
);
