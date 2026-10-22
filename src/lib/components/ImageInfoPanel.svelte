<script lang="ts">
  /**
   * Affiche les métadonnées lues dans l'image envoyée.
   * Permet d'exclure la position GPS avant l'envoi au backend.
   */
  import type { ImageInfo } from '$lib/api/imageInfo';
  import { i18n } from '$lib/i18n/index.svelte';

  let {
    info,
    includeGps = $bindable(true),
    sent
  }: { info: ImageInfo; includeGps?: boolean; sent?: { bytes: number; width: number; height: number; resized: boolean } } = $props();

  const t = i18n.t;

  const rows = $derived.by(() => {
    const r: { label: string; value: string }[] = [];
    r.push({ label: t('info.file'), value: `${info.mimeType || t('info.unknownType')} · ${formatBytes(info.sizeBytes)}` });
    if (info.width && info.height) r.push({ label: t('info.dimensions'), value: `${info.width} × ${info.height} px` });
    if (sent?.resized) {
      r.push({
        label: t('info.sent'),
        value: t('info.sentResized', { size: `${sent.width} × ${sent.height} px · ${formatBytes(sent.bytes)}`, orig: formatBytes(info.sizeBytes) })
      });
    }
    if (info.camera) r.push({ label: t('info.camera'), value: info.camera });
    if (info.software) r.push({ label: t('info.software'), value: info.software });
    if (info.takenAt) r.push({ label: t('info.takenAt'), value: info.takenAt.toLocaleString(i18n.locale) });
    if (info.orientation && info.orientation !== 1) r.push({ label: t('info.orientation'), value: `EXIF ${info.orientation}` });
    if (info.author) r.push({ label: t('info.author'), value: info.author });
    if (info.title) r.push({ label: t('info.titleField'), value: info.title });
    if (info.description) r.push({ label: t('info.caption'), value: info.description });
    if (info.keywords?.length) r.push({ label: t('info.keywords'), value: info.keywords.join(', ') });
    if (info.copyright) r.push({ label: t('info.copyright'), value: info.copyright });
    if (info.sha256) r.push({ label: 'SHA-256', value: info.sha256.slice(0, 16) + '…' });
    return r;
  });

  function formatBytes(n: number): string {
    const nf = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 1 });
    if (n < 1024) return `${n} ${t('unit.b')}`;
    if (n < 1024 * 1024) return `${nf.format(Math.round(n / 1024))} ${t('unit.kb')}`;
    return `${nf.format(n / 1024 / 1024)} ${t('unit.mb')}`;
  }
</script>

<section class="panel">
  <h3>{t('info.title')}</h3>

  {#if info.stripped}
    <p class="warn">{t('info.stripped')}</p>
  {/if}

  <dl>
    {#each rows as row (row.label)}
      <dt>{row.label}</dt>
      <dd title={row.value}>{row.value}</dd>
    {/each}
  </dl>

  {#if info.gps}
    <label class="gps">
      <input type="checkbox" bind:checked={includeGps} />
      <span>
        {t('info.includeGps')}<br />
        <small>{info.gps.latitude.toFixed(5)}, {info.gps.longitude.toFixed(5)}</small>
      </span>
    </label>
  {/if}

  <p class="note">{t('info.note')}</p>
</section>

<style>
  .panel {
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0.85rem;
    background: var(--surface);
    font-size: 0.82rem;
  }
  h3 {
    margin: 0 0 0.5rem;
    font-size: 0.9rem;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.2rem 0.6rem;
    margin: 0;
  }
  dt {
    color: var(--muted);
    white-space: nowrap;
  }
  dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .warn {
    margin: 0 0 0.5rem;
    padding: 0.4rem 0.5rem;
    border-radius: 6px;
    background: color-mix(in srgb, #f59e0b 15%, transparent);
    color: var(--fg);
  }
  .gps {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    margin-top: 0.6rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--border);
  }
  .gps small {
    color: var(--muted);
  }
  .note {
    margin: 0.6rem 0 0;
    color: var(--muted);
    font-size: 0.75rem;
  }
</style>
