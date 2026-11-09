import type { CollectionItem, FacetValues, SearchQuery, SearchResult } from './types';
import type { ImageInfo } from './imageInfo';

/** Accusé d'archivage d'une image originale. */
export interface ArchiveReceipt {
  /** Identifiant côté serveur, à rattacher à un cas ou un rapport. */
  id: string;
  /** Empreinte vérifiée côté serveur (doit égaler `ImageInfo.sha256`). */
  sha256?: string;
}

/** Ce que l'on sait de la base interrogée : recopié dans le dossier exporté pour qu'un résultat soit rejouable. */
export interface CollectionInfo {
  /** Modèle avec lequel les vecteurs de la base ont été calculés. */
  model: string;
  dim?: number;
  count: number;
  /** Date de construction de la base. */
  generatedAt?: string;
  source?: string;
  /** Où la recherche s'exécute. */
  engine: 'browser' | 'service' | 'mock';
  /** Type d'index côté service (hnswlib…). */
  index?: string;
}

/**
 * Contrat que tout backend doit respecter.
 * Le reste de l'application ne connaît que cette interface :
 * changer de backend = fournir une autre implémentation.
 */
export interface CollectionAdapter {
  /** Recherche texte / image / filtres. Reçoit la version réduite de l'image. */
  search(query: SearchQuery): Promise<SearchResult>;
  getItem(id: string): Promise<CollectionItem | null>;
  getFacets(): Promise<FacetValues>;
  /** Description de la base (modèle, taille, date) pour la traçabilité des dossiers. */
  info(): Promise<CollectionInfo>;
  /**
   * Archive l'image **originale**, non réduite, avec ses métadonnées.
   * Destiné à l'enregistrement d'un cas ou d'un rapport, pas à la recherche.
   */
  archiveImage(original: File, info?: ImageInfo): Promise<ArchiveReceipt>;
}
