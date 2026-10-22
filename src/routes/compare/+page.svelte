<script lang="ts">
  /**
   * Page Comparer : objets sélectionnés côte à côte, champs groupés,
   * différences surlignées, option "différences seulement", copie du tableau.
   */
  import { compare } from '$lib/stores/compare.svelte';
  import { fieldGroups } from '$lib/config/schema';
  import { formatValue, fieldLabel } from '$lib/utils/labels';
  import { i18n } from '$lib/i18n/index.svelte';
  import { fallbackToThumb } from '$lib/utils/imgFallback';
  import { base } from '$app/paths';
  import { flagEmoji } from '$lib/utils/flag';
  import MetadataValue from '$lib/components/MetadataValue.svelte';
  import ScoreRing from '$lib/components/ScoreRing.svelte';
  import ImageCompare from '$lib/components/ImageCompare.svelte';
  import { lastQuery } from '$lib/stores/query.svelte';
  import { schema } from '$lib/config/schema';
  import { buildCaseFile, caseFileName, downloadJson } from '$lib/utils/caseFile';

  const items = $derived(compare.items);
  let onlyDiff = $state(false);
  let copied = $state(false);

  function differs(key: string): boolean {
    if (items.length < 2) return false;
    const first = JSON.stringify(items[0].metadata[key] ?? null);
    return items.some((it) => JSON.stringify(it.metadata[key] ?? null) !== first);
  }

  const visibleGroups = $derived(
    fieldGroups
      .map((g) => ({ group: g.group, fields: onlyDiff ? g.fields.filter((f) => differs(f.key)) : g.fields }))
      .filter((g) => g.fields.length > 0)
  );

  const diffCount = $derived(fieldGroups.flatMap((g) => g.fields).filter((f) => differs(f.key)).length);

  function exportCase() {
    downloadJson(caseFileName(), buildCaseFile(items));
  }

  async function copyTable() {
    const rows: string[][] = [[i18n.t('compare.field'), ...items.map((it) => it.title)]];
    for (const g of visibleGroups) {
      for (const f of g.fields) rows.push([fieldLabel(f), ...items.map((it) => formatValue(f, it.metadata[f.key]))]);
    }
    const tsv = rows.map((r) => r.join('\t')).join('\n');
    try {
      await navigator.clipboard.writeText(tsv);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      /* presse-papiers indisponible */
    }
  }
</script>

<svelte:head>
  <title>{i18n.t('compare.titleTag', { n: items.length })}</title>
</svelte:head>

<header class="head">
  <div>
    <h1>{i18n.t('compare.title')}</h1>
    <p class="muted">
      {i18n.t('compare.count', { n: items.length, max: compare.max })}
      {#if items.length >= 2} · {i18n.t('compare.diff', { n: diffCount })}{/if}
    </p>
  </div>
  {#if items.length}
    <div class="actions">
      {#if items.length >= 2}
        <label class="switch">
          <input type="checkbox" bind:checked={onlyDiff} />
          <span>{i18n.t('compare.onlyDiff')}</span>
        </label>
      {/if}
      <button type="button" class="btn" onclick={copyTable} disabled={!items.length}>
        {copied ? i18n.t('compare.copied') : i18n.t('compare.copy')}
      </button>
      <button type="button" class="btn" onclick={exportCase}>{i18n.t('compare.export')}</button>
      <button type="button" class="btn" onclick={() => window.print()}>{i18n.t('compare.print')}</button>
      <button type="button" class="btn ghost" onclick={() => compare.clear()}>{i18n.t('compare.clear')}</button>
    </div>
  {/if}
</header>

{#if items.length === 0}
  <div class="empty">
    <p><strong>{i18n.t('compare.empty')}</strong></p>
    <p class="muted">{i18n.t('compare.emptyHint', { max: compare.max })}</p>
    <a class="btn" href="{base}/">{i18n.t('compare.goExplore')}</a>
  </div>
{:else}
  {#if items.length === 1}
    <p class="hint">{i18n.t('compare.oneHint')} <a href="{base}/">{i18n.t('compare.back')}</a></p>
  {/if}
  {#if lastQuery.record}
    <p class="query">
      <strong>{i18n.t('compare.query')}</strong> : {lastQuery.record.fileName}
      {#if lastQuery.record.cropped}({i18n.t('compare.queryCropped')}){/if}
      {#if lastQuery.record.sha256}<code>SHA-256 {lastQuery.record.sha256.slice(0, 16)}…</code>{/if}
      {#if lastQuery.record.decision}<span class="decision">{i18n.t(`decision.${lastQuery.record.decision}`)}</span>{/if}
    </p>
  {/if}
  {#if items.length >= 2}
    <ImageCompare {items} />
  {/if}
  <div class="scroller">
    <table style="--cols: {items.length}">
      <thead>
        <tr>
          <th class="label"></th>
          {#each items as item (item.id)}
            <th>
              <img src={item.imageUrl} alt={item.title} onerror={(e) => fallbackToThumb(e, item.thumbnailUrl)} />
              <div class="title">
                {#if item.metadata.origin}<span aria-hidden="true">{flagEmoji(String(item.metadata.origin))}</span>{/if}
                {item.title}
                {#if item.score !== undefined}<ScoreRing score={item.score} size={30} />{/if}
              </div>
              <button type="button" class="link" onclick={() => compare.remove(item.id)}>{i18n.t('compare.remove')}</button>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each visibleGroups as group (group.group?.id ?? '')}
          {#if group.group}
            <tr class="group">
              <th colspan={items.length + 1}>{i18n.l(group.group.label)}</th>
            </tr>
          {/if}
          {#each group.fields as field (field.key)}
            <tr class:diff={differs(field.key)}>
              <th class="label">{fieldLabel(field)}</th>
              {#each items as item (item.id)}
                <td><MetadataValue {field} value={item.metadata[field.key]} /></td>
              {/each}
            </tr>
          {/each}
        {/each}
        {#if onlyDiff && visibleGroups.length === 0}
          <tr><td colspan={items.length + 1} class="none">{i18n.t('compare.noDiff')}</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-bottom: 1.2rem;
  }
  h1 {
    font-size: 1.45rem;
    letter-spacing: -0.01em;
    margin: 0;
  }
  .muted {
    color: var(--muted);
    font-size: 0.88rem;
    margin: 0.2rem 0 0;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.88rem;
    cursor: pointer;
    user-select: none;
  }
  .switch input {
    accent-color: var(--accent);
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
    text-decoration: none;
  }
  .btn:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }
  .btn.ghost {
    border-color: transparent;
    color: var(--muted);
  }
  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
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
  .hint {
    font-size: 0.88rem;
    color: var(--muted);
    margin: 0 0 1rem;
  }
  .query {
    margin: 0 0 1rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .query code {
    margin-left: 0.5rem;
    font-size: 0.75rem;
  }
  .decision {
    margin-left: 0.6rem;
    padding: 0.1rem 0.55rem;
    border-radius: 999px;
    background: var(--compare-soft);
    color: var(--compare);
    font-weight: 600;
    font-size: 0.78rem;
  }
  @media print {
    .actions,
    .hint,
    :global(nav),
    :global(.tray),
    :global(.vc .tools),
    :global(.vc .hint),
    .link {
      display: none !important;
    }
    :global(body) {
      background: #fff;
      color: #000;
    }
    .scroller {
      border: none;
      overflow: visible;
    }
    table {
      min-width: 0;
    }
    thead th {
      position: static;
    }
    tr.diff td {
      background: #eef2ff;
    }
    thead img {
      max-width: 160px;
      height: 110px;
    }
    :global(.vc .panes) {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .scroller {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    min-width: calc(180px + var(--cols) * 220px);
  }
  th,
  td {
    padding: 0.6rem 0.85rem;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
    text-align: left;
    font-size: 0.9rem;
  }
  thead th {
    background: var(--surface);
    position: sticky;
    top: 3.4rem;
    z-index: 1;
    padding-top: 0.85rem;
  }
  th.label {
    width: 180px;
    color: var(--muted);
    font-weight: 500;
    font-size: 0.84rem;
  }
  thead img {
    display: block;
    width: 100%;
    max-width: 260px;
    height: 150px;
    object-fit: cover;
    border-radius: 10px;
    background: var(--surface-2);
  }
  .title {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0.55rem 0 0.2rem;
    font-weight: 600;
  }
  tr.group th {
    padding-top: 1rem;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    background: var(--bg);
  }
  tr.diff td {
    background: var(--accent-soft);
  }
  tr.diff th.label::before {
    content: '●';
    margin-right: 0.4rem;
    font-size: 0.5rem;
    vertical-align: middle;
    color: var(--accent);
  }
  td.none {
    text-align: center;
    color: var(--muted);
    padding: 2rem;
  }
  .link {
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    font: inherit;
    font-size: 0.82rem;
    padding: 0;
  }
  .link:hover {
    color: var(--accent);
  }
</style>
