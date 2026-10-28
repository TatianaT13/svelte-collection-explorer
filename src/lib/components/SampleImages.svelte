<script lang="ts">
  /**
   * « Essayer avec une image d'exemple » : vues alternatives d'objets du jeu de données.
   * Le visiteur découvre la recherche visuelle sans préparer de photo.
   */
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { i18n } from '$lib/i18n/index.svelte';

  let { onpick }: { onpick: (file: File) => void } = $props();

  interface Sample { file: string; objectId: string; title: string; }
  let samples = $state<Sample[]>([]);
  let busy = $state<string | null>(null);

  onMount(async () => {
    try {
      const r = await fetch(`${base}/data/samples.json`);
      if (r.ok) samples = (await r.json()).samples ?? [];
    } catch {
      /* pas d'exemples */
    }
  });

  async function pick(s: Sample) {
    busy = s.objectId;
    try {
      const r = await fetch(`${base}/${s.file}`);
      const blob = await r.blob();
      onpick(new File([blob], `exemple-${s.objectId}.jpg`, { type: blob.type || 'image/jpeg' }));
    } finally {
      busy = null;
    }
  }
</script>

{#if samples.length}
  <div class="samples">
    <p>{i18n.t('samples.title')}</p>
    <ul>
      {#each samples as s (s.objectId)}
        <li>
          <button type="button" onclick={() => pick(s)} disabled={busy !== null} title={s.title} aria-label="{i18n.t('samples.try')} : {s.title}">
            <img src="{base}/{s.file}" alt="" loading="lazy" />
            {#if busy === s.objectId}<span class="spin" aria-hidden="true"></span>{/if}
          </button>
        </li>
      {/each}
    </ul>
    <small>{i18n.t('samples.note')}</small>
  </div>
{/if}

<style>
  .samples p {
    margin: 0 0 0.4rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--fg);
  }
  ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
    gap: 0.4rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  button {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 8px;
    overflow: hidden;
    background: var(--surface-2);
    cursor: pointer;
    transition: border-color 0.12s, transform 0.12s;
  }
  button:hover:not(:disabled) {
    border-color: var(--accent);
    transform: translateY(-1px);
  }
  button:disabled {
    cursor: wait;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .spin {
    position: absolute;
    inset: 0;
    background: rgb(255 255 255 / 0.5);
  }
  small {
    display: block;
    margin-top: 0.35rem;
    font-size: 0.72rem;
    color: var(--muted);
  }
</style>
