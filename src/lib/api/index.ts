import type { CollectionAdapter } from './adapter';
import { localAdapter } from './localAdapter';
import { mockAdapter } from './mockAdapter';

/**
 * Point d'entrée unique vers le backend.
 * - par défaut : adapter local (jeu de données du Met + recherche par image dans le navigateur) ;
 * - VITE_ADAPTER=mock : données générées, sans modèle ;
 * - pour une vraie API : créer `httpAdapter.ts` et l'ajouter ici.
 */
const which = import.meta.env.VITE_ADAPTER ?? 'local';
export const api: CollectionAdapter = which === 'mock' ? mockAdapter : localAdapter;

export type { CollectionAdapter, ArchiveReceipt } from './adapter';
export * from './types';
export { extractImageInfo, withoutGps, type ImageInfo } from './imageInfo';
