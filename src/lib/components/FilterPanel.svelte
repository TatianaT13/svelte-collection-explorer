<script lang="ts">
  /**
   * Panneau de filtres généré à partir du schéma.
   * - 'country', 'vocab', 'select' : sélection multiple (OU entre les valeurs).
   * - 'text' : champ "contient".
   * - 'number' : minimum.
   * Les filtres sont combinés en ET.
   */
  import { filterFields, type FieldSchema } from '$lib/config/schema';
  import { countryOptions } from '$lib/config/countries';
  import { vocabOptions, type TermOption } from '$lib/config/vocabularies';
  import { i18n } from '$lib/i18n/index.svelte';
  import type { ActiveFilters, FacetValues, MetadataValue } from '$lib/api/types';
  import MultiSelect from './MultiSelect.svelte';

  let {
    facets,
    filters = $bindable<ActiveFilters>({}),
    onchange
  }: { facets: FacetValues; filters?: ActiveFilters; onchange?: (f: ActiveFilters) => void } = $props();

  const isSet = (v: MetadataValue | undefined) => Array.isArray(v) ? v.length > 0 : v !== '' && v !== null && v !== undefined;
  const activeCount = $derived(Object.values(filters).filter(isSet).length);

  function optionsFor(field: FieldSchema): TermOption[] {
    if (field.kind === 'country') return countryOptions(i18n.locale);
    if (field.kind === 'vocab' && field.vocabulary) return vocabOptions(field.vocabulary, i18n.locale);
    return (facets[field.key] ?? []).map((v) => ({ code: v, name: v }));
  }

  function asArray(v: MetadataValue | undefined): string[] {
    if (Array.isArray(v)) return v;
    if (v === '' || v === null || v === undefined) return [];
    return [String(v)];
  }

  function update(key: string, value: string | string[]) {
    filters = { ...filters, [key]: value };
    onchange?.(filters);
  }

  function reset() {
    filters = {};
    onchange?.(filters);
  }
</script>

<aside class="panel">
  <header>
    <h2>{i18n.t('filters.title')} {#if activeCount}<span class="badge">{activeCount}</span>{/if}</h2>
    {#if activeCount}
      <button type="button" class="link" onclick={reset}>{i18n.t('filters.reset')}</button>
    {/if}
  </header>

  {#each filterFields as field (field.key)}
    {#if field.kind === 'country' || field.kind === 'vocab' || field.kind === 'select'}
      <MultiSelect label={i18n.l(field.label)} options={optionsFor(field)} selected={asArray(filters[field.key])} onchange={(v) => update(field.key, v)} />
    {:else}
      <label>
        <span>{i18n.l(field.label)}</span>
        <input
          type={field.kind === 'number' ? 'number' : 'text'}
          placeholder={field.kind === 'text' ? i18n.t('filters.contains') : ''}
          value={String(filters[field.key] ?? '')}
          oninput={(e) => update(field.key, e.currentTarget.value)}
        />
      </label>
    {/if}
  {/each}
</aside>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.2rem;
  }
  h2 {
    font-size: 1rem;
    margin: 0;
  }
  .badge {
    display: inline-block;
    min-width: 1.4em;
    padding: 0 0.4em;
    margin-left: 0.3em;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-size: 0.75rem;
    text-align: center;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
  input {
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--fg);
    font: inherit;
  }
  input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .link {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0;
  }
</style>
