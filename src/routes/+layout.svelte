<script lang="ts">
  import { page } from '$app/state';
  import { compare } from '$lib/stores/compare.svelte';
  import { schema } from '$lib/config/schema';

  let { children } = $props();
</script>

<svelte:head>
  <title>{schema.name} · Explorer</title>
</svelte:head>

<nav>
  <a href="/" class="brand">{schema.name}</a>
  <div class="links">
    <a href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined}>Explorer</a>
    <a href="/compare" aria-current={page.url.pathname === '/compare' ? 'page' : undefined}>
      Comparer
      {#if compare.count}<span class="badge">{compare.count}</span>{/if}
    </a>
  </div>
</nav>

<main>
  {@render children()}
</main>

<style>
  :global(:root) {
    --bg: #f6f7f9;
    --surface: #ffffff;
    --surface-2: #eef1f5;
    --fg: #1f2937;
    --muted: #6b7280;
    --border: #d9dee5;
    --accent: #2563eb;
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :global(:root) {
      --bg: #0f1216;
      --surface: #181c22;
      --surface-2: #222730;
      --fg: #e5e7eb;
      --muted: #9ca3af;
      --border: #2e3440;
      --accent: #60a5fa;
    }
  }
  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    font-size: 15px;
  }
  nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .brand {
    font-weight: 700;
    text-decoration: none;
    color: var(--fg);
  }
  .links {
    display: flex;
    gap: 1rem;
  }
  .links a {
    text-decoration: none;
    color: var(--muted);
    padding: 0.3rem 0.5rem;
    border-radius: 6px;
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
    font-size: 0.75rem;
    text-align: center;
  }
  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
  }
</style>
