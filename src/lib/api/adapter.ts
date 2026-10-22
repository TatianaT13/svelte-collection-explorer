import type { CollectionItem, FacetValues, SearchQuery, SearchResult } from './types';
import type { ImageInfo } from './imageInfo';

/** Accusé d'archivage d'une image originale. */
export interface ArchiveReceipt {
  /** Identifiant côté serveur, à rattacher à un cas ou un rapport. */
  id: string;
  /** Empreinte vérifiée côté serveur (doit égaler `ImageInfo.sha256`). */
  sha256?: string;
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
  /**
   * Archive l'image **originale**, non réduite, avec ses métadonnées.
   * Destiné à l'enregistrement d'un cas ou d'un rapport, pas à la recherche.
   */
  archiveImage(original: File, info?: ImageInfo): Promise<ArchiveReceipt>;
}
