<script lang="ts">
  /**
   * Zone de dépôt / sélection d'image.
   * Émet le fichier choisi via la prop callback `onchange`.
   */
  import { i18n } from '$lib/i18n/index.svelte';

  let { file = $bindable<File | null>(null), onchange }: { file?: File | null; onchange?: (f: File | null) => void } = $props();

  let dragging = $state(false);
  let inputEl: HTMLInputElement;
  let cameraEl: HTMLInputElement;

  const previewUrl = $derived(file ? URL.createObjectURL(file) : null);

  function setFile(f: File | null) {
    if (f && !f.type.startsWith('image/')) return;
    file = f;
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
</script>

<div
  class="dropzone"
  class:dragging
  role="button"
  tabindex="0"
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  ondrop={onDrop}
  onclick={() => inputEl.click()}
  onkeydown={(e) => e.key === 'Enter' && inputEl.click()}
>
  <input bind:this={inputEl} type="file" accept="image/*" hidden onchange={onInput} />
  <input bind:this={cameraEl} type="file" accept="image/*" capture="environment" hidden onchange={onInput} />

  {#if previewUrl}
    <img src={previewUrl} alt={i18n.t('upload.preview')} />
    <div class="meta">
      <span class="name">{file?.name}</span>
      <button type="button" class="link" onclick={(e) => { e.stopPropagation(); clear(); }}>{i18n.t('upload.remove')}</button>
    </div>
  {:else}
    <p class="hint">
      <strong>{i18n.t('upload.drop')}</strong> {i18n.t('upload.orClick')}<br />
      <small>{i18n.t('upload.paste')}</small>
    </p>
    <button type="button" class="camera" onclick={(e) => { e.stopPropagation(); cameraEl.click(); }}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>
      {i18n.t('upload.camera')}
    </button>
  {/if}
</div>

<style>
  .dropzone {
    border: 2px dashed var(--border);
    border-radius: 12px;
    padding: 1.1rem 1rem;
    text-align: center;
    cursor: pointer;
    background: var(--surface);
    transition: border-color 0.15s, background 0.15s;
  }
  .dropzone:hover,
  .dropzone.dragging {
    border-color: var(--accent);
    background: var(--surface-2);
  }
  img {
    max-width: 100%;
    max-height: 180px;
    border-radius: 6px;
    object-fit: contain;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    font-size: 0.85rem;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hint {
    margin: 0.5rem 0;
    color: var(--muted);
  }
  .link {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    padding: 0;
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
  /* Visible seulement sur les écrans tactiles, où une caméra est probable. */
  @media (hover: none) and (pointer: coarse) {
    .camera {
      display: inline-flex;
    }
  }
</style>
