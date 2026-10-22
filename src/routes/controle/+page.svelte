<script lang="ts">
  /**
   * Parcours de contrôle, fidèle à docs/vision-cible.html : trois écrans côte à côte
   * sur grand écran (photo · résultat et décision · dossier), un seul à la fois sur téléphone.
   */
  import { onMount } from 'svelte';
  import { api, extractImageInfo, withoutGps, type CollectionItem, type ImageInfo, type SearchResult } from '$lib/api';
  import { schema } from '$lib/config/schema';
  import { countryName } from '$lib/config/countries';
  import { termLabel } from '$lib/config/vocabularies';
  import { riskForCodes } from '$lib/config/risk';
  import { resizeImage, type ResizeResult } from '$lib/utils/resizeImage';
  import { buildCaseFile, caseFileName, downloadJson } from '$lib/utils/caseFile';
  import { flagEmoji } from '$lib/utils/flag';
  import { fallbackToThumb } from '$lib/utils/imgFallback';
  import { i18n } from '$lib/i18n/index.svelte';
  import { lastQuery, type Decision } from '$lib/stores/query.svelte';
  import { modelStatus } from '$lib/ml/status.svelte';
  import ImageUpload from '$lib/components/ImageUpload.svelte';
  import ExtraViews from '$lib/components/ExtraViews.svelte';
  import ModelStatus from '$lib/components/ModelStatus.svelte';
  import ItemDrawer from '$lib/components/ItemDrawer.svelte';

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
    import('$lib/ml/embedder').then(({ preloadModel }) => preloadModel());
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

  // ---- lecture (mêmes règles que InsightsPanel)
  const best = $derived(insights?.references[0]?.score ?? 0);
  const reliable = $derived(best >= schema.similarity.reliable);
  const topCategory = $derived(insights?.categories[0]);
  const topPeriod = $derived(insights?.periods[0]);
  const origins = $derived((insights?.origins ?? []).filter((o) => o.share >= 0.005));
  const confidence = $derived(
    !reliable || !topCategory ? 'weak' : best >= schema.similarity.strong && topCategory.share >= 0.6 ? 'strong' : topCategory.share >= 0.4 ? 'medium' : 'weak'
  );
  const risks = $derived.by(() => {
    if (!reliable || !topCategory) return [];
    const seen = new Map<string, ReturnType<typeof riskForCodes>[number]>();
    for (const o of origins) for (const r of riskForCodes(o.code, topCategory.code)) seen.set(r.id, r);
    return [...seen.values()];
  });
  /** « Pourquoi » : attributs dominants parmi les références, en langage courant. */
  const sharedTags = $derived.by(() => {
    if (!insights) return [];
    const tags: string[] = [];
    for (const m of insights.materials.slice(0, 2)) tags.push(termLabel('material', m.code, L));
    for (const t of insights.techniques.slice(0, 2)) tags.push(termLabel('technique', t.code, L));
    for (const s of insights.subjects.slice(0, 1)) tags.push(termLabel('subject', s.code, L));
    if (topPeriod) tags.push(termLabel('period', topPeriod.code, L));
    return [...new Set(tags)].slice(0, 5);
  });

  function decide(d: Decision | null) {
    lastQuery.decide(d, {
      origins: origins.map((o) => ({ code: o.code, share: Math.round(o.share * 100) / 100 })),
      category: topCategory?.code,
      period: topPeriod?.code,
      risk: risks.map((r) => i18n.l(r.label))
    });
    if (d) step = 3;
  }

  async function openById(id: string) {
    selected = result?.items.find((it) => it.id === id) ?? (await api.getItem(id));
  }

  function exportCase() {
    downloadJson(caseFileName(), buildCaseFile(result?.items ?? [], insights));
  }

  const record = $derived(lastQuery.record);
  const caseId = $derived(record ? `${record.at.slice(0, 10).replaceAll('-', '')}-${(record.sha256 ?? '').slice(0, 4)}` : '');
  const photoCount = $derived(1 + extra.length + (crop ? 1 : 0));
  const pct = (x: number) => `${Math.round(x * 100)} %`;
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
    {#if image}
      <ModelStatus />
      <ExtraViews bind:views={extra} />
    {/if}
    <p class="hint">{i18n.t('control.photoHint')}</p>
    <button type="button" class="primary" disabled={!canAnalyse} onclick={analyse}>
      {loading ? i18n.t('model.computing') : i18n.t('control.analyse')}
    </button>
    {#if error}<p class="error">{error}</p>{/if}
    <p class="hint small">{i18n.t('control.privacy')}</p>
  </article>

  <!-- 2 · RÉSULTAT ET DÉCISION -->
  <article class="phone" class:active={step === 2} class:hidden={step !== 2} class:empty={!insights}>
    <span class="pill">2 · {i18n.t('control.step2Title').toUpperCase()}</span>
    <div class="bar"><span>{clock}</span><span>{analysedMs !== null ? i18n.t('control.analysedIn', { s: (analysedMs / 1000).toFixed(1) }) : ''}</span></div>
    {#if insights && topCategory}
      {#if !reliable}
        <div class="block notice">{i18n.t('insights.unreliable', { pct: Math.round(best * 100) })}</div>
      {/if}
      <div class="block">
        <h4>{i18n.t('insights.identification')}</h4>
        <p class="id">{termLabel('category', topCategory.code, L)} <span class="conf {confidence}">{i18n.t('control.confidence', { level: i18n.t(`score.${confidence}`) })}</span></p>
        <p class="meta">
          {insights.materials.slice(0, 2).map((m) => termLabel('material', m.code, L)).join(', ')}
          {#if topPeriod} · {termLabel('period', topPeriod.code, L)}{/if}
        </p>
      </div>
      <div class="block">
        <h4>{i18n.t('insights.provenance')}</h4>
        <div class="prov">
          {#each origins as o (o.code)}
            <div><span class="flag" aria-hidden="true">{flagEmoji(o.code)}</span><span class="b" title={countryName(o.code, L)}><i style="width: {o.share * 100}%"></i></span><span class="n">{pct(o.share)}</span></div>
          {:else}
            <p class="meta">{i18n.t('insights.unknownOrigin')}</p>
          {/each}
        </div>
        <p class="meta">{i18n.t('insights.basedOn', { n: insights.topK })}</p>
      </div>
      {#each risks as r (r.id)}
        <div class="block alert" class:emergency={r.emergency}>
          <p class="id">⚠ {i18n.t('insights.risk', { label: i18n.l(r.label) })}</p>
          <p class="meta">{i18n.l(r.advice)} <a href={r.url} target="_blank" rel="noopener">{i18n.t('insights.riskLink')}</a></p>
        </div>
      {/each}
      <div class="block">
        <h4>{i18n.t('control.why')}</h4>
        <div class="why">
          {#each insights.references.slice(0, 3) as r (r.id)}
            <button type="button" class="t" onclick={() => openById(r.id)} title={r.title}>
              <img src={r.thumbnailUrl} alt={r.title} onerror={(e) => fallbackToThumb(e, r.thumbnailUrl)} />
              <span>{Math.round(r.score * 100)}</span>
            </button>
          {/each}
        </div>
        {#if sharedTags.length}
          <div class="tags">{#each sharedTags as t (t)}<span>{t}</span>{/each}</div>
        {/if}
      </div>
      <div class="actions">
        <button type="button" class="hold" onclick={() => decide('hold')}>{i18n.t('control.hold')}</button>
        <button type="button" class="ok" onclick={() => decide('release')}>{i18n.t('control.release')}</button>
      </div>
      <button type="button" class="link center" onclick={() => decide('expert')}>{i18n.t('control.expertRemote')}</button>
      {#if decision}<p class="hint small done">✓ {i18n.t(`decision.${decision}`)}</p>{/if}
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
  .done {
    color: var(--compare);
    font-weight: 600;
  }
  .primary,
  .secondary,
  .hold,
  .ok {
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
  .secondary {
    background: var(--surface-2);
    color: var(--fg);
    font-weight: 500;
    margin-top: auto;
  }
  .hold {
    background: #b42318;
    color: #fff;
  }
  .ok {
    background: var(--compare);
    color: var(--compare-ink);
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
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
  .link.center {
    color: var(--muted);
    text-align: center;
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
  .block.notice {
    background: var(--surface-2);
    font-size: 12px;
    color: var(--fg);
  }
  .id {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .conf {
    font-size: 11px;
    padding: 1px 7px;
    border-radius: 999px;
    font-weight: 600;
  }
  .conf.strong { background: var(--compare-soft); color: var(--compare); }
  .conf.medium { background: var(--accent-soft); color: var(--accent); }
  .conf.weak { background: var(--surface-2); color: var(--muted); }
  .meta {
    margin: 2px 0 0;
    font-size: 12px;
    color: var(--muted);
  }
  .meta a {
    color: inherit;
  }
  .prov {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 4px;
  }
  .prov div {
    display: grid;
    grid-template-columns: 22px 1fr 40px;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .prov .b {
    height: 8px;
    border-radius: 4px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .prov .b i {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .prov .n {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    font-size: 12px;
  }
  .alert {
    border-color: #f3c48c;
    background: #fff6e8;
  }
  .alert .id {
    color: #b45309;
    font-size: 13px;
  }
  .alert .meta {
    color: var(--fg);
  }
  .alert.emergency {
    border-color: #f1a7a0;
    background: #fdecea;
  }
  .alert.emergency .id {
    color: #b42318;
  }
  :global(:root[data-theme='dark']) .alert {
    background: color-mix(in srgb, #f59e0b 14%, var(--surface));
    border-color: color-mix(in srgb, #f59e0b 40%, transparent);
  }
  :global(:root[data-theme='dark']) .alert .meta {
    color: #f6d9a8;
  }
  .why {
    display: flex;
    gap: 6px;
  }
  .why .t {
    position: relative;
    flex: 1;
    aspect-ratio: 1;
    padding: 0;
    border: none;
    border-radius: 8px;
    overflow: hidden;
    background: var(--surface-2);
    cursor: pointer;
  }
  .why img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .why span {
    position: absolute;
    right: 4px;
    top: 4px;
    padding: 1px 5px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.92);
    color: #1b1c1f;
    font-size: 10px;
    font-weight: 600;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
  }
  .tags span {
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--accent-soft);
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
    .actions,
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
