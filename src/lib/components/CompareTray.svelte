<script lang="ts">
  /** Barre flottante : objets sélectionnés pour comparaison, accès direct à la page Comparer. */
  import { fly } from 'svelte/transition';
  import { compare } from '$lib/stores/compare.svelte';
</script>

{#if compare.count > 0}
  <div class="tray" transition:fly={{ y: 24, duration: 180 }} role="region" aria-label="Sélection pour comparaison">
    <ul class="thumbs">
      {#each compare.items as item (item.id)}
        <li>
          <img src={item.thumbnailUrl ?? item.imageUrl} alt="" />
          <button type="button" class="rm" aria-label="Retirer {item.title}" onclick={() => compare.remove(item.id)}>×</button>
        </li>
      {/each}
      {#each Array(compare.max - compare.count) as _, i (i)}
        <li class="slot" aria-hidden="true"></li>
      {/each}
    </ul>
    <div class="actions">
      <span class="count">{compare.count} / {compare.max}</span>
      <button type="button" class="ghost" onclick={() => compare.clear()}>Vider</button>
      <a class="primary" href="/compare" aria-disabled={compare.count < 2} class:disabled={compare.count < 2}>
        Comparer
      </a>
    </div>
  </div>
{/if}

<style>
  .tray {
    position: fixed;
    left: 50%;
    bottom: 1rem;
    transform: translateX(-50%);
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 0.6rem 0.5rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.18);
    max-width: calc(100vw - 2rem);
  }
  .thumbs {
    display: flex;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .thumbs li {
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: 8px;
    overflow: hidden;
    background: var(--surface-2);
  }
  .thumbs li.slot {
    border: 1.5px dashed var(--border);
    background: transparent;
  }
  .thumbs img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .rm {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 50%;
    background: rgb(0 0 0 / 0.6);
    color: #fff;
    font-size: 0.8rem;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.12s;
  }
  .thumbs li:hover .rm,
  .rm:focus-visible {
    opacity: 1;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .count {
    font-size: 0.8rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .ghost {
    border: none;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0.4rem 0.5rem;
    border-radius: 8px;
  }
  .ghost:hover {
    background: var(--surface-2);
    color: var(--fg);
  }
  .primary {
    padding: 0.5rem 0.9rem;
    border-radius: 9px;
    background: var(--accent);
    color: #fff;
    font-size: 0.85rem;
    font-weight: 600;
    text-decoration: none;
  }
  .primary:hover {
    background: var(--accent-hover);
  }
  .primary.disabled {
    opacity: 0.45;
    pointer-events: none;
  }
  @media (max-width: 520px) {
    .thumbs li.slot { display: none; }
  }
</style>
