<script lang="ts">
  import { page } from '$app/state';
  import { compare } from '$lib/stores/compare.svelte';
  import { schema } from '$lib/config/schema';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import CompareTray from '$lib/components/CompareTray.svelte';

  let { children } = $props();
  const onCompare = $derived(page.url.pathname === '/compare');
</script>

<svelte:head>
  <title>{schema.name} · Explorer</title>
</svelte:head>

<a class="skip" href="#main">Aller au contenu</a>

<nav>
  <a href="/" class="brand">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
    <span>{schema.name}</span>
  </a>
  <div class="links">
    <a href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined}>Explorer</a>
    <a href="/compare" aria-current={onCompare ? 'page' : undefined}>
      Comparer
      {#if compare.count}<span class="badge">{compare.count}</span>{/if}
    </a>
    <ThemeToggle />
  </div>
</nav>

<main id="main">
  {@render children()}
</main>

{#if !onCompare}
  <CompareTray />
{/if}

<style>
  :global(:root) {
    --bg: #f6f5f2;
    --surface: #ffffff;
    --surface-2: #eeede9;
    --fg: #1b1c1f;
    --muted: #6a6e75;
    --border: #e1dfd9;
    --accent: #3457d5;
    --accent-hover: #2a48b8;
    --accent-soft: #e8edfb;
    --skeleton: #e8e6e1;
    --shadow: 0 1px 2px rgb(0 0 0 / 0.04);
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) {
      --bg: #111214;
      --surface: #191b1f;
      --surface-2: #23262c;
      --fg: #e9e9eb;
      --muted: #9a9ea6;
      --border: #2b2f36;
      --accent: #7c96ff;
      --accent-hover: #93a9ff;
      --accent-soft: #232a45;
      --skeleton: #262a31;
      color-scheme: dark;
    }
  }
  :global(:root[data-theme='dark']) {
    --bg: #111214;
    --surface: #191b1f;
    --surface-2: #23262c;
    --fg: #e9e9eb;
    --muted: #9a9ea6;
    --border: #2b2f36;
    --accent: #7c96ff;
    --accent-hover: #93a9ff;
    --accent-soft: #232a45;
    --skeleton: #262a31;
    color-scheme: dark;
  }
  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    font-size: 15px;
    line-height: 1.4;
    -webkit-font-smoothing: antialiased;
  }
  :global(:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  :global(::selection) {
    background: var(--accent-soft);
  }
  .skip {
    position: absolute;
    left: -999px;
    top: 0.5rem;
    padding: 0.5rem 0.8rem;
    background: var(--surface);
    border-radius: 8px;
    z-index: 100;
  }
  .skip:focus {
    left: 0.5rem;
  }
  nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.6rem 1.2rem;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--surface) 85%, transparent);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    text-decoration: none;
    color: var(--fg);
  }
  .brand svg {
    color: var(--accent);
  }
  .links {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .links a {
    text-decoration: none;
    color: var(--muted);
    padding: 0.4rem 0.7rem;
    border-radius: 8px;
    font-weight: 500;
  }
  .links a:hover {
    color: var(--fg);
  }
  .links a[aria-current='page'] {
    color: var(--fg);
    background: var(--surface-2);
  }
  .badge {
    display: inline-block;
    min-width: 1.4em;
    padding: 0 0.4em;
    margin-left: 0.3em;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-size: 0.72rem;
    font-weight: 600;
    text-align: center;
  }
  main {
    max-width: 1240px;
    margin: 0 auto;
    padding: 1.25rem 1.25rem 6rem;
  }
  @media (max-width: 520px) {
    .brand span { display: none; }
  }
</style>
