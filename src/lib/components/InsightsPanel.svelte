<script lang="ts">
  /**
   * Lecture des résultats d'une recherche par image : identification probable,
   * provenance probable, alerte Liste rouge, objets de référence et décision.
   * Tout vient de `result.insights` (calculé par l'adapter) et des règles de risque.
   */
  import type { Insights, CollectionItem } from '$lib/api/types';
  import { schema } from '$lib/config/schema';
  import { countryName } from '$lib/config/countries';
  import { termLabel } from '$lib/config/vocabularies';
  import { riskForCodes } from '$lib/config/risk';
  import { flagEmoji } from '$lib/utils/flag';
  import { i18n } from '$lib/i18n/index.svelte';
  import { lastQuery, type Decision } from '$lib/stores/query.svelte';
  import { fallbackToThumb } from '$lib/utils/imgFallback';

  let {
    insights,
    onopen,
    onfilterOrigin
  }: { insights: Insights; onopen?: (id: string) => void; onfilterOrigin?: (code: string) => void } = $props();

  const L = $derived(i18n.locale);
  const topCategory = $derived(insights.categories[0]);
  const topPeriod = $derived(insights.periods[0]);
  const topOrigin = $derived(insights.origins[0]);
  const confidence = $derived(
    topCategory && topCategory.share >= 0.6 ? 'strong' : topCategory && topCategory.share >= 0.4 ? 'medium' : 'weak'
  );

  /** Règles de risque : identification probable × chacune des origines probables. */
  const risks = $derived.by(() => {
    const seen = new Map<string, { label: string; advice: string; url: string; emergency?: boolean; origin: string }>();
    for (const o of insights.origins) {
      for (const r of riskForCodes(o.code, topCategory?.code)) {
        if (!seen.has(r.id)) seen.set(r.id, { label: i18n.l(r.label), advice: i18n.l(r.advice), url: r.url, emergency: r.emergency, origin: o.code });
      }
    }
    return [...seen.values()];
  });

  const decision = $derived(lastQuery.record?.decision ?? null);

  function decide(d: Decision | null) {
    lastQuery.decide(d, {
      origins: insights.origins.map((o) => ({ code: o.code, share: Math.round(o.share * 100) / 100 })),
      category: topCategory?.code,
      period: topPeriod?.code,
      risk: risks.map((r) => r.label)
    });
  }

  const pct = (x: number) => `${Math.round(x * 100)} %`;
</script>

<section class="insights" aria-label={i18n.t('insights.title')}>
  <div class="grid">
    <div class="block">
      <h3>{i18n.t('insights.identification')}</h3>
      {#if topCategory}
        <p class="main">
          {termLabel('category', topCategory.code, L)}
          <span class="conf {confidence}">{i18n.t(`score.${confidence}`)}</span>
        </p>
        <p class="sub">
          {#if insights.materials.length}{insights.materials.slice(0, 2).map((m) => termLabel('material', m.code, L)).join(', ')}{/if}
          {#if topPeriod} · {termLabel('period', topPeriod.code, L)}{/if}
        </p>
        <ul class="bars">
          {#each insights.categories as c (c.code)}
            <li><span>{termLabel('category', c.code, L)}</span><i style="--w: {c.share * 100}%"></i><b>{pct(c.share)}</b></li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="block">
      <h3>{i18n.t('insights.provenance')}</h3>
      <ul class="bars origins">
        {#each insights.origins as o (o.code)}
          <li>
            <button type="button" class="origin" onclick={() => onfilterOrigin?.(o.code)} title={countryName(o.code, L)}>
              <span class="flag" aria-hidden="true">{flagEmoji(o.code)}</span>
              <span>{countryName(o.code, L)}</span>
            </button>
            <i style="--w: {o.share * 100}%"></i>
            <b>{pct(o.share)}</b>
          </li>
        {:else}
          <li class="none">{i18n.t('insights.unknownOrigin')}</li>
        {/each}
      </ul>
      <p class="sub">{i18n.t('insights.basedOn', { n: insights.topK })}</p>
    </div>

    <div class="block refs">
      <h3>{i18n.t('insights.references')}</h3>
      <div class="thumbs">
        {#each insights.references.slice(0, 6) as r (r.id)}
          <button type="button" class="ref" onclick={() => onopen?.(r.id)} title="{r.title} · {Math.round(r.score * 100)} %">
            <img src={r.thumbnailUrl} alt={r.title} loading="lazy" onerror={(e) => fallbackToThumb(e, r.thumbnailUrl)} />
            <span>{Math.round(r.score * 100)}</span>
            {#if r.origin}<em aria-hidden="true">{flagEmoji(r.origin)}</em>{/if}
          </button>
        {/each}
      </div>
    </div>
  </div>

  {#each risks as r (r.label)}
    <div class="risk" class:emergency={r.emergency} role="note">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
      <div>
        <p class="rl">{i18n.t('insights.risk', { label: r.label })}</p>
        <p class="ra">{r.advice}</p>
        <p class="rn">{i18n.t('insights.riskNote')} <a href={r.url} target="_blank" rel="noopener">{i18n.t('insights.riskLink')}</a></p>
      </div>
    </div>
  {/each}

  <div class="decide">
    <span class="dl">{i18n.t('insights.decide')}</span>
    {#if decision}
      <span class="done">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
        {i18n.t(`decision.${decision}`)} · {i18n.t('insights.decided')}
      </span>
      <button type="button" class="link" onclick={() => decide(null)}>{i18n.t('insights.undo')}</button>
    {:else}
      <button type="button" class="d hold" onclick={() => decide('hold')}>{i18n.t('insights.hold')}</button>
      <button type="button" class="d release" onclick={() => decide('release')}>{i18n.t('insights.release')}</button>
      <button type="button" class="d expert" onclick={() => decide('expert')}>{i18n.t('insights.expert')}</button>
    {/if}
  </div>
</section>

<style>
  .insights {
    margin-bottom: 1.1rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
  }
  .grid {
    display: grid;
    grid-template-columns: 1.1fr 1.1fr 1fr;
    gap: 1.2rem;
  }
  h3 {
    margin: 0 0 0.4rem;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .main {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .conf {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    text-transform: lowercase;
  }
  .conf.strong { background: var(--compare-soft); color: var(--compare); }
  .conf.medium { background: var(--accent-soft); color: var(--accent); }
  .conf.weak { background: var(--surface-2); color: var(--muted); }
  .sub {
    margin: 0.2rem 0 0.4rem;
    font-size: 0.82rem;
    color: var(--muted);
  }
  .bars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  .bars li {
    display: grid;
    grid-template-columns: minmax(80px, 42%) 1fr 2.6rem;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.82rem;
  }
  .bars li.none {
    display: block;
    color: var(--muted);
  }
  .bars i {
    display: block;
    height: 7px;
    border-radius: 4px;
    background: var(--surface-2);
    position: relative;
    overflow: hidden;
  }
  .bars i::after {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: var(--w);
    background: var(--accent);
    border-radius: 4px;
  }
  .bars b {
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    text-align: right;
    color: var(--muted);
  }
  .origin {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.1rem 0.3rem;
    margin-left: -0.3rem;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--fg);
    font: inherit;
    font-size: 0.82rem;
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .origin:hover {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .thumbs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4rem;
  }
  .ref {
    position: relative;
    padding: 0;
    border: none;
    border-radius: 8px;
    overflow: hidden;
    aspect-ratio: 1;
    background: var(--surface-2);
    cursor: pointer;
  }
  .ref img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .ref span {
    position: absolute;
    top: 4px;
    right: 4px;
    padding: 0 5px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface) 90%, transparent);
    font-size: 0.68rem;
    font-weight: 600;
  }
  .ref em {
    position: absolute;
    left: 4px;
    bottom: 3px;
    font-size: 0.8rem;
    font-style: normal;
  }
  .risk {
    display: flex;
    gap: 0.7rem;
    margin-top: 0.9rem;
    padding: 0.7rem 0.85rem;
    border: 1px solid #f3c48c;
    border-radius: 10px;
    background: #fff6e8;
    color: #7a3e04;
  }
  .risk.emergency {
    border-color: #f1a7a0;
    background: #fdecea;
    color: #8a1c12;
  }
  .risk svg {
    flex: none;
    margin-top: 0.1rem;
  }
  .risk p {
    margin: 0;
  }
  .rl {
    font-weight: 600;
    font-size: 0.9rem;
  }
  .ra {
    font-size: 0.85rem;
    margin-top: 0.15rem;
  }
  .rn {
    font-size: 0.75rem;
    margin-top: 0.3rem;
    opacity: 0.85;
  }
  .rn a {
    color: inherit;
  }
  :global(:root[data-theme='dark']) .risk,
  :global(:root:not([data-theme='light'])) .risk {
    background: color-mix(in srgb, #f59e0b 14%, var(--surface));
    border-color: color-mix(in srgb, #f59e0b 40%, transparent);
    color: #f6d9a8;
  }
  @media (prefers-color-scheme: light) {
    :global(:root:not([data-theme='dark'])) .risk {
      background: #fff6e8;
      border-color: #f3c48c;
      color: #7a3e04;
    }
    :global(:root:not([data-theme='dark'])) .risk.emergency {
      background: #fdecea;
      border-color: #f1a7a0;
      color: #8a1c12;
    }
  }
  .decide {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.9rem;
    padding-top: 0.8rem;
    border-top: 1px solid var(--border);
  }
  .dl {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    margin-right: 0.3rem;
  }
  .d {
    padding: 0.5rem 0.9rem;
    border: 1px solid transparent;
    border-radius: 999px;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }
  .d.hold { background: #b42318; color: #fff; }
  .d.release { background: var(--compare); color: var(--compare-ink); }
  .d.expert { background: var(--surface-2); color: var(--fg); }
  .d:hover { filter: brightness(1.08); }
  .done {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    color: var(--compare);
    font-weight: 500;
  }
  .link {
    border: none;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.8rem;
    text-decoration: underline;
    cursor: pointer;
  }
  @media (max-width: 820px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
