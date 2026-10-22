<script lang="ts">
  /** Volet latéral de détail : toutes les métadonnées, sans quitter la page. */
  import { fade, fly } from 'svelte/transition';
  import { fieldGroups } from '$lib/config/schema';
  import { compare } from '$lib/stores/compare.svelte';
  import { flagEmoji } from '$lib/utils/flag';
  import type { ActiveFilters, CollectionItem } from '$lib/api/types';
  import AttributeList from './AttributeList.svelte';
  import ScoreRing from './ScoreRing.svelte';

  let {
    item,
    onclose,
    filters,
    onfilter
  }: {
    item: CollectionItem | null;
    onclose: () => void;
    filters?: ActiveFilters;
    onfilter?: (key: string, value: string) => void;
  } = $props();

  let closeBtn = $state<HTMLButtonElement | null>(null);

  $effect(() => {
    if (!item) return;
    closeBtn?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  });

  const selected = $derived(item ? compare.has(item.id) : false);
  const origin = $derived(item ? String(item.metadata.origin ?? '') : '');
</script>

{#if item}
  <div class="backdrop" transition:fade={{ duration: 150 }} onclick={onclose} aria-hidden="true"></div>
  <div class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" transition:fly={{ x: 40, duration: 200 }}>
    <header>
      <div>
        <h2 id="drawer-title">{item.title}</h2>
        <p class="sub">
          {#if origin}<span class="flag" aria-hidden="true">{flagEmoji(origin)}</span>{/if}
          <span class="mono">{item.metadata.inventory ?? item.id}</span>
        </p>
      </div>
      <button bind:this={closeBtn} type="button" class="close" aria-label="Fermer" onclick={onclose}>×</button>
    </header>

    <div class="scroll">
      <figure>
        <img src={item.imageUrl} alt={item.title} />
        {#if item.score !== undefined}
          <figcaption><ScoreRing score={item.score} size={40} /> <span>Similarité avec l'image envoyée</span></figcaption>
        {/if}
      </figure>

      {#if onfilter}
        <p class="tip">Cochez un attribut pour ne garder que les objets qui le partagent.</p>
      {/if}

      {#each fieldGroups as group (group.name)}
        <section>
          {#if group.name}<h3>{group.name}</h3>{/if}
          <AttributeList fields={group.fields} {item} {filters} {onfilter} />
        </section>
      {/each}
    </div>

    <footer>
      <button type="button" class="primary" class:active={selected} disabled={!selected && compare.isFull} onclick={() => item && compare.toggle(item)}>
        {selected ? 'Retirer de la comparaison' : 'Ajouter à la comparaison'}
      </button>
    </footer>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgb(0 0 0 / 0.35);
  }
  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 41;
    width: min(520px, 100vw);
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-left: 1px solid var(--border);
    box-shadow: -12px 0 40px rgb(0 0 0 / 0.2);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem 1.1rem 0.8rem;
    border-bottom: 1px solid var(--border);
  }
  h2 {
    margin: 0;
    font-size: 1.05rem;
  }
  .sub {
    margin: 0.2rem 0 0;
    font-size: 0.8rem;
    color: var(--muted);
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
  }
  .close {
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: 8px;
    background: var(--surface-2);
    color: var(--fg);
    font-size: 1.2rem;
    cursor: pointer;
  }
  .scroll {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 1.1rem;
  }
  figure {
    margin: 0 0 1rem;
  }
  figure img {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    border-radius: 10px;
    background: var(--surface-2);
  }
  figcaption {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.6rem;
    font-size: 0.8rem;
    color: var(--muted);
  }
  section + section {
    margin-top: 1rem;
  }
  .tip {
    margin: 0 0 0.9rem;
    padding: 0.5rem 0.65rem;
    border-radius: 8px;
    background: var(--accent-soft);
    font-size: 0.8rem;
    color: var(--fg);
  }
  h3 {
    margin: 0 0 0.4rem;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  footer {
    padding: 0.8rem 1.1rem;
    border-top: 1px solid var(--border);
  }
  .primary {
    width: 100%;
    padding: 0.65rem;
    border: 1px solid var(--accent);
    border-radius: 9px;
    background: var(--accent);
    color: #fff;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .primary.active {
    background: transparent;
    color: var(--accent);
  }
  .primary:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
