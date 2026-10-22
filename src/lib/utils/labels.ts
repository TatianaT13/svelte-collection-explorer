import type { FieldSchema } from '$lib/config/schema';
import { countryName } from '$lib/config/countries';
import { termLabel } from '$lib/config/vocabularies';
import { i18n } from '$lib/i18n/index.svelte';
import { places } from '$lib/stores/places.svelte';
import type { MetadataValue } from '$lib/api/types';

/** Libellé lisible d'une valeur scalaire selon le type de champ, dans la langue courante. */
export function labelOf(field: FieldSchema, v: string | number | boolean): string {
  const s = String(v);
  if (field.kind === 'country') return countryName(s, i18n.locale);
  if (field.kind === 'place') return places.label(s, i18n.locale);
  if (field.kind === 'vocab' && field.vocabulary) return termLabel(field.vocabulary, s, i18n.locale);
  if (field.kind === 'boolean') return v ? i18n.t('value.yes') : i18n.t('value.no');
  return s;
}

/** Libellé complet d'une valeur (tableaux, unités, vide). */
export function formatValue(field: FieldSchema, value: MetadataValue | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.map((x) => labelOf(field, x)).join(', ') : '—';
  const s = labelOf(field, value);
  return field.unit ? `${s} ${field.unit}` : s;
}

/** Libellé d'un champ dans la langue courante. */
export function fieldLabel(field: FieldSchema): string {
  return i18n.l(field.label);
}
