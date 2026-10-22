<script lang="ts">
  import type { FieldSchema } from '$lib/config/schema';
  import type { MetadataValue } from '$lib/api/types';
  import { formatValue } from '$lib/utils/labels';

  let { field, value }: { field: FieldSchema; value: MetadataValue | undefined } = $props();
  const display = $derived(formatValue(field, value));
</script>

<span class="value" class:long={field.kind === 'longtext'} class:empty={display === '—'}>{display}</span>

<style>
  .value {
    color: var(--fg);
  }
  .long {
    white-space: pre-wrap;
    line-height: 1.45;
  }
  .empty {
    color: var(--muted);
  }
</style>
