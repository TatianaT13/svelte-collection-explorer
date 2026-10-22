<script lang="ts">
  /** Sélecteur de langue : écrit dans le store i18n, mémorisé en localStorage. */
  import { onMount } from 'svelte';
  import { i18n, type Locale } from '$lib/i18n/index.svelte';

  // Valeur résolue après montage pour que le HTML serveur et le premier rendu client coïncident.
  let value = $state<Locale>('fr');
  onMount(() => {
    value = i18n.locale;
  });

  function change(e: Event) {
    const l = (e.currentTarget as HTMLSelectElement).value as Locale;
    value = l;
    i18n.set(l);
  }
</script>

<label class="lang">
  <span class="sr">{i18n.t('nav.language')}</span>
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>
  <select {value} onchange={change}>
    {#each i18n.locales as l (l.code)}
      <option value={l.code}>{l.label}</option>
    {/each}
  </select>
</label>

<style>
  .lang {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    height: 2.1rem;
    padding: 0 0.3rem 0 0.55rem;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface);
    color: var(--muted);
  }
  .lang:hover {
    color: var(--fg);
    background: var(--surface-2);
  }
  select {
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0.2rem 0;
  }
  select:focus {
    outline: none;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
