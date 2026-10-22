import { browser } from '$app/environment';
import { untrack } from 'svelte';
import type { ImageInfo } from '$lib/api/imageInfo';

/**
 * Dernière recherche par image, conservée en session pour figurer dans
 * l'export du dossier sur la page Comparer (sans l'image elle-même).
 */
export type Decision = 'hold' | 'release' | 'expert';

export interface QueryRecord {
  fileName: string;
  sizeBytes: number;
  sha256?: string;
  takenAt?: string;
  camera?: string;
  cropped: boolean;
  at: string;
  decision?: Decision;
  decidedAt?: string;
  /** Lecture agrégée au moment de la décision (origines, identification). */
  summary?: { origins: { code: string; share: number }[]; category?: string; period?: string; risk?: string[] };
}

const KEY = 'last-query';

function persist(next: QueryRecord | null) {
  if (!browser) return;
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible */
  }
}

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
    /**
     * Nouvelle photo de référence. On construit un objet simple, on le sérialise, puis on
     * l'affecte à l'état : lire `record` ici créerait une dépendance réactive dans l'effet
     * appelant, et toute décision ultérieure relancerait cet effet et l'écraserait.
     */
    set(info: ImageInfo, cropped: boolean) {
      const next: QueryRecord = {
        fileName: info.fileName,
        sizeBytes: info.sizeBytes,
        sha256: info.sha256,
        takenAt: info.takenAt?.toISOString(),
        camera: info.camera,
        cropped,
        at: new Date().toISOString()
      };
      persist(next);
      record = next;
    },
    decide(decision: Decision | null, summary?: QueryRecord['summary']) {
      const current = untrack(() => record);
      if (!current) return;
      const next: QueryRecord = {
        ...current,
        decision: decision ?? undefined,
        decidedAt: decision ? new Date().toISOString() : undefined,
        summary: summary ?? current.summary
      };
      persist(next);
      record = next;
    },
    clear() {
      persist(null);
      record = null;
    }
  };
}

export const lastQuery = createQueryStore();
