<script lang="ts">
  /**
   * Zone de dépôt / sélection d'image, avec recadrage :
   * tracer un cadre sur l'aperçu limite la recherche à cette zone.
   * `file` est toujours l'original ; `oncrop` reçoit la zone découpée (ou null).
   */
  import { i18n } from '$lib/i18n/index.svelte';

  let {
    file = $bindable<File | null>(null),
    onchange,
    oncrop
  }: { file?: File | null; onchange?: (f: File | null) => void; oncrop?: (f: File | null) => void } = $props();

  let dragging = $state(false);
  let inputEl: HTMLInputElement;
  let cameraEl: HTMLInputElement;
  let imgEl = $state<HTMLImageElement | null>(null);

  const previewUrl = $derived(file ? URL.createObjectURL(file) : null);

  // Cadre de recadrage en fractions (0..1) de l'image affichée.
  interface Rect { x: number; y: number; w: number; h: number }
  let sel = $state<Rect | null>(null);
  let applied = $state(false);
  let drawing: { x0: number; y0: number; moved: boolean } | null = null;

  function setFile(f: File | null) {
    if (f && !f.type.startsWith('image/')) return;
    file = f;
    sel = null;
    applied = false;
    oncrop?.(null);
    onchange?.(f);
  }

  function onInput(e: Event) {
    const target = e.target as HTMLInputElement;
    setFile(target.files?.[0] ?? null);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragging = false;
    setFile(e.dataTransfer?.files?.[0] ?? null);
  }

  function clear() {
    setFile(null);
    inputEl.value = '';
    if (cameraEl) cameraEl.value = '';
  }

  const clamp = (v: number) => Math.max(0, Math.min(1, v));

  function frac(e: PointerEvent) {
    const r = imgEl!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  }

  function onDown(e: PointerEvent) {
    if (!imgEl) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = frac(e);
    drawing = { x0: p.x, y0: p.y, moved: false };
    sel = { x: p.x, y: p.y, w: 0, h: 0 };
    applied = false;
  }
  function onMove(e: PointerEvent) {
    if (!drawing) return;
    const p = frac(e);
    drawing.moved = true;
    sel = { x: Math.min(p.x, drawing.x0), y: Math.min(p.y, drawing.y0), w: Math.abs(p.x - drawing.x0), h: Math.abs(p.y - drawing.y0) };
  }
  function onUp() {
    if (!drawing) return;
    if (!drawing.moved || !sel || sel.w < 0.04 || sel.h < 0.04) {
      sel = null;
      if (applied) oncrop?.(null);
      applied = false;
    }
    drawing = null;
  }

  async function applyCrop() {
    if (!file || !sel || !imgEl) return;
    const img = new Image();
    img.src = previewUrl!;
    await img.decode();
    const sx = Math.round(sel.x * img.naturalWidth);
    const sy = Math.round(sel.y * img.naturalHeight);
    const sw = Math.max(1, Math.round(sel.w * img.naturalWidth));
    const sh = Math.max(1, Math.round(sel.h * img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
    if (!blob) return;
    applied = true;
    oncrop?.(new File([blob], file.name.replace(/\.[^.]+$/, '') + '-zone.jpg', { type: 'image/jpeg' }));
  }

  function clearCrop() {
    sel = null;
    applied = false;
    oncrop?.(null);
  }

  const selPct = $derived(sel ? Math.round(sel.w * sel.h * 100) : 0);
</script>

<div
  class="dropzone"
  class:dragging
  class:has-file={!!file}
  role="group"
  aria-label={i18n.t('upload.drop')}
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  ondrop={onDrop}
>
  <input bind:this={inputEl} type="file" accept="image/*" hidden onchange={onInput} />
  <input bind:this={cameraEl} type="file" accept="image/*" capture="environment" hidden onchange={onInput} />

  {#if previewUrl}
    <div class="stage" onpointerdown={onDown} onpointermove={onMove} onpointerup={onUp} onpointercancel={onUp} role="application" aria-label={i18n.t('upload.cropHint')}>
      <img bind:this={imgEl} src={previewUrl} alt={i18n.t('upload.preview')} draggable="false" />
      {#if sel}
        <div class="shade" style="clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 {sel.y * 100}%, {sel.x * 100}% {sel.y * 100}%, {sel.x * 100}% {(sel.y + sel.h) * 100}%, {(sel.x + sel.w) * 100}% {(sel.y + sel.h) * 100}%, {(sel.x + sel.w) * 100}% {sel.y * 100}%, 0 {sel.y * 100}%)"></div>
        <div class="frame" class:applied style="left: {sel.x * 100}%; top: {sel.y * 100}%; width: {sel.w * 100}%; height: {sel.h * 100}%"></div>
      {/if}
    </div>
    <div class="meta">
      <span class="name" title={file?.name}>{file?.name}</span>
      <span class="links">
        <button type="button" class="link" onclick={() => inputEl.click()}>{i18n.t('upload.change')}</button>
        <button type="button" class="link" onclick={clear}>{i18n.t('upload.remove')}</button>
      </span>
    </div>
    {#if sel && sel.w >= 0.04 && sel.h >= 0.04}
      <div class="crop-actions">
        {#if applied}
          <span class="ok">{i18n.t('upload.cropApplied', { pct: selPct })}</span>
          <button type="button" class="link" onclick={clearCrop}>{i18n.t('upload.cropClear')}</button>
        {:else}
          <button type="button" class="btn" onclick={applyCrop}>{i18n.t('upload.crop', { pct: selPct })}</button>
          <button type="button" class="link" onclick={clearCrop}>{i18n.t('upload.cropCancel')}</button>
        {/if}
      </div>
    {:else}
      <p class="crop-hint">{i18n.t('upload.cropHint')}</p>
    {/if}
  {:else}
    <button type="button" class="pick" onclick={() => inputEl.click()}>
      <strong>{i18n.t('upload.drop')}</strong> {i18n.t('upload.orClick')}<br />
      <small>{i18n.t('upload.paste')}</small>
    </button>
    <button type="button" class="camera" onclick={() => cameraEl.click()}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>
      {i18n.t('upload.camera')}
    </button>
  {/if}
</div>

<style>
  .dropzone {
    border: 2px dashed var(--border);
    border-radius: 12px;
    padding: 0.75rem;
    text-align: center;
    background: var(--surface);
    transition: border-color 0.15s, background 0.15s;
  }
  .dropzone:has(.pick:hover),
  .dropzone.dragging {
    border-color: var(--accent);
    background: var(--surface-2);
  }
  .pick {
    display: block;
    width: 100%;
    padding: 0.6rem 0.25rem 0.4rem;
    border: none;
    background: none;
    color: var(--muted);
    font: inherit;
    line-height: 1.4;
    cursor: pointer;
  }
  .pick strong {
    color: var(--fg);
  }
  .stage {
    position: relative;
    display: inline-block;
    max-width: 100%;
    line-height: 0;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
  }
  .stage img {
    max-width: 100%;
    max-height: 220px;
    border-radius: 6px;
    object-fit: contain;
  }
  .shade {
    position: absolute;
    inset: 0;
    background: rgb(0 0 0 / 0.45);
    border-radius: 6px;
    pointer-events: none;
  }
  .frame {
    position: absolute;
    border: 2px solid #fff;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.4);
    pointer-events: none;
  }
  .frame.applied {
    border-color: var(--compare);
  }
  .meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    font-size: 0.82rem;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .links {
    display: inline-flex;
    gap: 0.6rem;
    flex: none;
  }
  .crop-hint {
    margin: 0.4rem 0 0;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .crop-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.7rem;
    margin-top: 0.5rem;
    font-size: 0.82rem;
  }
  .ok {
    color: var(--compare);
    font-weight: 500;
  }
  .btn {
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--accent);
    border-radius: 8px;
    background: var(--accent);
    color: #fff;
    font: inherit;
    font-size: 0.82rem;
    cursor: pointer;
  }
  .link {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    padding: 0;
    font: inherit;
    font-size: inherit;
  }
  .camera {
    display: none;
    align-items: center;
    gap: 0.4rem;
    margin: 0.4rem auto 0;
    padding: 0.5rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface);
    color: var(--fg);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  @media (hover: none) and (pointer: coarse) {
    .camera {
      display: inline-flex;
    }
  }
</style>
