<script lang="ts">
  /**
   * Marque du site : écrin hexagonal en trois chevrons autour d'un cœur turquoise.
   * Les chevrons prennent la couleur du texte (lisible en clair et en sombre),
   * le cœur prend la couleur de sélection du thème.
   */
  let { size = 26, wordmark = '' }: { size?: number; wordmark?: string } = $props();
</script>

<span class="logo">
  <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
    <g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17.2 14.4 32 5.9l14.8 8.5" />
      <path d="M9.4 29.3v16.5l14.3 8.2" />
      <path d="M54.6 29.3v16.5l-14.3 8.2" />
    </g>
    <rect x="23" y="25.5" width="18" height="14.5" rx="3.5" fill="var(--compare)" />
  </svg>
  {#if wordmark}
    <span class="word">{wordmark}</span>
  {/if}
</span>

<style>
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    color: var(--fg);
  }
  svg {
    flex: none;
  }
  .word {
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--fg);
  }
</style>
