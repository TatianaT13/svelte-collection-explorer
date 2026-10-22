import { browser } from '$app/environment';
import type { ImageInfo } from '$lib/api/imageInfo';

/**
 * Dernière recherche par image, conservée en session pour figurer dans
 * l'export du dossier sur la page Comparer (sans l'image elle-même).
 */
export interface QueryRecord {
  fileName: string;
  sizeBytes: number;
  sha256?: string;
  takenAt?: string;
  camera?: string;
  cropped: boolean;
  at: string;
}

const KEY = 'last-query';

function createQueryStore() {
  let record = $state<QueryRecord | null>(load());

  function load(): QueryRecord | null {
    if (!browser) return null;
    try {
      const raw = sessionStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as QueryRecord) : null;
    } catch {
      return null;
    }
  }

  return {
    get record() {
      return record;
    },
    set(info: ImageInfo, cropped: boolean) {
      record = {
        fileName: info.fileName,
        sizeBytes: info.sizeBytes,
        sha256: info.sha256,
        takenAt: info.takenAt?.toISOString(),
        camera: info.camera,
        cropped,
        at: new Date().toISOString()
      };
      try {
        sessionStorage.setItem(KEY, JSON.stringify(record));
      } catch {
        /* ignore */
      }
    },
    clear() {
      record = null;
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
    }
  };
}

export const lastQuery = createQueryStore();
