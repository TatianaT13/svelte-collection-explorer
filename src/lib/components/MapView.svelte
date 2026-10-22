<script lang="ts">
  /**
   * Carte des résultats : un cercle par lieu, taille selon le nombre d'objets,
   * teinte selon le meilleur score. Le lieu de la photo (GPS EXIF, si l'agent l'a autorisé)
   * est un marqueur distinct : il dit où la photo a été prise, jamais d'où vient l'objet.
   * Leaflet est chargé à la demande ; fond de carte OpenStreetMap (réseau).
   */
  import { onMount } from 'svelte';
  import type { GeoBucket } from '$lib/api/types';
  import { places } from '$lib/stores/places.svelte';
  import { i18n } from '$lib/i18n/index.svelte';
  import { schema } from '$lib/config/schema';

  let {
    buckets,
    photo,
    onselect
  }: { buckets: GeoBucket[]; photo?: { latitude: number; longitude: number } | null; onselect?: (place: string) => void } = $props();

  let el: HTMLDivElement;
  let map: import('leaflet').Map | null = null;
  let layer: import('leaflet').LayerGroup | null = null;
  let Lmod: typeof import('leaflet') | null = null;
  let ready = $state(false);

  onMount(() => {
    let alive = true;
    Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([L]) => {
      if (!alive) return;
      Lmod = L;
      map = L.map(el, { worldCopyJump: true, zoomControl: true, attributionControl: true }).setView([30, 20], 2);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 12,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(map);
      layer = L.layerGroup().addTo(map);
      ready = true;
      draw();
    });
    return () => {
      alive = false;
      map?.remove();
      map = null;
    };
  });

  function colorFor(score?: number): string {
    if (score === undefined) return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3457d5';
    if (score >= schema.similarity.strong) return '#0f7b70';
    if (score >= schema.similarity.medium) return '#3457d5';
    return '#9a9ea6';
  }

  function draw() {
    if (!map || !layer || !Lmod) return;
    const L = Lmod;
    layer.clearLayers();
    const bounds: [number, number][] = [];
    const lang = i18n.locale;
    for (const b of buckets) {
      const n = places.get(b.place);
      if (!n || n.lat === undefined || n.lon === undefined) continue;
      const isCountry = places.isCountry(b.place);
      const r = Math.min(26, 7 + Math.sqrt(b.count) * 5);
      const m = L.circleMarker([n.lat, n.lon], {
        radius: r,
        color: colorFor(b.bestScore),
        weight: 2,
        fillColor: colorFor(b.bestScore),
        fillOpacity: isCountry ? 0.18 : 0.45,
        dashArray: isCountry ? '4 4' : undefined
      });
      const title = places.fullLabel(b.place, lang);
      const score = b.bestScore !== undefined ? ` · ${i18n.t('map.best', { pct: Math.round(b.bestScore * 100) })}` : '';
      m.bindTooltip(`<b>${title}</b><br>${i18n.t('map.objects', { n: b.count })}${score}${isCountry ? `<br><i>${i18n.t('map.countryOnly')}</i>` : ''}`, { direction: 'top' });
      m.on('click', () => onselect?.(b.place));
      m.addTo(layer);
      bounds.push([n.lat, n.lon]);
    }
    if (photo) {
      const p = L.circleMarker([photo.latitude, photo.longitude], { radius: 8, color: '#b42318', weight: 3, fillColor: '#fff', fillOpacity: 1 });
      p.bindTooltip(`<b>${i18n.t('map.photo')}</b><br>${i18n.t('map.photoNote')}`, { direction: 'top', permanent: false });
      p.addTo(layer);
      bounds.push([photo.latitude, photo.longitude]);
    }
    if (bounds.length) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 6 });
  }

  $effect(() => {
    void buckets;
    void photo;
    void places.version;
    void i18n.locale;
    if (ready) draw();
  });
</script>

<div class="map">
  <div bind:this={el} class="canvas" role="region" aria-label={i18n.t('map.title')}></div>
  <div class="legend">
    <span><i class="dot strong"></i>{i18n.t('score.strong')}</span>
    <span><i class="dot medium"></i>{i18n.t('score.medium')}</span>
    <span><i class="dot weak"></i>{i18n.t('score.weak')}</span>
    <span><i class="dot country"></i>{i18n.t('map.countryOnly')}</span>
    {#if photo}<span><i class="dot photo"></i>{i18n.t('map.photo')}</span>{/if}
  </div>
</div>

<style>
  .map {
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    background: var(--surface);
  }
  .canvas {
    height: 340px;
    background: var(--surface-2);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.9rem;
    padding: 0.45rem 0.8rem;
    font-size: 0.75rem;
    color: var(--muted);
    border-top: 1px solid var(--border);
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
  }
  .dot.strong { background: #0f7b70; }
  .dot.medium { background: #3457d5; }
  .dot.weak { background: #9a9ea6; }
  .dot.country { border: 2px dashed var(--muted); }
  .dot.photo { background: #fff; border: 3px solid #b42318; }
  :global(.leaflet-container) {
    font: inherit;
  }
  :global(:root[data-theme='dark']) .canvas :global(.leaflet-tile-pane),
  :global(:root:not([data-theme='light'])) .canvas :global(.leaflet-tile-pane) {
    filter: brightness(0.85) saturate(0.8);
  }
  @media (prefers-color-scheme: light) {
    :global(:root:not([data-theme='dark'])) .canvas :global(.leaflet-tile-pane) {
      filter: none;
    }
  }
</style>
