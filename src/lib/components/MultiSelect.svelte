<script lang="ts">
  /**
   * Sélecteur multiple en accordéon : recherche interne, cases à cocher,
   * valeurs choisies rappelées en puces supprimables. Logique "OU" entre les valeurs.
   */
  import type { TermOption } from '$lib/config/vocabularies';
  import { i18n } from '$lib/i18n/index.svelte';

  let {
    label,
    options,
    selected = $bindable<string[]>([]),
    onchange,
    searchable = options.length > 8
  }: {
    label: string;
    options: TermOption[];
    selected?: string[];
    onchange?: (values: string[]) => void;
    searchable?: boolean;
  } = $props();

  let open = $state(false);
  let query = $state('');
  let searchEl = $state<HTMLInputElement | null>(null);

  // Les options hiérarchiques sont indentées par des espaces insécables : on les retire dans les puces.
  const nameOf = (code: string) => (options.find((o) => o.code === code)?.name ?? code).replace(/^[\u00a0\s]+/, '');

  const visible = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
  });

  const summary = $derived(
    selected.length === 0 ? i18n.t('filters.all') : selected.length === 1 ? nameOf(selected[0]) : i18n.t('filters.selected', { n: selected.length })
  );

  function emit(next: string[]) {
    selected = next;
    onchange?.(next);
  }

  function toggle(code: string) {
    emit(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  }

  function toggleOpen() {
    open = !open;
    if (open) queueMicrotask(() => searchEl?.focus());
    else query = '';
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      open = false;
      query = '';
    }
  }
</script>

<div class="ms" class:open class:active={selected.length > 0}>
  <button type="button" class="head" aria-expanded={open} onclick={toggleOpen}>
    <span class="label">
      {label}
      {#if selected.length}<span class="count">{selected.length}</span>{/if}
    </span>
    <span class="summary">{summary}</span>
    <svg class="chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
  </button>

  {#if selected.length && !open}
    <div class="chips">
      {#each selected as code (code)}
        <span class="chip">
          {nameOf(code)}
          <button type="button" aria-label={i18n.t('chips.remove', { label: '', value: nameOf(code) })} onclick={() => toggle(code)}>×</button>
        </span>
      {/each}
    </div>
  {/if}

  {#if open}
    <div class="panel">
      {#if searchable}
        <input bind:this={searchEl} type="search" bind:value={query} placeholder={i18n.t('filters.filterList')} aria-label={i18n.t('filters.filterLabel', { label })} onkeydown={onKey} />
      {/if}
      {#if selected.length}
        <div class="chips in-panel">
          {#each selected as code (code)}
            <span class="chip">
              {nameOf(code)}
              <button type="button" aria-label={i18n.t('chips.remove', { label: '', value: nameOf(code) })} onclick={() => toggle(code)}>×</button>
            </span>
          {/each}
          <button type="button" class="link" onclick={() => emit([])}>{i18n.t('filters.clear')}</button>
        </div>
      {/if}
      <ul>
        {#each visible as o (o.code)}
          <li>
            <label>
              <input type="checkbox" checked={selected.includes(o.code)} onchange={() => toggle(o.code)} onkeydown={onKey} />
              <span>{o.name}</span>
            </label>
          </li>
        {:else}
          <li class="none">{i18n.t('filters.noOption')}</li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  .ms {
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    overflow: hidden;
    transition: border-color 0.12s;
  }
  .ms.active {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  }
  .ms.open {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .head {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.55rem 0.65rem;
    border: none;
    background: none;
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .head:hover {
    background: var(--surface-2);
  }
  .label {
    font-size: 0.85rem;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .count {
    min-width: 1.3em;
    padding: 0 0.35em;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-size: 0.7rem;
    font-weight: 600;
    text-align: center;
  }
  .summary {
    font-size: 0.85rem;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chev {
    color: var(--muted);
    transition: transform 0.15s;
  }
  .open .chev {
    transform: rotate(180deg);
  }
  .panel {
    border-top: 1px solid var(--border);
    padding: 0.5rem;
  }
  .panel input[type='search'] {
    width: 100%;
    padding: 0.4rem 0.55rem;
    margin-bottom: 0.45rem;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 0.85rem;
  }
  .panel input[type='search']:focus {
    outline: none;
    border-color: var(--accent);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 220px;
    overflow-y: auto;
  }
  li label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0.35rem;
    border-radius: 6px;
    font-size: 0.86rem;
    cursor: pointer;
  }
  li label:hover {
    background: var(--surface-2);
  }
  li input {
    accent-color: var(--accent);
    margin: 0;
  }
  li.none {
    padding: 0.5rem;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    padding: 0 0.6rem 0.55rem;
  }
  .chips.in-panel {
    padding: 0 0 0.5rem;
    margin-bottom: 0.35rem;
    border-bottom: 1px solid var(--border);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.15rem 0.2rem 0.15rem 0.5rem;
    border-radius: 999px;
    background: var(--accent-soft);
    font-size: 0.78rem;
  }
  .chip button {
    width: 1.2rem;
    height: 1.2rem;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 0.9rem;
    line-height: 1;
  }
  .chip button:hover {
    background: color-mix(in srgb, var(--fg) 10%, transparent);
    color: var(--fg);
  }
  .link {
    border: none;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
</style>
