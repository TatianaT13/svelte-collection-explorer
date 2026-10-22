import { browser } from '$app/environment';
import type { CollectionItem } from '$lib/api/types';

/**
 * État partagé de la sélection pour comparaison.
 * Svelte 5 : un objet avec des champs `$state` exporté depuis un module .svelte.ts
 * est réactif partout où il est importé.
 * La sélection est conservée dans sessionStorage pour survivre à un rechargement.
 */
const MAX = 4;
const STORAGE_KEY = 'compare-selection';

function load(): CollectionItem[] {
  if (!browser) return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CollectionItem[]) : [];
  } catch {
    return [];
  }
}

function save(items: CollectionItem[]) {
  if (!browser) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* stockage indisponible : on continue en mémoire */
  }
}

function createCompareStore() {
  let items = $state<CollectionItem[]>(load());

  function set(next: CollectionItem[]) {
    items = next;
    save(next);
  }

  return {
    get items() {
      return items;
    },
    get count() {
      return items.length;
    },
    get isFull() {
      return items.length >= MAX;
    },
    max: MAX,
    has(id: string) {
      return items.some((it) => it.id === id);
    },
    toggle(item: CollectionItem) {
      if (this.has(item.id)) {
        set(items.filter((it) => it.id !== item.id));
      } else if (items.length < MAX) {
        set([...items, item]);
      }
    },
    remove(id: string) {
      set(items.filter((it) => it.id !== id));
    },
    clear() {
      set([]);
    }
  };
}

export const compare = createCompareStore();
