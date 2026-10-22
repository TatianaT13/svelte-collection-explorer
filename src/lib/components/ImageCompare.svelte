<script lang="ts">
  /**
   * Comparaison visuelle synchronisée : zoom (molette) et déplacement (glisser)
   * appliqués à toutes les images en même temps. Avec deux objets, un mode
   * superposition avec curseur d'opacité.
   */
  import type { CollectionItem } from '$lib/api/types';
  import { i18n } from '$lib/i18n/index.svelte';
  import { fallbackToThumb } from '$lib/utils/imgFallback';

  let { items }: { items: CollectionItem[] } = $props();

  let scale = $state(1);
  let tx = $state(0);
  let ty = $state(0);
  let overlay = $state(false);
  let opacity = $state(0.5);

  const MIN = 1;
  const MAX = 8;
  const canOverlay = $derived(items.length === 2);
  const transform = $derived(`translate(${tx}px, ${ty}px) scale(${scale})`);

  function reset() {
    scale = 1;
    tx = 0;
    ty = 0;
  }

  function zoomAt(factor: number, cx = 0, cy = 0) {
    const next = Math.max(MIN, Math.min(MAX, scale * factor));
    const k = next / scale;
    // garde le point (cx, cy) fixe sous le curseur
    tx = cx - (cx - tx) * k;
    ty = cy - (cy - ty) * k;
    scale = next;
    if (scale === 1) {
      tx = 0;
      ty = 0;
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const cx = e.clientX - r.left - r.width / 2;
    const cy = e.clientY - r.top - r.height / 2;
    zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, cx, cy);
  }

  let drag: { x: number; y: number; tx: number; ty: number } | null = null;
  function onDown(e: PointerEvent) {
    if (scale === 1) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, tx, ty };
  }
  function onMove(e: PointerEvent) {
    if (!drag) return;
    tx = drag.tx + (e.clientX - drag.x);
    ty = drag.ty + (e.clientY - drag.y);
  }
  function onUp() {
    drag = null;
  }
  function onDblClick() {
    if (scale === 1) zoomAt(2.5);
    else reset();
  }
</script>

<section class="vc" aria-label={i18n.t('compare.images')}>
  <header>
    <h2>{i18n.t('compare.images')}</h2>
    <div class="tools">
      <button type="button" onclick={() => zoomAt(1 / 1.4)} aria-label={i18n.t('compare.zoomOut')} title={i18n.t('compare.zoomOut')}>−</button>
      <span class="zoom">{Math.round(scale * 100)} %</span>
      <button type="button" onclick={() => zoomAt(1.4)} aria-label={i18n.t('compare.zoomIn')} title={i18n.t('compare.zoomIn')}>+</button>
      <button type="button" class="txt" onclick={reset} disabled={scale === 1}>{i18n.t('compare.reset')}</button>
      {#if canOverlay}
        <label class="switch">
          <input type="checkbox" bind:checked={overlay} />
          <span>{i18n.t('compare.overlay')}</span>
        </label>
        {#if overlay}
          <label class="range">
            <span class="sr">{i18n.t('compare.opacity')}</span>
            <input type="range" min="0" max="1" step="0.01" bind:value={opacity} />
          </label>
        {/if}
      {/if}
    </div>
  </header>

  {#if overlay && canOverlay}
    <div class="panes one">
      <div class="pane" onwheel={onWheel} onpointerdown={onDown} onpointermove={onMove} onpointerup={onUp} onpointercancel={onUp} ondblclick={onDblClick} class:grab={scale > 1} role="img" aria-label="{items[0].title} / {items[1].title}">
        <img src={items[0].imageUrl} alt="" style="transform: {transform}" draggable="false" onerror={(e) => fallbackToThumb(e, items[0].thumbnailUrl)} />
        <img src={items[1].imageUrl} alt="" style="transform: {transform}; opacity: {opacity}" draggable="false" onerror={(e) => fallbackToThumb(e, items[1].thumbnailUrl)} />
        <span class="cap">{items[0].title} <em>{Math.round((1 - opacity) * 100)} %</em> · {items[1].title} <em>{Math.round(opacity * 100)} %</em></span>
      </div>
    </div>
  {:else}
    <div class="panes" style="--n: {items.length}">
      {#each items as item (item.id)}
        <div class="pane" onwheel={onWheel} onpointerdown={onDown} onpointermove={onMove} onpointerup={onUp} onpointercancel={onUp} ondblclick={onDblClick} class:grab={scale > 1} role="img" aria-label={item.title}>
          <img src={item.imageUrl} alt="" style="transform: {transform}" draggable="false" onerror={(e) => fallbackToThumb(e, item.thumbnailUrl)} />
          <span class="cap">{item.title}</span>
        </div>
      {/each}
    </div>
  {/if}
  <p class="hint">{i18n.t('compare.hint')}</p>
</section>

<style>
  .vc {
    margin-bottom: 1.25rem;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin-bottom: 0.6rem;
  }
  h2 {
    margin: 0;
    font-size: 0.95rem;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .tools button {
    min-width: 2rem;
    height: 2rem;
    padding: 0 0.6rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--fg);
    font: inherit;
    cursor: pointer;
  }
  .tools button:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }
  .tools button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .tools .txt {
    font-size: 0.85rem;
  }
  .zoom {
    min-width: 3.2rem;
    text-align: center;
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  .switch,
  .range {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    margin-left: 0.5rem;
  }
  .switch input,
  .range input {
    accent-color: var(--compare);
  }
  .range input {
    width: 140px;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .panes {
    display: grid;
    grid-template-columns: repeat(var(--n, 1), minmax(0, 1fr));
    gap: 0.6rem;
  }
  .panes.one {
    grid-template-columns: minmax(0, 640px);
  }
  .pane {
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    touch-action: none;
    user-select: none;
  }
  .pane.grab {
    cursor: grab;
  }
  .pane.grab:active {
    cursor: grabbing;
  }
  .pane img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    transform-origin: center;
    will-change: transform;
    pointer-events: none;
  }
  .cap {
    position: absolute;
    left: 0.5rem;
    bottom: 0.5rem;
    max-width: calc(100% - 1rem);
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    background: color-mix(in srgb, var(--surface) 85%, transparent);
    font-size: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
  }
  .cap em {
    font-style: normal;
    color: var(--compare);
    font-weight: 600;
  }
  .hint {
    margin: 0.4rem 0 0;
    font-size: 0.78rem;
    color: var(--muted);
  }
  @media (max-width: 640px) {
    .panes {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
