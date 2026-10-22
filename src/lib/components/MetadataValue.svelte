<script lang="ts">
  import { schema, type FieldSchema } from '$lib/config/schema';
  import { countryName } from '$lib/config/countries';
  import { termLabel } from '$lib/config/vocabularies';
  import type { MetadataValue } from '$lib/api/types';

  let { field, value }: { field: FieldSchema; value: MetadataValue | undefined } = $props();

  function labelOf(v: string | number | boolean): string {
    const s = String(v);
    if (field.kind === 'country') return countryName(s, schema.locale);
    if (field.kind === 'vocab' && field.vocabulary) return termLabel(field.vocabulary, s, schema.locale);
    return s;
  }

  const display = $derived.by(() => {
    if (value === null || value === undefined || value === '') return '—';
    if (field.kind === 'boolean') return value ? 'Oui' : 'Non';
    if (Array.isArray(value)) return value.length ? value.map(labelOf).join(', ') : '—';
    const s = labelOf(value);
    return field.unit ? `${s} ${field.unit}` : s;
  });
</script>

<span class="value" class:long={field.kind === 'longtext'}>{display}</span>

<style>
  .value {
    color: var(--fg);
  }
  .long {
    white-space: pre-wrap;
    line-height: 1.45;
  }
</style>
