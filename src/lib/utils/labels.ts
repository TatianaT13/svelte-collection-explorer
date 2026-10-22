import { schema, type FieldSchema } from '$lib/config/schema';
import { countryName } from '$lib/config/countries';
import { termLabel } from '$lib/config/vocabularies';
import type { MetadataValue } from '$lib/api/types';

/** Libellé lisible d'une valeur scalaire selon le type de champ. */
export function labelOf(field: FieldSchema, v: string | number | boolean): string {
  const s = String(v);
  if (field.kind === 'country') return countryName(s, schema.locale);
  if (field.kind === 'vocab' && field.vocabulary) return termLabel(field.vocabulary, s, schema.locale);
  if (field.kind === 'boolean') return v ? 'Oui' : 'Non';
  return s;
}

/** Libellé complet d'une valeur (tableaux, unités, vide). */
export function formatValue(field: FieldSchema, value: MetadataValue | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.map((x) => labelOf(field, x)).join(', ') : '—';
  const s = labelOf(field, value);
  return field.unit ? `${s} ${field.unit}` : s;
}
