<script lang="ts">
  /**
   * Affiche les métadonnées lues dans l'image envoyée.
   * Permet d'exclure la position GPS avant l'envoi au backend.
   */
  import type { ImageInfo } from '$lib/api/imageInfo';

  let { info, includeGps = $bindable(true) }: { info: ImageInfo; includeGps?: boolean } = $props();

  const rows = $derived.by(() => {
    const r: { label: string; value: string }[] = [];
    r.push({ label: 'Fichier', value: `${info.mimeType || 'type inconnu'} · ${formatBytes(info.sizeBytes)}` });
    if (info.width && info.height) r.push({ label: 'Dimensions', value: `${info.width} × ${info.height} px` });
    if (info.camera) r.push({ label: 'Appareil', value: info.camera });
    if (info.software) r.push({ label: 'Logiciel', value: info.software });
    if (info.takenAt) r.push({ label: 'Prise le', value: info.takenAt.toLocaleString('fr-FR') });
    if (info.orientation && info.orientation !== 1) r.push({ label: 'Orientation', value: `EXIF ${info.orientation}` });
    if (info.author) r.push({ label: 'Auteur', value: info.author });
    if (info.title) r.push({ label: 'Titre', value: info.title });
    if (info.description) r.push({ label: 'Légende', value: info.description });
    if (info.keywords?.length) r.push({ label: 'Mots-clés', value: info.keywords.join(', ') });
    if (info.copyright) r.push({ label: 'Copyright', value: info.copyright });
    if (info.sha256) r.push({ label: 'SHA-256', value: info.sha256.slice(0, 16) + '…' });
    return r;
  });

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} o`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
    return `${(n / 1024 / 1024).toFixed(1)} Mo`;
  }
</script>

<section class="panel">
  <h3>Métadonnées de l'image</h3>

  {#if info.stripped}
    <p class="warn">Aucune métadonnée EXIF/IPTC trouvée : image probablement passée par une messagerie, un réseau social ou une capture d'écran.</p>
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
        Inclure la position GPS<br />
        <small>{info.gps.latitude.toFixed(5)}, {info.gps.longitude.toFixed(5)}</small>
      </span>
    </label>
  {/if}

  <p class="note">Indicatif : ces champs peuvent être absents ou modifiés. Le serveur fait l'extraction de référence.</p>
</section>

<style>
  .panel {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.75rem;
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
