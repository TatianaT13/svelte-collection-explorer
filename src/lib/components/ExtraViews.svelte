<script lang="ts">
  /** Vues supplémentaires du même objet (dos, marque, détail), fusionnées avec la photo principale. */
  import { i18n } from '$lib/i18n/index.svelte';

  let { views = $bindable<File[]>([]), max = 3 }: { views?: File[]; max?: number } = $props();
  let inputEl: HTMLInputElement;

  function add(e: Event) {
    const files = [...((e.target as HTMLInputElement).files ?? [])].filter((f) => f.type.startsWith('image/'));
    views = [...views, ...files].slice(0, max);
    inputEl.value = '';
  }
  function remove(i: number) {
    views = views.filter((_, k) => k !== i);
  }
</script>

<div class="views">
  <input bind:this={inputEl} type="file" accept="image/*" multiple hidden onchange={add} />
  {#if views.length}
    <ul>
      {#each views as v, i (v.name + v.size + i)}
        <li>
          <img src={URL.createObjectURL(v)} alt="" />
          <button type="button" aria-label={i18n.t('upload.remove')} onclick={() => remove(i)}>×</button>
        </li>
      {/each}
    </ul>
  {/if}
  {#if views.length < max}
    <button type="button" class="add" onclick={() => inputEl.click()}>＋ {i18n.t('control.extraView')}</button>
  {/if}
</div>

<style>
  .views {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  ul {
    display: flex;
    gap: 0.4rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    position: relative;
    width: 56px;
    height: 56px;
    border-radius: 8px;
    overflow: hidden;
    background: var(--surface-2);
  }
  li img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  li button {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 50%;
    background: rgb(0 0 0 / 0.6);
    color: #fff;
    font-size: 0.8rem;
    line-height: 1;
    cursor: pointer;
  }
  .add {
    width: 100%;
    padding: 0.7rem;
    border: none;
    border-radius: 12px;
    background: var(--surface-2);
    color: var(--fg);
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .add:hover {
    filter: brightness(0.97);
  }
</style>
