<script lang="ts">
  import type { ActiveFilters, CollectionItem } from '$lib/api/types';
  import { cardFields } from '$lib/config/schema';
  import { compare } from '$lib/stores/compare.svelte';
  import AttributeList from './AttributeList.svelte';
  import ScoreRing from './ScoreRing.svelte';

  let {
    item,
    onopen,
    filters,
    onfilter
  }: {
    item: CollectionItem;
    onopen?: (item: CollectionItem) => void;
    filters?: ActiveFilters;
    onfilter?: (key: string, value: string) => void;
  } = $props();

  const selected = $derived(compare.has(item.id));
  const disabled = $derived(!selected && compare.isFull);
</script>

<article class="card" class:selected>
  <button type="button" class="media" onclick={() => onopen?.(item)} aria-label="Voir le détail de {item.title}">
    <img src={item.thumbnailUrl ?? item.imageUrl} alt="" loading="lazy" />
    {#if item.score !== undefined}
      <span class="score"><ScoreRing score={item.score} size={40} /></span>
    {/if}
  </button>

  <div class="body">
    <h3>
      <button type="button" class="title" onclick={() => onopen?.(item)}>{item.title}</button>
    </h3>
    <AttributeList fields={cardFields} {item} {filters} {onfilter} compact />
    <button type="button" class="cmp" class:active={selected} {disabled} onclick={() => compare.toggle(item)} title={disabled ? `Maximum ${compare.max} objets` : ''}>
      {#if selected}
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        Sélectionné
      {:else}
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Comparer
      {/if}
    </button>
  </div>
</article>

<style>
  .card {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    background: var(--surface);
    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s;
  }
  .card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.1);
  }
  .card.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent), 0 8px 24px rgb(0 0 0 / 0.08);
  }
  .media {
    position: relative;
    display: block;
    width: 100%;
    padding: 0;
    border: none;
    background: var(--surface-2);
    cursor: zoom-in;
    overflow: hidden;
  }
  .media img {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    display: block;
    transition: transform 0.3s ease;
  }
  .card:hover .media img {
    transform: scale(1.03);
  }
  .score {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    padding: 2px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--surface) 85%, transparent);
    backdrop-filter: blur(4px);
  }
  .body {
    padding: 0.8rem 0.85rem 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    flex: 1;
  }
  h3 {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.3;
  }
  .title {
    padding: 0;
    border: none;
    background: none;
    color: var(--fg);
    font: inherit;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }
  .title:hover {
    color: var(--accent);
  }
  .cmp {
    margin-top: auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: transparent;
    color: var(--fg);
    cursor: pointer;
    font: inherit;
    font-size: 0.83rem;
    font-weight: 500;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }
  .cmp:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }
  .cmp.active,
  .cmp.active:hover:not(:disabled) {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .cmp.active:hover:not(:disabled) {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }
  .cmp:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
