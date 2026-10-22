import type { CollectionItem, SearchQuery } from './types';
import { schema } from '$lib/config/schema';
import { countryName } from '$lib/config/countries';
import { termLabel } from '$lib/config/vocabularies';

/**
 * Filtrage et recherche texte côté client, partagés par les adapters locaux.
 * Pur et testable : aucune dépendance au DOM.
 */

/** Un filtre correspond si la valeur de l'objet (scalaire ou tableau) contient une des valeurs demandées. */
export function matchesFilters(item: CollectionItem, filters: SearchQuery['filters']): boolean {
  return Object.entries(filters).every(([key, wanted]) => {
    if (wanted === null || wanted === undefined || wanted === '') return true;
    if (Array.isArray(wanted) && wanted.length === 0) return true;
    const field = schema.fields.find((f) => f.key === key);
    const actual = item.metadata[key];
    const actualList = Array.isArray(actual) ? actual.map(String) : [String(actual ?? '')];
    const wantedList = Array.isArray(wanted) ? wanted.map(String) : [String(wanted)];

    if (field?.kind === 'text' || field?.kind === 'longtext') {
      return actualList.join(' ').toLowerCase().includes(wantedList[0].toLowerCase());
    }
    if (field?.kind === 'number') return Number(actual) >= Number(wanted);
    return wantedList.some((w) => actualList.some((a) => a.toLowerCase() === w.toLowerCase()));
  });
}

/** Texte cherchable : titre, libellés traduits et valeurs brutes. */
export function searchableText(item: CollectionItem, locale: string): string {
  const parts: string[] = [item.title];
  for (const f of schema.fields) {
    const v = item.metadata[f.key];
    if (v === null || v === undefined) continue;
    const list = Array.isArray(v) ? v : [v];
    for (const x of list) {
      const s = String(x);
      parts.push(s);
      if (f.kind === 'country') parts.push(countryName(s, locale));
      if (f.kind === 'vocab' && f.vocabulary) parts.push(termLabel(f.vocabulary, s, locale));
    }
  }
  return parts.join(' ').toLowerCase();
}

export function matchesText(item: CollectionItem, text: string | undefined, locale: string): boolean {
  if (!text) return true;
  return searchableText(item, locale).includes(text.toLowerCase());
}

export function paginate<T>(list: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return list.slice(start, start + pageSize);
}
