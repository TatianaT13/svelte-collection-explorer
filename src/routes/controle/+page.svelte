<script lang="ts">
  /**
   * Parcours de contrôle, fidèle à docs/vision-cible.html : trois écrans côte à côte
   * sur grand écran (photo · résultat et décision · dossier), un seul à la fois sur téléphone.
   * La lecture des résultats est celle de l'explorateur (InsightsPanel, en mode empilé) :
   * un seul composant pour une seule logique.
   */
  import { onMount } from 'svelte';
  import { api, extractImageInfo, withoutGps, type CollectionItem, type ImageInfo, type SearchResult } from '#lib/api/index.ts';
  import { schema } from '#lib/config/schema.ts';
  import { measurePhoto, assessPhoto, type PhotoMetrics, type QualityIssue } from '#lib/utils/photoQuality.ts';
  import PhotoQuality from '#lib/components/PhotoQuality.svelte';
  import SampleImages from '#lib/components/SampleImages.svelte';
  import { resizeImage, type ResizeResult } from '#lib/utils/resizeImage.ts';
  import { buildCaseFile, caseFileName, downloadJson } from '#lib/utils/caseFile.ts';
  import { i18n } from '#lib/i18n/index.svelte.ts';
  import { lastQuery } from '#lib/stores/query.svelte.ts';
  import ImageUpload from '#lib/components/ImageUpload.svelte';
  import ExtraViews from '#lib/components/ExtraViews.svelte';
  import ModelStatus from '#lib/components/ModelStatus.svelte';
  import InsightsPanel from '#lib/components/InsightsPanel.svelte';
  import ItemDrawer from '#lib/components/ItemDrawer.svelte';

  type Step = 1 | 2 | 3;
  let step = $state<Step>(1);

  let image = $state<File | null>(null);
  let crop = $state<File | null>(null);
  let extra = $state<File[]>([]);
  let imageToSend = $state<ResizeResult | null>(null);
  let imageInfo = $state<ImageInfo | null>(null);
  let result = $state<SearchResult | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let analysedMs = $state<number | null>(null);
  let photoMetrics = $state<PhotoMetrics | null>(null);
  let photoIssues = $state<QualityIssue[]>([]);

  $effect(() => {
    const f = crop ?? image;
    if (!f) {
      photoMetrics = null;
      photoIssues = [];
      return;
    }
    let cancelled = false;
    measurePhoto(f).then((m) => {
      if (cancelled) return;
      photoMetrics = m;
      photoIssues = m ? assessPhoto(m, schema.photoQuality) : [];
    });
    return () => {
      cancelled = true;
    };
  });
  let selected = $state<CollectionItem | null>(null);
  let requestId = 0;

  // Horloge et état réseau, comme la barre d'état de la maquette.
  let now = $state(new Date());
  const clock = $derived(now.toLocaleTimeString(i18n.locale, { hour: '2-digit', minute: '2-digit' }));
  let online = $state(true);
  onMount(() => {
    const id = setInterval(() => (now = new Date()), 15000);
    online = navigator.onLine;
    const on = () => (online = true);
    const off = () => (online = false);
    addEventListener('online', on);
    addEventListener('offline', off);
    if (lastQuery.record?.decision && !image) step = 3;
    return () => {
      clearInterval(id);
      removeEventListener('online', on);
      removeEventListener('offline', off);
    };
  });

  const L = $derived(i18n.locale);
  const insights = $derived(result?.insights ?? null);
  const decision = $derived(lastQuery.record?.decision ?? null);
  const canAnalyse = $derived(!!imageToSend && !loading);

  $effect(() => {
    const f = image;
    if (!f) {
      imageInfo = null;
      return;
    }
    import('#lib/ml/embedder.ts').then(({ preloadModel }) => preloadModel());
    let cancelled = false;
    extractImageInfo(f).then((info) => {
      if (!cancelled) imageInfo = info;
    });
    return () => {
      cancelled = true;
    };
  });

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
    const t0 = performance.now();
    try {
      const extras = await Promise.all(extra.map((f) => resizeImage(f, schema.upload).then((r) => r.file)));
      const res = await api.search({
        text: '',
        image: imageToSend.file,
        extraImages: extras,
        imageInfo: imageInfo ? withoutGps(imageInfo) : undefined,
        filters: {},
        page: 1,
        pageSize: schema.similarity.topK
      });
      if (id === requestId) {
        result = res;
        analysedMs = Math.round(performance.now() - t0);
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
    extra = [];
    result = null;
    analysedMs = null;
    step = 1;
  }

  async function openById(id: string) {
    selected = result?.items.find((it) => it.id === id) ?? (await api.getItem(id));
  }

  async function exportCase() {
    const info = await api.info().catch(() => undefined);
    downloadJson(caseFileName(), buildCaseFile(result?.items ?? [], insights, info));
  }

  const record = $derived(lastQuery.record);
  const caseId = $derived(record ? `${record.at.slice(0, 10).replaceAll('-', '')}-${(record.sha256 ?? '').slice(0, 4)}` : '');
  const photoCount = $derived(1 + extra.length + (crop ? 1 : 0));
</script>

<svelte:head>
  <title>{i18n.t('control.title')} · {i18n.l(schema.name)}</title>
</svelte:head>

<ol class="tabs" aria-label={i18n.t('control.title')}>
  {#each [1, 2, 3] as n (n)}
    <li>
      <button type="button" class:active={step === n} disabled={(n === 2 && !insights) || (n === 3 && !record)} onclick={() => (step = n as Step)}>
        <span class="num">{n}</span>{i18n.t(`control.step${n}`)}
      </button>
    </li>
  {/each}
</ol>

<div class="screens">
  <!-- 1 · PHOTO -->
  <article class="phone" class:active={step === 1} class:hidden={step !== 1}>
    <span class="pill">1 · {i18n.t('control.step1').toUpperCase()}</span>
    <div class="bar"><span>{clock}</span><span>{online ? i18n.t('control.online') : i18n.t('control.offline')}</span></div>
    <h2>{i18n.t('control.step1Title')}</h2>
    <ImageUpload bind:file={image} onchange={() => { crop = null; extra = []; }} oncrop={(f) => (crop = f)} />
    {#if !image}
      <SampleImages onpick={(f) => { image = f; crop = null; extra = []; }} />
    {/if}
    {#if image}
      <PhotoQuality metrics={photoMetrics} issues={photoIssues} compact />
      <ModelStatus />
      <ExtraViews bind:views={extra} />
    {/if}
    <p class="hint">{i18n.t('control.photoHint')}</p>
    <button type="button" class="primary" class:warn={photoIssues.length > 0} disabled={!canAnalyse} onclick={analyse}>
      {loading ? i18n.t('model.computing') : photoIssues.length ? i18n.t('control.analyseAnyway') : i18n.t('control.analyse')}
    </button>
    {#if error}<p class="error">{error}</p>{/if}
    <p class="hint small">{i18n.t('control.privacy')}</p>
  </article>

  <!-- 2 · RÉSULTAT ET DÉCISION : le même panneau que l'explorateur, empilé -->
  <article class="phone" class:active={step === 2} class:hidden={step !== 2} class:empty={!insights}>
    <span class="pill">2 · {i18n.t('control.step2Title').toUpperCase()}</span>
    <div class="bar"><span>{clock}</span><span>{analysedMs !== null ? i18n.t('control.analysedIn', { s: (analysedMs / 1000).toFixed(1) }) : ''}</span></div>
    {#if insights}
      <InsightsPanel {insights} stacked onopen={openById} ondecide={(d) => { if (d) step = 3; }} />
    {:else}
      <div class="placeholder">
        <p>{i18n.t('control.waitPhoto')}</p>
      </div>
    {/if}
  </article>

  <!-- 3 · DOSSIER -->
  <article class="phone" class:active={step === 3} class:hidden={step !== 3} class:empty={!record}>
    <span class="pill">3 · {i18n.t('control.step3').toUpperCase()}</span>
    <div class="bar"><span>{clock}</span><span>{record ? `${i18n.t('control.case')} #${caseId}` : ''}</span></div>
    {#if record}
      <h2>{i18n.t('control.step3Title')}</h2>
      <div class="block rows">
        <div><span>{i18n.t('control.decision')}</span><b>{decision ? i18n.t(`decision.${decision}`) : '—'}</b></div>
        <div><span>{i18n.t('control.reason')}</span><b>{record.summary?.risk?.length ? record.summary.risk.join(' · ') : i18n.t('control.noRisk')}</b></div>
        <div><span>{i18n.t('control.photos')}</span><b>{photoCount} ({i18n.t('control.archived')})</b></div>
        <div><span>{i18n.t('control.fingerprint')}</span><b class="mono">{record.sha256?.slice(0, 10) ?? '—'}…</b></div>
        <div><span>{i18n.t('control.when')}</span><b>{new Date(record.decidedAt ?? record.at).toLocaleString(L, { dateStyle: 'short', timeStyle: 'short' })}</b></div>
      </div>
      <div class="block">
        <h4>{i18n.t('control.expertise')}</h4>
        <div class="rows"><div><span>{i18n.t('control.status')}</span><span class="status">{i18n.t('control.pending')}</span></div></div>
        <ul class="tl">
          <li>{new Date(record.at).toLocaleTimeString(L, { hour: '2-digit', minute: '2-digit' })} {i18n.t('control.tlCreated')}</li>
          <li class="todo">{i18n.t('control.tlExpert')}</li>
          <li class="todo">{i18n.t('control.tlFeedback')}</li>
        </ul>
      </div>
      <div class="block">
        <h4>{i18n.t('control.checks')}</h4>
        <div class="rows">
          <div><span>{i18n.t('control.interpol')}</span><span class="status muted">{i18n.t('control.notConnected')}</span></div>
          <div><span>{i18n.t('control.similarCases')}</span><span class="status muted">{i18n.t('control.notConnected')}</span></div>
        </div>
      </div>
      <button type="button" class="secondary" onclick={exportCase}>{i18n.t('control.export')}</button>
      <div class="links">
        <button type="button" class="link" onclick={() => window.print()}>{i18n.t('compare.print')}</button>
        <button type="button" class="link" onclick={restart}>{i18n.t('control.newControl')}</button>
      </div>
    {:else}
      <div class="placeholder"><p>{i18n.t('control.waitDecision')}</p></div>
    {/if}
  </article>
</div>

<ItemDrawer item={selected} onclose={() => (selected = null)} />

<style>
  .tabs {
    display: none;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4rem;
    list-style: none;
    margin: 0 0 1rem;
    padding: 0;
  }
  .tabs button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    width: 100%;
    padding: 0.55rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--muted);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .tabs button.active {
    border-color: var(--accent);
    color: var(--fg);
    font-weight: 600;
  }
  .tabs button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .num {
    display: grid;
    place-items: center;
    width: 1.3rem;
    height: 1.3rem;
    border-radius: 50%;
    background: var(--surface-2);
    font-size: 0.7rem;
    font-weight: 700;
  }
  .active .num {
    background: var(--accent);
    color: #fff;
  }
  .screens {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 22px;
    align-items: start;
    padding-top: 12px;
  }
  .phone {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 560px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 22px;
    background: var(--surface);
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.06);
    transition: box-shadow 0.2s, border-color 0.2s, opacity 0.2s;
  }
  .phone.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft), 0 14px 36px rgb(0 0 0 / 0.1);
  }
  .phone.empty {
    opacity: 0.8;
  }
  .pill {
    position: absolute;
    top: -12px;
    left: 14px;
    padding: 3px 9px;
    border-radius: 999px;
    background: var(--fg);
    color: var(--bg);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }
  .bar {
    display: flex;
    justify-content: space-between;
    padding: 0 4px;
    font-size: 11px;
    color: var(--muted);
    min-height: 1em;
  }
  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
    text-align: center;
  }
  .hint.small {
    font-size: 11px;
  }
  .primary,
  .secondary {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 11px;
    border: none;
    border-radius: 12px;
    font: inherit;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
  }
  .primary {
    background: var(--accent);
    color: #fff;
  }
  .primary:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .primary.warn {
    background: #b45309;
  }
  .secondary {
    background: var(--surface-2);
    color: var(--fg);
    font-weight: 500;
    margin-top: auto;
  }
  .link {
    border: none;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    padding: 2px 0;
  }
  .links {
    display: flex;
    justify-content: center;
    gap: 1rem;
  }
  .error {
    margin: 0;
    color: #dc2626;
    font-size: 12px;
  }
  .block {
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
  }
  .block h4 {
    margin: 0 0 4px;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .rows div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .rows div:last-child {
    border: 0;
  }
  .rows b {
    font-weight: 600;
    text-align: right;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
  }
  .status {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 999px;
    background: #fff1dc;
    color: #b45309;
    font-weight: 600;
  }
  .status.muted {
    background: var(--surface-2);
    color: var(--muted);
  }
  .tl {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    display: grid;
    gap: 4px;
    font-size: 12px;
    color: var(--muted);
  }
  .tl li::before {
    content: '';
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    margin-right: 8px;
    vertical-align: middle;
  }
  .tl li.todo::before {
    background: var(--border);
  }
  .placeholder {
    flex: 1;
    display: grid;
    place-items: center;
    padding: 2rem 1rem;
    border: 1px dashed var(--border);
    border-radius: 12px;
    color: var(--muted);
    font-size: 13px;
    text-align: center;
  }
  .placeholder p {
    margin: 0;
  }
  @media (max-width: 980px) {
    .tabs {
      display: grid;
    }
    .screens {
      grid-template-columns: 1fr;
      max-width: 520px;
      margin: 0 auto;
    }
    .phone.hidden {
      display: none;
    }
    .phone.active {
      box-shadow: 0 10px 30px rgb(0 0 0 / 0.06);
      border-color: var(--border);
    }
  }
  @media print {
    .tabs,
    .links,
    .primary,
    .secondary,
    :global(nav),
    :global(.tray) {
      display: none !important;
    }
    .phone.hidden {
      display: flex;
    }
    .screens {
      grid-template-columns: repeat(3, 1fr);
    }
  }
</style>
