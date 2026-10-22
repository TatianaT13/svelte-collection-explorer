<script lang="ts">
  /**
   * Page Explorer : recherche texte + image + filtres, résultats paginés.
   * - état sérialisé dans l'URL (liens partageables)
   * - image par dépôt n'importe où sur la page ou collage (Ctrl/Cmd+V)
   * - "/" pour aller à la recherche, Échap pour effacer / fermer
   */
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import { fade } from 'svelte/transition';
  import {
    api,
    extractImageInfo,
    withoutGps,
    type ActiveFilters,
    type CollectionItem,
    type FacetValues,
    type ImageInfo,
    type SearchResult
  } from '$lib/api';
  import { schema } from '$lib/config/schema';
  import { readSearchState, writeSearchState } from '$lib/utils/urlState';
  import { resizeImage, type ResizeResult } from '$lib/utils/resizeImage';
  import { i18n } from '$lib/i18n/index.svelte';
  import ImageUpload from '$lib/components/ImageUpload.svelte';
  import FilterPanel from '$lib/components/FilterPanel.svelte';
  import FilterChips from '$lib/components/FilterChips.svelte';
  import ResultCard from '$lib/components/ResultCard.svelte';
  import SkeletonCard from '$lib/components/SkeletonCard.svelte';
  import ImageInfoPanel from '$lib/components/ImageInfoPanel.svelte';
  import ItemDrawer from '$lib/components/ItemDrawer.svelte';
  import ModelStatus from '$lib/components/ModelStatus.svelte';
  import InsightsPanel from '$lib/components/InsightsPanel.svelte';
  import { lastQuery } from '$lib/stores/query.svelte';

  // Pré-rendu statique : l'URL n'est connue que dans le navigateur.
  // L'état part vide, puis est lu depuis l'URL au montage ; les effets attendent `ready`.
  let ready = $state(false);
  let text = $state(''); // saisie
  let query = $state(''); // saisie après délai, utilisée pour chercher
  let filters = $state<ActiveFilters>({});
  let pageNo = $state(1);
  let image = $state<File | null>(null); // original : aperçu + métadonnées + archivage
  let crop = $state<File | null>(null); // zone cadrée par l'utilisateur, si demandée
  let imageToSend = $state<ResizeResult | null>(null); // version réduite envoyée à la recherche
  let imageInfo = $state<ImageInfo | null>(null);
  let includeGps = $state(false); // vie privée par défaut : la position ne part que si on le demande

  let facets = $state<FacetValues>({});
  let result = $state<SearchResult | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  let selected = $state<CollectionItem | null>(null);
  let filtersOpen = $state(false);
  let dragging = $state(false);
  let dragDepth = 0;
  let searchEl = $state<HTMLInputElement | null>(null);

  const totalPages = $derived(result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1);
  const activeFilterCount = $derived(
    Object.values(filters).filter((v) => (Array.isArray(v) ? v.length > 0 : v !== '' && v !== null && v !== undefined)).length
  );

  let requestId = 0;
  async function runSearch() {
    const id = ++requestId;
    loading = true;
    error = null;
    try {
      const info = imageInfo ? (includeGps ? imageInfo : withoutGps(imageInfo)) : undefined;
      const res = await api.search({ text: query, image: imageToSend?.file, imageInfo: info, filters, page: pageNo, pageSize: schema.pageSize });
      if (id === requestId) result = res;
    } catch (e) {
      if (id === requestId) error = e instanceof Error ? e.message : i18n.t('error.unknown');
    } finally {
      if (id === requestId) loading = false;
    }
  }

  // Relance la recherche dès qu'un critère change (ou la langue : libellés du mock).
  $effect(() => {
    void query; void imageToSend; void imageInfo; void includeGps; void filters; void pageNo; void i18n.locale;
    if (!ready) return;
    runSearch();
  });

  // Délai sur la saisie : on ne cherche qu'après 250 ms sans frappe.
  $effect(() => {
    const v = text;
    if (v === query) return;
    const id = setTimeout(() => (query = v), 250);
    return () => clearTimeout(id);
  });

  // Mémorise la recherche par image pour l'export du dossier.
  $effect(() => {
    if (imageInfo) lastQuery.set(imageInfo, !!crop);
    else lastQuery.clear();
  });

  // Réduit l'image (ou la zone cadrée) avant envoi.
  $effect(() => {
    const f = crop ?? image;
    if (!f) {
      imageToSend = null;
      return;
    }
    let cancelled = false;
    resizeImage(f, schema.upload).then((r) => {
      if (!cancelled) imageToSend = r;
    });
    return () => {
      cancelled = true;
    };
  });

  // Reflète l'état dans l'URL sans recharger ni empiler l'historique.
  $effect(() => {
    if (!ready) return;
    const url = writeSearchState(new URL(location.href), { text: query, filters, page: pageNo });
    if (url.href !== location.href) replaceState(url, {});
  });

  // Lit les métadonnées dès qu'une image est choisie, et lance le chargement du modèle.
  $effect(() => {
    const f = image;
    if (!f) {
      imageInfo = null;
      return;
    }
    import('$lib/ml/embedder').then(({ preloadModel }) => preloadModel());
    let cancelled = false;
    extractImageInfo(f).then((info) => {
      if (!cancelled) imageInfo = info;
    });
    return () => {
      cancelled = true;
    };
  });

  onMount(async () => {
    const initial = readSearchState(page.url.searchParams);
    text = initial.text;
    query = initial.text;
    filters = initial.filters;
    pageNo = initial.page;
    ready = true;
    facets = await api.getFacets();
  });

  function resetPage() {
    pageNo = 1;
  }

  function setImage(f: File | null) {
    image = f;
    crop = null;
    resetPage();
  }

  function removeFilter(key: string, value?: string) {
    if (key === '__text') {
      text = '';
      query = '';
    }
    else if (value !== undefined && Array.isArray(filters[key])) {
      filters = { ...filters, [key]: (filters[key] as string[]).filter((v) => v !== value) };
    } else filters = { ...filters, [key]: '' };
    resetPage();
  }

  /** Coche / décoche une valeur d'attribut comme filtre (depuis une carte ou le volet). */
  function toggleFilterValue(key: string, value: string) {
    const field = schema.fields.find((f) => f.key === key);
    const current = filters[key];
    if (field && (field.kind === 'country' || field.kind === 'vocab' || field.kind === 'select')) {
      const list = Array.isArray(current) ? current : current ? [String(current)] : [];
      filters = { ...filters, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
    } else {
      filters = { ...filters, [key]: String(current ?? '').toLowerCase() === value.toLowerCase() ? '' : value };
    }
    resetPage();
  }

  async function openById(id: string) {
    const inPage = result?.items.find((it) => it.id === id);
    selected = inPage ?? (await api.getItem(id));
  }

  function clearAll() {
    text = '';
    query = '';
    filters = {};
    resetPage();
  }

  function hasFiles(e: DragEvent) {
    return e.dataTransfer?.types.includes('Files') ?? false;
  }

  function isTyping(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === '/' && !isTyping(e.target)) {
      e.preventDefault();
      searchEl?.focus();
      searchEl?.select();
    } else if (e.key === 'Escape') {
      if (selected) selected = null;
      else if (filtersOpen) filtersOpen = false;
      else if (document.activeElement === searchEl && text) {
        text = '';
        query = '';
        resetPage();
      }
    }
  }

  function onPaste(e: ClipboardEvent) {
    const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
    const f = item?.getAsFile();
    if (f) {
      e.preventDefault();
      setImage(new File([f], f.name || 'clipboard.png', { type: f.type }));
    }
  }
</script>

<svelte:window
  onkeydown={onKey}
  onpaste={onPaste}
  ondragenter={(e) => { if (hasFiles(e)) { dragDepth++; dragging = true; } }}
  ondragleave={() => { dragDepth = Math.max(0, dragDepth - 1); if (dragDepth === 0) dragging = false; }}
  ondragover={(e) => { if (hasFiles(e)) e.preventDefault(); }}
  ondrop={(e) => {
    dragDepth = 0;
    dragging = false;
    if (!hasFiles(e)) return;
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f?.type.startsWith('image/')) setImage(f);
  }}
/>

{#if dragging}
  <div class="drop-overlay" transition:fade={{ duration: 120 }} aria-hidden="true">
    <div class="drop-box">
      <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>
      <p>{i18n.t('upload.overlay')}</p>
    </div>
  </div>
{/if}

<div class="layout">
  <aside class="sidebar" class:open={filtersOpen}>
    <div class="sidebar-head">
      <span>{i18n.t('filters.panel')}</span>
      <button type="button" class="close" aria-label={i18n.t('filters.close')} onclick={() => (filtersOpen = false)}>×</button>
    </div>
    <ImageUpload bind:file={image} onchange={() => { crop = null; resetPage(); }} oncrop={(f) => { crop = f; resetPage(); }} />
    {#if image}
      <ModelStatus />
    {/if}
    {#if imageInfo}
      <ImageInfoPanel info={imageInfo} bind:includeGps sent={imageToSend ? { bytes: imageToSend.file.size, width: imageToSend.width, height: imageToSend.height, resized: imageToSend.resized } : undefined} />
    {/if}
    <FilterPanel {facets} bind:filters onchange={resetPage} />
  </aside>
  {#if filtersOpen}
    <div class="scrim" onclick={() => (filtersOpen = false)} aria-hidden="true"></div>
  {/if}

  <section class="content">
    <form class="searchbar" onsubmit={(e) => e.preventDefault()} role="search">
      <div class="field">
        <svg class="icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input
          bind:this={searchEl}
          type="search"
          placeholder={i18n.t('search.placeholder')}
          aria-label={i18n.t('search.label')}
          bind:value={text}
          oninput={resetPage}
        />
        {#if text}
          <button type="button" class="clear" aria-label={i18n.t('search.clear')} onclick={() => { text = ''; resetPage(); searchEl?.focus(); }}>×</button>
        {:else}
          <kbd title={i18n.t('search.hint')}>/</kbd>
        {/if}
      </div>
      <button type="button" class="filters-btn" onclick={() => (filtersOpen = true)}>
        {i18n.t('filters.title')} {#if activeFilterCount}<span class="badge">{activeFilterCount}</span>{/if}
      </button>
    </form>

    <div class="progress" class:on={loading} aria-hidden="true"></div>

    <FilterChips {filters} text={query} onremove={removeFilter} onclear={clearAll} />

    <div class="results-head">
      <span class="status" aria-live="polite">
        {#if result}
          <strong>{result.total}</strong> {i18n.t('results.count', { n: result.total }).replace(/^\d+\s*/, '')}
          {#if image}<span class="muted"> · {i18n.t('results.bySimilarity')}</span>{/if}
        {:else}
          &nbsp;
        {/if}
      </span>
    </div>

    {#if error}
      <p class="error">{error}</p>
    {:else if !result}
      <div class="grid">
        {#each Array(6) as _, i (i)}<SkeletonCard />{/each}
      </div>
    {:else if result.items.length === 0}
      <div class="empty">
        <p><strong>{i18n.t('results.empty')}</strong></p>
        <p class="muted">{i18n.t('results.emptyHint')}</p>
        {#if text || activeFilterCount}
          <button type="button" class="btn" onclick={clearAll}>{i18n.t('chips.clearAll')}</button>
        {/if}
      </div>
    {:else}
      {#if result.insights && result.insights.topK > 0}
        <InsightsPanel insights={result.insights} onopen={openById} onfilterOrigin={(code) => toggleFilterValue('origin', code)} />
      {/if}
      <div class="grid" class:dim={loading}>
        {#each result.items as item (item.id)}
          <ResultCard {item} onopen={(it) => (selected = it)} {filters} onfilter={toggleFilterValue} />
        {/each}
      </div>

      {#if totalPages > 1}
        <nav class="pager" aria-label={i18n.t('pager.label')}>
          <button type="button" class="btn" disabled={pageNo <= 1} onclick={() => pageNo--}>{i18n.t('pager.prev')}</button>
          <span>{i18n.t('pager.page', { page: pageNo, total: totalPages })}</span>
          <button type="button" class="btn" disabled={pageNo >= totalPages} onclick={() => pageNo++}>{i18n.t('pager.next')}</button>
        </nav>
      {/if}
    {/if}
  </section>
</div>

<ItemDrawer item={selected} onclose={() => (selected = null)} {filters} onfilter={toggleFilterValue} />

<style>
  .layout {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 1.75rem;
    align-items: start;
  }
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    position: sticky;
    top: 4.2rem;
    max-height: calc(100vh - 5rem);
    overflow-y: auto;
    padding-right: 0.25rem;
  }
  .sidebar-head {
    display: none;
  }
  .content {
    min-width: 0;
  }
  .searchbar {
    display: flex;
    gap: 0.6rem;
    margin-bottom: 0.5rem;
  }
  .field {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
  }
  .field .icon {
    position: absolute;
    left: 0.8rem;
    color: var(--muted);
    pointer-events: none;
  }
  .field input {
    width: 100%;
    padding: 0.7rem 2.6rem 0.7rem 2.5rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--fg);
    font: inherit;
    box-shadow: var(--shadow);
    transition: border-color 0.12s, box-shadow 0.12s;
  }
  .field input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .field input::-webkit-search-cancel-button {
    display: none;
  }
  .field kbd {
    position: absolute;
    right: 0.7rem;
    padding: 0.1rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--surface-2);
    color: var(--muted);
    font: 0.72rem ui-monospace, SFMono-Regular, Menlo, monospace;
    pointer-events: none;
  }
  .field .clear {
    position: absolute;
    right: 0.5rem;
    width: 1.6rem;
    height: 1.6rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    font-size: 1.1rem;
    cursor: pointer;
  }
  .field .clear:hover {
    background: var(--surface-2);
    color: var(--fg);
  }
  .filters-btn {
    display: none;
  }
  .badge {
    display: inline-block;
    min-width: 1.4em;
    padding: 0 0.4em;
    margin-left: 0.2em;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-size: 0.72rem;
    text-align: center;
  }
  .progress {
    height: 2px;
    margin-bottom: 0.6rem;
    border-radius: 2px;
    background: transparent;
    overflow: hidden;
  }
  .progress.on {
    background: var(--accent-soft);
  }
  .progress.on::after {
    content: '';
    display: block;
    width: 35%;
    height: 100%;
    background: var(--accent);
    animation: slide 1s ease-in-out infinite;
  }
  @keyframes slide {
    from { transform: translateX(-100%); }
    to { transform: translateX(300%); }
  }
  .results-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.7rem;
    min-height: 1.2em;
  }
  .status {
    font-size: 0.85rem;
    color: var(--muted);
  }
  .status strong {
    color: var(--fg);
    font-variant-numeric: tabular-nums;
  }
  .muted {
    color: var(--muted);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 1rem;
    transition: opacity 0.15s;
  }
  .grid.dim {
    opacity: 0.6;
  }
  .pager {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin-top: 1.5rem;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .btn {
    padding: 0.5rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--fg);
    cursor: pointer;
    font: inherit;
    font-size: 0.88rem;
  }
  .btn:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }
  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .error {
    color: #dc2626;
  }
  .empty {
    text-align: center;
    padding: 4rem 1rem;
    border: 1px dashed var(--border);
    border-radius: 12px;
  }
  .empty p {
    margin: 0 0 0.5rem;
  }
  .drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--accent) 12%, rgb(0 0 0 / 0.35));
    backdrop-filter: blur(2px);
    pointer-events: none;
  }
  .drop-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    padding: 2rem 2.5rem;
    border: 2px dashed #fff;
    border-radius: 16px;
    color: #fff;
    font-weight: 600;
    text-shadow: 0 1px 2px rgb(0 0 0 / 0.4);
  }
  .drop-box p {
    margin: 0;
  }
  .scrim {
    display: none;
  }

  @media (max-width: 820px) {
    .layout {
      grid-template-columns: 1fr;
    }
    .sidebar {
      position: fixed;
      inset: 0 auto 0 0;
      z-index: 45;
      width: min(340px, 90vw);
      max-height: none;
      padding: 1rem;
      background: var(--surface);
      border-right: 1px solid var(--border);
      box-shadow: 12px 0 40px rgb(0 0 0 / 0.2);
      transform: translateX(-105%);
      transition: transform 0.2s ease;
    }
    .sidebar.open {
      transform: none;
    }
    .sidebar-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
    }
    .sidebar-head .close {
      width: 2rem;
      height: 2rem;
      border: none;
      border-radius: 8px;
      background: var(--surface-2);
      color: var(--fg);
      font-size: 1.2rem;
      cursor: pointer;
    }
    .scrim {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 44;
      background: rgb(0 0 0 / 0.35);
    }
    .filters-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0 0.9rem;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
      color: var(--fg);
      font: inherit;
      font-size: 0.88rem;
      cursor: pointer;
      white-space: nowrap;
    }
    .field kbd {
      display: none;
    }
  }
</style>
