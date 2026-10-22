<script lang="ts">
  /** Verdict du contrôle qualité de la photo : exploitable, ou liste de défauts avec un conseil chacun. */
  import type { PhotoMetrics, QualityIssue } from '$lib/utils/photoQuality';
  import { i18n } from '$lib/i18n/index.svelte';

  let { metrics, issues, compact = false }: { metrics: PhotoMetrics | null; issues: QualityIssue[]; compact?: boolean } = $props();
</script>

{#if metrics}
  <div class="pq" class:ok={issues.length === 0} class:compact role="status">
    {#if issues.length === 0}
      <p class="head">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
        {i18n.t('quality.ok')}
      </p>
    {:else}
      <p class="head">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
        {i18n.t('quality.issues', { n: issues.length })}
      </p>
      <ul>
        {#each issues as it (it.id)}
          <li><b>{i18n.t(`quality.${it.id}`)}</b> <span>{i18n.t(`quality.${it.id}.advice`)}</span></li>
        {/each}
      </ul>
    {/if}
    {#if !compact}
      <p class="metrics">
        {metrics.width} × {metrics.height} px · {i18n.t('quality.sharpness')} {(metrics.sharpness * 100).toFixed(1)} · {i18n.t('quality.light')} {Math.round(metrics.mean)}
      </p>
    {/if}
  </div>
{/if}

<style>
  .pq {
    padding: 0.55rem 0.75rem;
    border: 1px solid #f3c48c;
    border-radius: 10px;
    background: color-mix(in srgb, #f59e0b 12%, var(--surface));
    font-size: 0.8rem;
    color: var(--fg);
  }
  .pq.ok {
    border-color: color-mix(in srgb, var(--compare) 40%, var(--border));
    background: var(--surface);
    color: var(--compare);
  }
  .head {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 600;
  }
  ul {
    margin: 0.35rem 0 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.25rem;
  }
  li b {
    font-weight: 600;
  }
  li span {
    color: var(--muted);
  }
  .metrics {
    margin: 0.35rem 0 0;
    font-size: 0.72rem;
    color: var(--muted);
  }
  .compact .metrics {
    display: none;
  }
</style>
