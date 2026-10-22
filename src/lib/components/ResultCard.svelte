<script lang="ts">
  import type { CollectionItem } from '$lib/api/types';
  import { cardFields } from '$lib/config/schema';
  import { compare } from '$lib/stores/compare.svelte';
  import MetadataValue from './MetadataValue.svelte';

  let { item }: { item: CollectionItem } = $props();

  const selected = $derived(compare.has(item.id));
  const disabled = $derived(!selected && compare.isFull);
</script>

<article class="card" class:selected>
  <img src={item.thumbnailUrl ?? item.imageUrl} alt={item.title} loading="lazy" />
  {#if item.score !== undefined}
    <span class="score" title="Similarité">{Math.round(item.score * 100)} %</span>
  {/if}
  <div class="body">
    <h3>{item.title}</h3>
    <dl>
      {#each cardFields as field (field.key)}
        <dt>{field.label}</dt>
        <dd><MetadataValue {field} value={item.metadata[field.key]} /></dd>
      {/each}
    </dl>
    <button type="button" class:active={selected} {disabled} onclick={() => compare.toggle(item)}>
      {selected ? 'Retirer de la comparaison' : 'Comparer'}
    </button>
  </div>
</article>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    background: var(--surface);
    transition: box-shadow 0.15s, border-color 0.15s;
  }
  .card:hover {
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.08);
  }
  .card.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent);
  }
  img {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    display: block;
  }
  .score {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.65);
    color: #fff;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .body {
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: 1;
  }
  h3 {
    margin: 0;
    font-size: 0.95rem;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.15rem 0.6rem;
    margin: 0;
    font-size: 0.8rem;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  button {
    margin-top: auto;
    padding: 0.45rem;
    border: 1px solid var(--accent);
    border-radius: 6px;
    background: transparent;
    color: var(--accent);
    cursor: pointer;
    font: inherit;
    font-size: 0.85rem;
  }
  button.active {
    background: var(--accent);
    color: #fff;
  }
  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
