<script lang="ts">
  /**
   * Panneau de filtres généré à partir du schéma.
   * - 'country' et 'vocab' : listes complètes, locales au front.
   * - 'select' : options fournies par le backend (facettes).
   * - autres : champ libre.
   */
  import { filterFields, schema, type FieldSchema } from '$lib/config/schema';
  import { countryOptions } from '$lib/config/countries';
  import { vocabOptions, type TermOption } from '$lib/config/vocabularies';
  import type { ActiveFilters, FacetValues } from '$lib/api/types';

  let {
    facets,
    filters = $bindable<ActiveFilters>({}),
    onchange
  }: { facets: FacetValues; filters?: ActiveFilters; onchange?: (f: ActiveFilters) => void } = $props();

  const activeCount = $derived(Object.values(filters).filter((v) => v !== '' && v !== null && v !== undefined).length);

  function optionsFor(field: FieldSchema): TermOption[] {
    if (field.kind === 'country') return countryOptions(schema.locale);
    if (field.kind === 'vocab' && field.vocabulary) return vocabOptions(field.vocabulary, schema.locale);
    return (facets[field.key] ?? []).map((v) => ({ code: v, name: v }));
  }

  function update(key: string, value: string) {
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
    <h2>Filtres {#if activeCount}<span class="badge">{activeCount}</span>{/if}</h2>
    {#if activeCount}
      <button type="button" class="link" onclick={reset}>Réinitialiser</button>
    {/if}
  </header>

  {#each filterFields as field (field.key)}
    <label>
      <span>{field.label}</span>
      {#if field.kind === 'country' || field.kind === 'vocab' || field.kind === 'select'}
        <select value={String(filters[field.key] ?? '')} onchange={(e) => update(field.key, e.currentTarget.value)}>
          <option value="">Tous</option>
          {#each optionsFor(field) as opt (opt.code)}
            <option value={opt.code}>{opt.name}</option>
          {/each}
        </select>
      {:else}
        <input
          type={field.kind === 'number' ? 'number' : 'text'}
          placeholder={field.kind === 'text' ? 'Contient…' : ''}
          value={String(filters[field.key] ?? '')}
          oninput={(e) => update(field.key, e.currentTarget.value)}
        />
      {/if}
    </label>
  {/each}
</aside>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
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
  select,
  input {
    padding: 0.45rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--fg);
    font: inherit;
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
