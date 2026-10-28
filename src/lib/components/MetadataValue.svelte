<script lang="ts">
  import type { FieldSchema } from '$lib/config/schema';
  import type { MetadataValue } from '$lib/api/types';
  import { formatValue } from '$lib/utils/labels';

  let { field, value }: { field: FieldSchema; value: MetadataValue | undefined } = $props();
  const display = $derived(formatValue(field, value));

  /** Un texte long peut contenir des URL : on les affiche comme des liens courts (nom de domaine). */
  const parts = $derived.by(() => {
    if (field.kind !== 'longtext') return [{ text: display }];
    const out: { text: string; href?: string }[] = [];
    const re = /https?:\/\/[^\s]+/g;
    let last = 0;
    for (const m of display.matchAll(re)) {
      if (m.index! > last) out.push({ text: display.slice(last, m.index) });
      let host = m[0];
      try {
        host = new URL(m[0]).hostname.replace(/^www\./, '');
      } catch {
        /* texte brut */
      }
      out.push({ text: host, href: m[0] });
      last = m.index! + m[0].length;
    }
    if (last < display.length) out.push({ text: display.slice(last) });
    return out;
  });
</script>

<span class="value" class:long={field.kind === 'longtext'} class:empty={display === '—'}>
  {#each parts as p, i (i)}
    {#if p.href}<a href={p.href} target="_blank" rel="noopener">{p.text} ↗</a>{:else}{p.text}{/if}
  {/each}
</span>

<style>
  .value {
    color: var(--fg);
    overflow-wrap: anywhere;
  }
  .long {
    white-space: pre-wrap;
    line-height: 1.45;
  }
  .empty {
    color: var(--muted);
  }
  a {
    color: var(--accent);
    text-decoration: none;
    white-space: nowrap;
  }
  a:hover {
    text-decoration: underline;
  }
</style>
