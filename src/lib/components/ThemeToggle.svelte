<script lang="ts">
  import { onMount } from 'svelte';
  import { theme } from '$lib/stores/theme.svelte';
  import { i18n } from '$lib/i18n/index.svelte';

  // Résolu après montage pour éviter un écart SSR / client.
  let dark = $state(false);
  onMount(() => {
    dark = theme.resolved() === 'dark';
  });

  function toggle() {
    theme.toggle();
    dark = theme.resolved() === 'dark';
  }
</script>

<button type="button" class="toggle" onclick={toggle} aria-label={dark ? i18n.t('theme.toLight') : i18n.t('theme.toDark')} title={dark ? i18n.t('theme.light') : i18n.t('theme.dark')}>
  {#if dark}
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
  {:else}
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
  {/if}
</button>

<style>
  .toggle {
    display: grid;
    place-items: center;
    width: 2.1rem;
    height: 2.1rem;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
  }
  .toggle:hover {
    color: var(--fg);
    background: var(--surface-2);
  }
</style>
