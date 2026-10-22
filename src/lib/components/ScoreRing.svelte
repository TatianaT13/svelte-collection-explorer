<script lang="ts">
  /** Score de similarité 0..1 : anneau + pourcentage + libellé (jamais la couleur seule). */
  let { score, size = 44 }: { score: number; size?: number } = $props();

  const pct = $derived(Math.round(Math.max(0, Math.min(1, score)) * 100));
  const label = $derived(pct >= 80 ? 'Forte' : pct >= 50 ? 'Moyenne' : 'Faible');
  const r = $derived((size - 4) / 2);
  const c = $derived(2 * Math.PI * r);
</script>

<span class="ring" style="--size: {size}px" title="Similarité {label.toLowerCase()} : {pct} %" aria-label="Similarité {pct} %, {label.toLowerCase()}">
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
