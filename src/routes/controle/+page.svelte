<script lang="ts">
  /**
   * Parcours de contrôle en trois étapes, pensé pour un téléphone :
   * 1. photo (avec recadrage), 2. résultat et décision, 3. dossier.
   * Réutilise la recherche par image, la lecture agrégée et le dossier de session.
   */
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { fade } from 'svelte/transition';
  import { api, extractImageInfo, withoutGps, type CollectionItem, type ImageInfo, type SearchResult } from '$lib/api';
  import { schema } from '$lib/config/schema';
  import { resizeImage, type ResizeResult } from '$lib/utils/resizeImage';
  import { buildCaseFile, caseFileName, downloadJson } from '$lib/utils/caseFile';
  import { i18n } from '$lib/i18n/index.svelte';
  import { lastQuery } from '$lib/stores/query.svelte';
  import { modelStatus } from '$lib/ml/status.svelte';
  import ImageUpload from '$lib/components/ImageUpload.svelte';
  import ModelStatus from '$lib/components/ModelStatus.svelte';
  import InsightsPanel from '$lib/components/InsightsPanel.svelte';
  import ItemDrawer from '$lib/components/ItemDrawer.svelte';
  import ScoreRing from '$lib/components/ScoreRing.svelte';
  import { fallbackToThumb } from '$lib/utils/imgFallback';

  type Step = 1 | 2 | 3;
  let step = $state<Step>(1);

  let image = $state<File | null>(null);
  let crop = $state<File | null>(null);
  let imageToSend = $state<ResizeResult | null>(null);
  let imageInfo = $state<ImageInfo | null>(null);
  let result = $state<SearchResult | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let selected = $state<CollectionItem | null>(null);
  let requestId = 0;

  const decision = $derived(lastQuery.record?.decision ?? null);
  const canAnalyse = $derived(!!imageToSend && !loading);

  // Métadonnées + préchargement du modèle dès qu'une photo est choisie.
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

  // Le dossier n'est effacé que si une photo a été retirée ici : arriver sur la page
  // sans image ne doit pas détruire un dossier en cours (il vit en session).
  let hadImage = false;
  $effect(() => {
    if (imageInfo) {
      hadImage = true;
      lastQuery.set(imageInfo, !!crop);
    } else if (hadImage) {
      hadImage = false;
      lastQuery.clear();
    }
  });

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

  async function analyse() {
    if (!imageToSend) return;
    const id = ++requestId;
    loading = true;
    error = null;
    try {
      const res = await api.search({
        text: '',
        image: imageToSend.file,
        imageInfo: imageInfo ? withoutGps(imageInfo) : undefined,
        filters: {},
        page: 1,
        pageSize: schema.similarity.topK
      });
      if (id === requestId) {
        result = res;
        step = 2;
      }
    } catch (e) {
      if (id === requestId) error = e instanceof Error ? e.message : i18n.t('error.unknown');
    } finally {
      if (id === requestId) loading = false;
    }
  }

  function restart() {
    image = null;
    crop = null;
    result = null;
    step = 1;
  }

  async function openById(id: string) {
    selected = result?.items.find((it) => it.id === id) ?? (await api.getItem(id));
  }

  function exportCase() {
    downloadJson(caseFileName(), buildCaseFile(result?.items ?? [], result?.insights));
  }

  const risks = $derived(lastQuery.record?.summary?.risk ?? []);
  const caseId = $derived(lastQuery.record ? `${lastQuery.record.at.slice(0, 10).replaceAll('-', '')}-${(lastQuery.record.sha256 ?? '').slice(0, 4)}` : '');

  onMount(() => {
    if (lastQuery.record?.decision && !image) step = 3;
  });
</script>

<svelte:head>
  <title>{i18n.t('control.title')} · {i18n.l(schema.name)}</title>
</svelte:head>

<div class="flow">
  <ol class="stepper" aria-label={i18n.t('control.title')}>
    {#each [1, 2, 3] as n (n)}
      <li class:active={step === n} class:done={step > n} aria-current={step === n ? 'step' : undefined}>
        <span class="num">{step > n ? '✓' : n}</span>
        <span class="lbl">{i18n.t(`control.step${n}`)}</span>
      </li>
    {/each}
  </ol>

  {#if step === 1}
    <section class="card" in:fade={{ duration: 150 }}>
      <h1>{i18n.t('control.step1Title')}</h1>
      <ImageUpload bind:file={image} onchange={() => (crop = null)} oncrop={(f) => (crop = f)} />
      {#if image}
        <ModelStatus />
      {/if}
      <p class="hint">{i18n.t('control.photoHint')}</p>
      <button type="button" class="primary" disabled={!canAnalyse} onclick={analyse}>
        {#if loading}{i18n.t('model.computing')}{:else}{i18n.t('control.analyse')}{/if}
      </button>
      {#if error}<p class="error">{error}</p>{/if}
      <p class="privacy">{i18n.t('control.privacy')}</p>
    </section>
  {:else if step === 2 && result?.insights}
    <section in:fade={{ duration: 150 }}>
      <header class="head">
        <h1>{i18n.t('control.step2Title')}</h1>
        <button type="button" class="link" onclick={restart}>{i18n.t('control.changePhoto')}</button>
      </header>
      <div class="query">
        {#if image}<img src={URL.createObjectURL(crop ?? image)} alt="" />{/if}
        <div>
          <strong>{image?.name}</strong>
          {#if crop}<span class="tag">{i18n.t('compare.queryCropped')}</span>{/if}
          <p class="muted">{i18n.t('control.analysed', { n: result.total })}</p>
        </div>
      </div>
      <InsightsPanel insights={result.insights} stacked onopen={openById} />
      <details class="similar">
        <summary>{i18n.t('control.similar', { n: result.items.length })}</summary>
        <ul>
          {#each result.items as it (it.id)}
            <li>
              <button type="button" onclick={() => (selected = it)}>
                <img src={it.thumbnailUrl ?? it.imageUrl} alt="" loading="lazy" onerror={(e) => fallbackToThumb(e, it.thumbnailUrl)} />
                <span class="t">{it.title}</span>
                {#if it.score !== undefined}<ScoreRing score={it.score} size={34} />{/if}
              </button>
            </li>
          {/each}
        </ul>
      </details>
      {#if decision}
        <button type="button" class="primary" onclick={() => (step = 3)}>{i18n.t('control.toCase')}</button>
      {/if}
    </section>
  {:else}
    <section class="card" in:fade={{ duration: 150 }}>
      <header class="head">
        <h1>{i18n.t('control.step3Title')}</h1>
        {#if caseId}<span class="muted mono">#{caseId}</span>{/if}
      </header>
      {#if lastQuery.record}
        <dl class="rows">
          <dt>{i18n.t('control.decision')}</dt>
          <dd><b>{decision ? i18n.t(`decision.${decision}`) : '—'}</b></dd>
          <dt>{i18n.t('control.reason')}</dt>
          <dd>{risks.length ? risks.join(' · ') : i18n.t('control.noRisk')}</dd>
          <dt>{i18n.t('control.photo')}</dt>
          <dd>{lastQuery.record.fileName}{#if lastQuery.record.cropped} · {i18n.t('compare.queryCropped')}{/if}</dd>
          <dt>{i18n.t('control.fingerprint')}</dt>
          <dd class="mono">{lastQuery.record.sha256?.slice(0, 24) ?? '—'}…</dd>
          <dt>{i18n.t('control.when')}</dt>
          <dd>{new Date(lastQuery.record.decidedAt ?? lastQuery.record.at).toLocaleString(i18n.locale)}</dd>
          {#if lastQuery.record.summary?.origins?.length}
            <dt>{i18n.t('insights.provenance')}</dt>
            <dd>{lastQuery.record.summary.origins.map((o) => `${o.code} ${Math.round(o.share * 100)} %`).join(' · ')}</dd>
          {/if}
        </dl>
        <div class="block">
          <h3>{i18n.t('control.expertise')}</h3>
          <p class="muted">{i18n.t('control.expertiseHint')}</p>
        </div>
        <div class="block">
          <h3>{i18n.t('control.checks')}</h3>
          <p class="muted">{i18n.t('control.checksHint')}</p>
        </div>
        <div class="actions">
          <button type="button" class="primary" onclick={exportCase}>{i18n.t('compare.export')}</button>
          <button type="button" class="secondary" onclick={() => window.print()}>{i18n.t('compare.print')}</button>
        </div>
        <div class="actions">
          {#if result}<button type="button" class="link" onclick={() => (step = 2)}>{i18n.t('control.backToResult')}</button>{/if}
          <button type="button" class="link" onclick={restart}>{i18n.t('control.newControl')}</button>
        </div>
      {:else}
        <p class="muted">{i18n.t('control.noCase')}</p>
        <button type="button" class="primary" onclick={restart}>{i18n.t('control.newControl')}</button>
      {/if}
    </section>
  {/if}
</div>

<ItemDrawer item={selected} onclose={() => (selected = null)} />

<style>
  .flow {
    max-width: 560px;
    margin: 0 auto;
  }
  .stepper {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4rem;
    list-style: none;
    margin: 0 0 1.1rem;
    padding: 0;
  }
  .stepper li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.6rem;
    border-radius: 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 0.8rem;
    color: var(--muted);
  }
  .stepper li.active {
    border-color: var(--accent);
    color: var(--fg);
    font-weight: 600;
  }
  .stepper li.done {
    color: var(--compare);
  }
  .num {
    display: grid;
    place-items: center;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    background: var(--surface-2);
    font-size: 0.72rem;
    font-weight: 700;
    flex: none;
  }
  .active .num {
    background: var(--accent);
    color: #fff;
  }
  .done .num {
    background: var(--compare);
    color: var(--compare-ink);
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1.1rem;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
  }
  h1 {
    margin: 0;
    font-size: 1.15rem;
    letter-spacing: -0.01em;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    margin-bottom: 0.8rem;
  }
  .hint,
  .privacy {
    margin: 0;
    font-size: 0.82rem;
    color: var(--muted);
    text-align: center;
  }
  .primary {
    width: 100%;
    padding: 0.8rem;
    border: none;
    border-radius: 12px;
    background: var(--accent);
    color: #fff;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }
  .primary:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .secondary {
    width: 100%;
    padding: 0.8rem;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--fg);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }
  .link {
    border: none;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0.3rem 0;
  }
  .error {
    color: #dc2626;
    margin: 0;
  }
  .query {
    display: flex;
    gap: 0.8rem;
    align-items: center;
    margin-bottom: 0.9rem;
  }
  .query img {
    width: 64px;
    height: 64px;
    object-fit: cover;
    border-radius: 10px;
    background: var(--surface-2);
  }
  .query strong {
    font-size: 0.9rem;
  }
  .tag {
    margin-left: 0.4rem;
    font-size: 0.72rem;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    background: var(--compare-soft);
    color: var(--compare);
    font-weight: 600;
  }
  .muted {
    margin: 0.1rem 0 0;
    color: var(--muted);
    font-size: 0.82rem;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.8rem;
  }
  .similar {
    margin: 0.2rem 0 1rem;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
  }
  .similar summary {
    padding: 0.7rem 0.9rem;
    cursor: pointer;
    font-weight: 500;
    font-size: 0.9rem;
  }
  .similar ul {
    list-style: none;
    margin: 0;
    padding: 0 0.5rem 0.5rem;
  }
  .similar li button {
    display: grid;
    grid-template-columns: 44px 1fr auto;
    align-items: center;
    gap: 0.7rem;
    width: 100%;
    padding: 0.4rem;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .similar li button:hover {
    background: var(--surface-2);
  }
  .similar img {
    width: 44px;
    height: 44px;
    object-fit: cover;
    border-radius: 6px;
  }
  .similar .t {
    font-size: 0.86rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rows {
    display: grid;
    grid-template-columns: minmax(110px, 36%) 1fr;
    gap: 0.5rem 0.8rem;
    margin: 0;
    font-size: 0.88rem;
  }
  .rows dt {
    color: var(--muted);
  }
  .rows dd {
    margin: 0;
    text-align: right;
  }
  .block {
    padding: 0.7rem 0.85rem;
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .block h3 {
    margin: 0 0 0.2rem;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .actions {
    display: flex;
    gap: 0.6rem;
    justify-content: center;
  }
  @media print {
    .stepper,
    .actions,
    :global(nav),
    :global(.tray) {
      display: none !important;
    }
  }
</style>
