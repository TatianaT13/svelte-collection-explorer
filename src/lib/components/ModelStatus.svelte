<script lang="ts">
  /** Progression du chargement du modèle de reconnaissance (affiché quand une image est envoyée). */
  import { modelStatus } from '$lib/ml/status.svelte';
  import { i18n } from '$lib/i18n/index.svelte';

  const pct = $derived(Math.round(modelStatus.progress * 100));
</script>

{#if modelStatus.state !== 'idle'}
  <div class="model" class:ready={modelStatus.state === 'ready'} class:error={modelStatus.state === 'error'} role="status" aria-live="polite">
    {#if modelStatus.state === 'loading'}
      <div class="bar" aria-hidden="true"><span style="width: {pct}%"></span></div>
      <p>{i18n.t('model.loading', { pct })}</p>
      <small>{i18n.t('model.hint')}</small>
    {:else if modelStatus.state === 'ready'}
      <p>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
        {i18n.t('model.ready')}
      </p>
    {:else}
      <p>{i18n.t('model.error', { msg: modelStatus.message })}</p>
    {/if}
  </div>
{/if}

<style>
  .model {
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    font-size: 0.8rem;
  }
  .model.ready {
    color: var(--compare);
    border-color: color-mix(in srgb, var(--compare) 40%, var(--border));
  }
  .model.error {
    color: #dc2626;
  }
  p {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  small {
    display: block;
    margin-top: 0.25rem;
    color: var(--muted);
  }
  .bar {
    height: 4px;
    margin-bottom: 0.45rem;
    border-radius: 2px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.2s;
  }
</style>
