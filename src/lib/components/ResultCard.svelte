<script lang="ts">
  import type { ActiveFilters, CollectionItem } from '$lib/api/types';
  import { cardFields } from '$lib/config/schema';
  import { compare } from '$lib/stores/compare.svelte';
  import AttributeList from './AttributeList.svelte';
  import { i18n } from '$lib/i18n/index.svelte';
  import { riskFor } from '$lib/config/risk';
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
  const risks = $derived(riskFor(item));
</script>

<article class="card" class:selected>
  <button type="button" class="media" onclick={() => onopen?.(item)} aria-label={i18n.t('card.open', { title: item.title })}>
    <img src={item.thumbnailUrl ?? item.imageUrl} alt="" loading="lazy" />
    {#if item.score !== undefined}
      <span class="score"><ScoreRing score={item.score} size={40} /></span>
    {/if}
    {#if risks.length}
      <span class="risk" class:emergency={risks.some((r) => r.emergency)} title={risks.map((r) => i18n.l(r.label)).join(' · ')}>{i18n.t('risk.badge')}</span>
    {/if}
  </button>

  <div class="body">
    <h3>
      <button type="button" class="title" onclick={() => onopen?.(item)}>{item.title}</button>
    </h3>
    <AttributeList fields={cardFields} {item} {filters} {onfilter} compact />
    <button type="button" class="cmp" class:active={selected} {disabled} aria-pressed={selected} onclick={() => compare.toggle(item)} title={disabled ? i18n.t('card.max', { n: compare.max }) : ''}>
      <span class="ico" aria-hidden="true">
        {#if selected}
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        {:else}
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M4 7h16"/><path d="M7 7 4 14a3 3 0 0 0 6 0L7 7zM17 7l-3 7a3 3 0 0 0 6 0l-3-7z"/></svg>
        {/if}
      </span>
      <span class="txt">{selected ? i18n.t('card.selected') : i18n.t('card.compare')}</span>
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
    border-color: var(--compare);
    box-shadow: 0 0 0 2px var(--compare), 0 8px 24px rgb(0 0 0 / 0.08);
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
  .risk {
    position: absolute;
    left: 0.5rem;
    top: 0.5rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: #b45309;
    color: #fff;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .risk.emergency {
    background: #b42318;
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
  /* Bouton de sélection : pilule, icône balance, couleur propre à la comparaison. */
  .cmp {
    margin-top: auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    padding: 0.45rem 0.9rem 0.45rem 0.6rem;
    border: 1.5px dashed color-mix(in srgb, var(--fg) 28%, transparent);
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 500;
    letter-spacing: 0.01em;
    transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.12s ease;
  }
  .cmp .ico {
    display: grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--fg);
    transition: background 0.18s ease, color 0.18s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .cmp:hover:not(:disabled) {
    border-style: solid;
    border-color: var(--compare);
    color: var(--compare);
  }
  .cmp:hover:not(:disabled) .ico {
    background: var(--compare-soft);
    color: var(--compare);
    transform: rotate(-8deg);
  }
  .cmp:active:not(:disabled) {
    transform: scale(0.97);
  }
  .cmp.active,
  .cmp.active:hover:not(:disabled) {
    border-style: solid;
    border-color: var(--compare);
    background: var(--compare-soft);
    color: var(--compare);
  }
  .cmp.active .ico {
    background: var(--compare);
    color: var(--compare-ink);
    transform: none;
  }
  .cmp.active:hover:not(:disabled) .ico {
    background: var(--compare-hover);
    transform: none;
  }
  .cmp:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
