<script lang="ts">
  /** Volet latéral de détail : toutes les métadonnées, sans quitter la page. */
  import { fade, fly } from 'svelte/transition';
  import { fieldGroups } from '$lib/config/schema';
  import { compare } from '$lib/stores/compare.svelte';
  import { flagEmoji } from '$lib/utils/flag';
  import type { ActiveFilters, CollectionItem } from '$lib/api/types';
  import AttributeList from './AttributeList.svelte';
  import { i18n } from '$lib/i18n/index.svelte';
  import { fallbackToThumb } from '$lib/utils/imgFallback';
  import { riskFor } from '$lib/config/risk';
  import ScoreRing from './ScoreRing.svelte';

  let {
    item,
    onclose,
    filters,
    onfilter
  }: {
    item: CollectionItem | null;
    onclose: () => void;
    filters?: ActiveFilters;
    onfilter?: (key: string, value: string) => void;
  } = $props();

  let closeBtn = $state<HTMLButtonElement | null>(null);
  let drawerEl = $state<HTMLDivElement | null>(null);

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

  /** Garde Tab / Maj+Tab à l'intérieur du dialogue. */
  function trapTab(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !drawerEl) return;
    const nodes = [...drawerEl.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !drawerEl.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  $effect(() => {
    if (!item) return;
    const opener = document.activeElement as HTMLElement | null;
    closeBtn?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', trapTab);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', trapTab);
      opener?.focus?.();
    };
  });

  const selected = $derived(item ? compare.has(item.id) : false);
  const origin = $derived(item ? String(item.metadata.origin ?? '') : '');
  const risks = $derived(item ? riskFor(item) : []);
</script>

{#if item}
  <div class="backdrop" transition:fade={{ duration: 150 }} onclick={onclose} aria-hidden="true"></div>
  <div bind:this={drawerEl} class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" transition:fly={{ x: 40, duration: 200 }}>
    <header>
      <div>
        <h2 id="drawer-title">{item.title}</h2>
        <p class="sub">
          {#if origin}<span class="flag" aria-hidden="true">{flagEmoji(origin)}</span>{/if}
          <span class="mono">{item.metadata.inventory ?? item.id}</span>
        </p>
      </div>
      <button bind:this={closeBtn} type="button" class="close" aria-label={i18n.t('drawer.close')} onclick={onclose}>×</button>
    </header>

    <div class="scroll">
      <figure>
        <img src={item.imageUrl} alt={item.title} onerror={(e) => fallbackToThumb(e, item?.thumbnailUrl)} />
        {#if item.score !== undefined}
          <figcaption><ScoreRing score={item.score} size={40} /> <span>{i18n.t('drawer.similarity')}</span></figcaption>
        {/if}
      </figure>

      {#each risks as r (r.id)}
        <div class="risk" class:emergency={r.emergency} role="note">
          <p class="rl">{i18n.t('insights.risk', { label: i18n.l(r.label) })}</p>
          <p class="ra"><strong>{i18n.t('insights.riskNotStolen')}</strong> {i18n.l(r.advice)}</p>
          <p class="rn">{i18n.t('insights.riskNote')} <a href={r.url} target="_blank" rel="noopener">{i18n.t('insights.riskLink')}</a></p>
        </div>
      {/each}

      {#if onfilter}
        <p class="tip">{i18n.t('drawer.tip')}</p>
      {/if}

      {#each fieldGroups as group (group.group?.id ?? '')}
        <section>
          {#if group.group}<h3>{i18n.l(group.group.label)}</h3>{/if}
          <AttributeList fields={group.fields} {item} {filters} {onfilter} />
        </section>
      {/each}
    </div>

    <footer>
      <button type="button" class="cmp" class:active={selected} aria-pressed={selected} disabled={!selected && compare.isFull} onclick={() => item && compare.toggle(item)}>
        <span class="ico" aria-hidden="true">
          {#if selected}
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          {:else}
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M4 7h16"/><path d="M7 7 4 14a3 3 0 0 0 6 0L7 7zM17 7l-3 7a3 3 0 0 0 6 0l-3-7z"/></svg>
          {/if}
        </span>
        {selected ? i18n.t('drawer.removeCompare') : i18n.t('drawer.addCompare')}
      </button>
    </footer>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgb(0 0 0 / 0.35);
  }
  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 41;
    width: min(520px, 100vw);
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-left: 1px solid var(--border);
    box-shadow: -12px 0 40px rgb(0 0 0 / 0.2);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem 1.1rem 0.8rem;
    border-bottom: 1px solid var(--border);
  }
  h2 {
    margin: 0;
    font-size: 1.05rem;
  }
  .sub {
    margin: 0.2rem 0 0;
    font-size: 0.8rem;
    color: var(--muted);
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
  }
  .close {
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: 8px;
    background: var(--surface-2);
    color: var(--fg);
    font-size: 1.2rem;
    cursor: pointer;
  }
  .scroll {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 1.1rem;
  }
  figure {
    margin: 0 0 1rem;
  }
  figure img {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    border-radius: 10px;
    background: var(--surface-2);
  }
  figcaption {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.6rem;
    font-size: 0.8rem;
    color: var(--muted);
  }
  section + section {
    margin-top: 1rem;
  }
  .risk {
    margin: 0 0 0.9rem;
    padding: 0.7rem 0.85rem;
    border: 1px solid color-mix(in srgb, #f59e0b 45%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, #f59e0b 14%, var(--surface));
    font-size: 0.84rem;
  }
  .risk.emergency {
    border-color: color-mix(in srgb, #ef4444 45%, transparent);
    background: color-mix(in srgb, #ef4444 12%, var(--surface));
  }
  .risk p {
    margin: 0;
  }
  .rl {
    font-weight: 600;
  }
  .ra {
    margin-top: 0.15rem !important;
  }
  .rn {
    margin-top: 0.3rem !important;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .rn a {
    color: inherit;
  }
  .tip {
    margin: 0 0 0.9rem;
    padding: 0.5rem 0.65rem;
    border-radius: 8px;
    background: var(--accent-soft);
    font-size: 0.8rem;
    color: var(--fg);
  }
  h3 {
    margin: 0 0 0.4rem;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  footer {
    padding: 0.8rem 1.1rem;
    border-top: 1px solid var(--border);
  }
  .cmp {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    padding: 0.55rem 1rem 0.55rem 0.7rem;
    border: 1.5px dashed color-mix(in srgb, var(--fg) 30%, transparent);
    border-radius: 999px;
    background: transparent;
    color: var(--fg);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
  }
  .cmp .ico {
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    background: var(--surface-2);
    transition: background 0.18s ease, color 0.18s ease;
  }
  .cmp:hover:not(:disabled) {
    border-style: solid;
    border-color: var(--compare);
    color: var(--compare);
  }
  .cmp:hover:not(:disabled) .ico {
    background: var(--compare-soft);
    color: var(--compare);
  }
  .cmp.active {
    border-style: solid;
    border-color: var(--compare);
    background: var(--compare-soft);
    color: var(--compare);
  }
  .cmp.active .ico {
    background: var(--compare);
    color: var(--compare-ink);
  }
  .cmp:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
