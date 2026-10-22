import type { CollectionAdapter } from './adapter';
import { mockAdapter } from './mockAdapter';

/**
 * Point d'entrée unique vers le backend.
 * Pour brancher une vraie API : créer `httpAdapter.ts` qui implémente
 * `CollectionAdapter`, puis changer la ligne ci-dessous (ou lire une variable d'env).
 */
export const api: CollectionAdapter = mockAdapter;

export type { CollectionAdapter } from './adapter';
export * from './types';
export { extractImageInfo, withoutGps, type ImageInfo } from './imageInfo';
