<script lang="ts">
  /**
   * Page Explorer : recherche texte + image + filtres, résultats paginés.
   * Toute la logique de données passe par `api` (couche adapter).
   */
  import { onMount } from 'svelte';
  import { api, extractImageInfo, withoutGps, type ActiveFilters, type FacetValues, type ImageInfo, type SearchResult } from '$lib/api';
  import { schema } from '$lib/config/schema';
  import ImageUpload from '$lib/components/ImageUpload.svelte';
  import FilterPanel from '$lib/components/FilterPanel.svelte';
  import ResultCard from '$lib/components/ResultCard.svelte';
  import ImageInfoPanel from '$lib/components/ImageInfoPanel.svelte';

  let text = $state('');
  let image = $state<File | null>(null);
  let imageInfo = $state<ImageInfo | null>(null);
  let includeGps = $state(true);
  let filters = $state<ActiveFilters>({});
  let page = $state(1);

  let facets = $state<FacetValues>({});
  let result = $state<SearchResult | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  const totalPages = $derived(result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1);

  let requestId = 0;
  async function runSearch() {
    const id = ++requestId;
    loading = true;
    error = null;
    try {
      const info = imageInfo ? (includeGps ? imageInfo : withoutGps(imageInfo)) : undefined;
      const res = await api.search({ text, image: image ?? undefined, imageInfo: info, filters, page, pageSize: schema.pageSize });
      if (id === requestId) result = res;
    } catch (e) {
      if (id === requestId) error = e instanceof Error ? e.message : 'Erreur inconnue';
    } finally {
      if (id === requestId) loading = false;
    }
  }

  // Relance la recherche dès qu'un critère change (page remise à 1 par les handlers).
  $effect(() => {
    // Lecture explicite des dépendances suivies.
    void text; void image; void imageInfo; void includeGps; void filters; void page;
    runSearch();
  });

  // Lit les métadonnées dès qu'une image est choisie.
  $effect(() => {
    const f = image;
    if (!f) {
      imageInfo = null;
      return;
    }
    let cancelled = false;
    extractImageInfo(f).then((info) => {
      if (!cancelled) imageInfo = info;
    });
    return () => {
      cancelled = true;
    };
  });

  onMount(async () => {
    facets = await api.getFacets();
  });

  function resetPage() {
    page = 1;
  }
</script>

<div class="layout">
  <aside class="sidebar">
    <ImageUpload bind:file={image} onchange={resetPage} />
    {#if imageInfo}
      <ImageInfoPanel info={imageInfo} bind:includeGps />
    {/if}
    <FilterPanel {facets} bind:filters onchange={resetPage} />
  </aside>

  <section class="content">
    <form class="searchbar" onsubmit={(e) => e.preventDefault()}>
      <input
        type="search"
        placeholder="Rechercher dans {schema.name.toLowerCase()}…"
        bind:value={text}
        oninput={resetPage}
      />
      <span class="status">
        {#if loading}
          Chargement…
        {:else if result}
          {result.total} résultat{result.total > 1 ? 's' : ''}
        {/if}
      </span>
    </form>

    {#if error}
      <p class="error">{error}</p>
    {:else if result && result.items.length === 0}
      <p class="empty">Aucun objet ne correspond à ces critères.</p>
    {:else if result}
      <div class="grid" class:dim={loading}>
        {#each result.items as item (item.id)}
          <ResultCard {item} />
        {/each}
      </div>

      {#if totalPages > 1}
        <nav class="pager">
          <button type="button" disabled={page <= 1} onclick={() => page--}>← Précédent</button>
          <span>Page {page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onclick={() => page++}>Suivant →</button>
        </nav>
      {/if}
    {/if}
  </section>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: 260px 1fr;
    gap: 1.5rem;
  }
  @media (max-width: 760px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .content {
    min-width: 0;
  }
  .searchbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .searchbar input {
    flex: 1;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--fg);
    font: inherit;
  }
  .status {
    color: var(--muted);
    font-size: 0.85rem;
    white-space: nowrap;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1rem;
    transition: opacity 0.15s;
  }
  .grid.dim {
    opacity: 0.5;
  }
  .pager {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin-top: 1.5rem;
  }
  .pager button {
    padding: 0.45rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--fg);
    cursor: pointer;
    font: inherit;
  }
  .pager button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .error {
    color: #dc2626;
  }
  .empty {
    color: var(--muted);
    text-align: center;
    padding: 3rem 0;
  }
</style>
