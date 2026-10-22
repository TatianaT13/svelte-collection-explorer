<script lang="ts">
  /** Filtres actifs sous forme de puces supprimables, une puce par valeur. */
  import { filterFields } from '$lib/config/schema';
  import { labelOf } from '$lib/utils/labels';
  import { i18n } from '$lib/i18n/index.svelte';
  import type { ActiveFilters } from '$lib/api/types';

  let {
    filters,
    text = '',
    onremove,
    onclear
  }: { filters: ActiveFilters; text?: string; onremove: (key: string, value?: string) => void; onclear: () => void } = $props();

  interface Chip {
    id: string;
    key: string;
    value?: string;
    label: string;
    display: string;
  }

  const chips = $derived.by(() => {
    const out: Chip[] = [];
    if (text) out.push({ id: '__text', key: '__text', label: i18n.t('chips.search'), display: `« ${text} »` });
    for (const f of filterFields) {
      const v = filters[f.key];
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) {
        for (const x of v) out.push({ id: `${f.key}:${x}`, key: f.key, value: x, label: i18n.l(f.label), display: labelOf(f, x) });
      } else {
        const d = labelOf(f, v);
        out.push({ id: f.key, key: f.key, label: i18n.l(f.label), display: f.kind === 'text' ? `« ${d} »` : d });
      }
    }
    return out;
  });
</script>

{#if chips.length}
  <div class="chips" role="list" aria-label={i18n.t('chips.active')}>
    {#each chips as chip (chip.id)}
      <span class="chip" role="listitem">
        <span class="k">{chip.label}</span>
        <span class="v">{chip.display}</span>
        <button type="button" aria-label={i18n.t('chips.remove', { label: chip.label, value: chip.display })} onclick={() => onremove(chip.key, chip.value)}>×</button>
      </span>
    {/each}
    {#if chips.length > 1}
      <button type="button" class="clear" onclick={onclear}>{i18n.t('chips.clearAll')}</button>
    {/if}
  </div>
{/if}

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.9rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.3rem 0.25rem 0.6rem;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--fg);
    font-size: 0.8rem;
    line-height: 1.2;
  }
  .k {
    color: var(--muted);
  }
  .k::after {
    content: ' :';
  }
  .v {
    font-weight: 500;
  }
  .chip button {
    display: grid;
    place-items: center;
    width: 1.3rem;
    height: 1.3rem;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 0.95rem;
    line-height: 1;
  }
  .chip button:hover {
    background: color-mix(in srgb, var(--fg) 10%, transparent);
    color: var(--fg);
  }
  .clear {
    border: none;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .clear:hover {
    color: var(--fg);
  }
</style>
