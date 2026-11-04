import type { CollectionAdapter } from './adapter';
import { localAdapter } from './localAdapter';
import { mockAdapter } from './mockAdapter';
import { remoteAdapter } from './remoteAdapter';

/**
 * Point d'entrée unique vers le backend.
 * - par défaut : adapter local (jeu de données du Met + recherche par image dans le navigateur) ;
 * - VITE_ADAPTER=mock : données générées, sans modèle ;
 * - VITE_ADAPTER=remote : index HNSW dans un service séparé (service/main.py), inférence dans le navigateur.
 */
const which = import.meta.env.VITE_ADAPTER ?? 'local';
export const api: CollectionAdapter = which === 'mock' ? mockAdapter : which === 'remote' ? remoteAdapter : localAdapter;

export type { CollectionAdapter, ArchiveReceipt } from './adapter';
export * from './types';
export { extractImageInfo, withoutGps, type ImageInfo } from './imageInfo';
