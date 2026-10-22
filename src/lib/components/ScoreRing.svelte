<script lang="ts">
  /** Score de similarité 0..1 : anneau + pourcentage + libellé (jamais la couleur seule). */
  import { i18n } from '$lib/i18n/index.svelte';

  let { score, size = 44 }: { score: number; size?: number } = $props();

  const pct = $derived(Math.round(Math.max(0, Math.min(1, score)) * 100));
  const label = $derived(i18n.t(pct >= 80 ? 'score.strong' : pct >= 50 ? 'score.medium' : 'score.weak'));
  const text = $derived(i18n.t('score.label', { label, pct }));
  const r = $derived((size - 4) / 2);
  const c = $derived(2 * Math.PI * r);
</script>

<span class="ring" style="--size: {size}px" title={text} aria-label={text}>
  <svg viewBox="0 0 {size} {size}" width={size} height={size} aria-hidden="true">
    <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="var(--ring-track)" stroke-width="3" />
    <circle
      cx={size / 2}
      cy={size / 2}
      {r}
      fill="none"
      stroke="var(--accent)"
      stroke-width="3"
      stroke-linecap="round"
      stroke-dasharray={c}
      stroke-dashoffset={c * (1 - pct / 100)}
      transform="rotate(-90 {size / 2} {size / 2})"
    />
  </svg>
  <span class="pct">{pct}</span>
</span>

<style>
  .ring {
    position: relative;
    display: inline-grid;
    place-items: center;
    width: var(--size);
    height: var(--size);
    --ring-track: color-mix(in srgb, var(--fg) 12%, transparent);
  }
  svg {
    position: absolute;
    inset: 0;
  }
  .pct {
    font-size: 0.72rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--fg);
  }
</style>
