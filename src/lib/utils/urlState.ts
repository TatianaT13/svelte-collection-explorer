import { filterFields } from '$lib/config/schema';
import type { ActiveFilters } from '$lib/api/types';

/**
 * Sérialise l'état de recherche dans l'URL (?q=…&origin=UA,RU&material=gold&p=2)
 * pour que les liens soient partageables et que le retour arrière fonctionne.
 * Les filtres à valeurs multiples sont joints par des virgules (les codes n'en contiennent pas).
 */
export interface SearchState {
  text: string;
  filters: ActiveFilters;
  page: number;
}

const isMulti = (kind: string) => kind === 'country' || kind === 'vocab' || kind === 'select' || kind === 'place';

export function readSearchState(params: URLSearchParams): SearchState {
  const filters: ActiveFilters = {};
  for (const f of filterFields) {
    const v = params.get(f.key);
    if (!v) continue;
    filters[f.key] = isMulti(f.kind) ? v.split(',').filter(Boolean) : v;
  }
  const p = Number(params.get('p') ?? 1);
  return { text: params.get('q') ?? '', filters, page: Number.isFinite(p) && p > 0 ? Math.floor(p) : 1 };
}

export function writeSearchState(base: URL, state: SearchState): URL {
  const url = new URL(base);
  url.search = '';
  if (state.text) url.searchParams.set('q', state.text);
  for (const f of filterFields) {
    const v = state.filters[f.key];
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length) url.searchParams.set(f.key, v.join(','));
    } else {
      url.searchParams.set(f.key, String(v));
    }
  }
  if (state.page > 1) url.searchParams.set('p', String(state.page));
  return url;
}
