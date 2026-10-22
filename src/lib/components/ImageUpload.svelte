<script lang="ts">
  /**
   * Zone de dépôt / sélection d'image.
   * Émet le fichier choisi via la prop callback `onchange`.
   */
  let { file = $bindable<File | null>(null), onchange }: { file?: File | null; onchange?: (f: File | null) => void } = $props();

  let dragging = $state(false);
  let inputEl: HTMLInputElement;

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
    dragging = false;
    setFile(e.dataTransfer?.files?.[0] ?? null);
  }

  function clear() {
    setFile(null);
    inputEl.value = '';
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

  {#if previewUrl}
    <img src={previewUrl} alt="Aperçu" />
    <div class="meta">
      <span class="name">{file?.name}</span>
      <button type="button" class="link" onclick={(e) => { e.stopPropagation(); clear(); }}>Retirer</button>
    </div>
  {:else}
    <p class="hint">
      <strong>Déposer une image</strong> ou cliquer pour choisir<br />
      <small>Recherche visuelle dans la collection</small>
    </p>
  {/if}
</div>

<style>
  .dropzone {
    border: 2px dashed var(--border);
    border-radius: 10px;
    padding: 1rem;
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
</style>
