import type { CollectionItem, FacetValues, SearchQuery, SearchResult } from './types';

/**
 * Contrat que tout backend doit respecter.
 * Le reste de l'application ne connaît que cette interface :
 * changer de backend = fournir une autre implémentation.
 */
export interface CollectionAdapter {
  search(query: SearchQuery): Promise<SearchResult>;
  getItem(id: string): Promise<CollectionItem | null>;
  getFacets(): Promise<FacetValues>;
}
