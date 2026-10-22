import type { ImageInfo } from './imageInfo';

/**
 * Types partagés entre le front et la couche adapter.
 * Un backend différent n'a qu'à produire ces structures.
 */

/** Valeur d'un champ de métadonnée : libre, le schéma décide comment l'afficher. */
export type MetadataValue = string | number | boolean | string[] | null;

/** Un objet de la collection (œuvre, artefact, produit...). */
export interface CollectionItem {
  id: string;
  title: string;
  imageUrl: string;
  thumbnailUrl?: string;
  /** Score de similarité 0..1 quand l'objet vient d'une recherche par image. */
  score?: number;
  metadata: Record<string, MetadataValue>;
}

/** Filtres actifs, indexés par clé de champ du schéma. */
export type ActiveFilters = Record<string, MetadataValue>;

export interface SearchQuery {
  text?: string;
  filters: ActiveFilters;
  /** Image envoyée pour une recherche visuelle. */
  image?: File;
  /** Métadonnées lues côté client (indicatives), envoyées avec l'image. */
  imageInfo?: ImageInfo;
  page: number;
  pageSize: number;
}

/** Part d'une valeur parmi les meilleurs résultats d'une recherche par image. */
export interface Share {
  code: string;
  /** Part pondérée par la similarité, 0..1. */
  share: number;
  /** Nombre d'objets de référence portant cette valeur. */
  count: number;
}

/** Objet de référence ayant servi au calcul. */
export interface Reference {
  id: string;
  title: string;
  thumbnailUrl?: string;
  score: number;
  origin?: string;
}

/**
 * Lecture agrégée des meilleurs résultats d'une recherche par image :
 * ce que l'objet est probablement, d'où il vient probablement, et sur quoi on s'appuie.
 */
export interface Insights {
  topK: number;
  origins: Share[];
  categories: Share[];
  materials: Share[];
  periods: Share[];
  references: Reference[];
}

export interface SearchResult {
  items: CollectionItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Présent seulement pour une recherche par image. */
  insights?: Insights;
}

/** Valeurs possibles d'un champ à facettes (pour alimenter les listes déroulantes). */
export type FacetValues = Record<string, string[]>;
