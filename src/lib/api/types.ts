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

export interface SearchResult {
  items: CollectionItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Valeurs possibles d'un champ à facettes (pour alimenter les listes déroulantes). */
export type FacetValues = Record<string, string[]>;
