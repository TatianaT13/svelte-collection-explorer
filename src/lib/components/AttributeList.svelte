<script lang="ts">
  /**
   * Liste d'attributs d'un objet : [case] Attribut  Valeur, une ligne par valeur.
   * Si le champ est filtrable, la case ajoute / retire cette valeur du filtre.
   */
  import type { FieldSchema } from '$lib/config/schema';
  import type { ActiveFilters, CollectionItem } from '$lib/api/types';
  import { labelOf, formatValue } from '$lib/utils/labels';
  import { flagEmoji } from '$lib/utils/flag';

  let {
    fields,
    item,
    filters,
    onfilter,
    compact = false
  }: {
    fields: FieldSchema[];
    item: CollectionItem;
    filters?: ActiveFilters;
    onfilter?: (key: string, value: string) => void;
    compact?: boolean;
  } = $props();

  interface Row {
    id: string;
    field: FieldSchema;
    label: string;
    text: string;
    value?: string;
    checkable: boolean;
    flag?: string;
    long: boolean;
  }

  const rows = $derived.by(() => {
    const out: Row[] = [];
    for (const f of fields) {
      const raw = item.metadata[f.key];
      const empty = raw === null || raw === undefined || raw === '' || (Array.isArray(raw) && raw.length === 0);
      const checkable = !!onfilter && !!f.filterable && !empty && f.kind !== 'number';
      if (!checkable) {
        out.push({ id: f.key, field: f, label: f.label, text: formatValue(f, raw), checkable: false, long: f.kind === 'longtext' });
        continue;
      }
      const values = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      values.forEach((v, i) => {
        out.push({
          id: `${f.key}:${v}`,
          field: f,
          label: i === 0 ? f.label : '',
          text: labelOf(f, v),
          value: v,
          checkable: true,
          flag: f.kind === 'country' ? flagEmoji(v) : undefined,
          long: false
        });
      });
    }
    return out;
  });

  function isOn(row: Row): boolean {
    if (!row.checkable || row.value === undefined) return false;
    const f = filters?.[row.field.key];
    if (Array.isArray(f)) return f.includes(row.value);
    return f !== undefined && f !== null && String(f).toLowerCase() === row.value.toLowerCase();
  }
</script>

<ul class="attrs" class:compact class:checkable={!!onfilter}>
  {#each rows as row (row.id)}
    {@const on = isOn(row)}
    {#if row.checkable}
      <li class="row" class:on>
        <label title={on ? 'Retirer ce filtre' : 'Ne garder que les objets avec cette valeur'}>
          <input type="checkbox" checked={on} onchange={() => onfilter?.(row.field.key, row.value!)} aria-label="Filtrer sur {row.field.label} : {row.text}" />
          <span class="k">{row.label}</span>
          <span class="v">
            {#if row.flag}<span class="flag" aria-hidden="true">{row.flag}</span>{/if}
            {row.text}
          </span>
        </label>
      </li>
    {:else}
      <li class="row static">
        <span class="spacer" aria-hidden="true"></span>
        <span class="k">{row.label}</span>
        <span class="v" class:long={row.long} class:empty={row.text === '—'}>{row.text}</span>
      </li>
    {/if}
  {/each}
</ul>

<style>
  .attrs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.15rem;
    font-size: 0.86rem;
  }
  .compact {
    font-size: 0.8rem;
    gap: 0.1rem;
  }
  .row {
    display: block;
  }
  .row.static,
  .row label {
    display: grid;
    grid-template-columns: 1rem minmax(110px, 36%) 1fr;
    column-gap: 0.55rem;
    align-items: baseline;
  }
  .compact .row.static,
  .compact .row label {
    grid-template-columns: 1rem auto 1fr;
    column-gap: 0.45rem;
  }
  .row label {
    cursor: pointer;
    margin: 0 -0.3rem;
    padding: 0.12rem 0.3rem;
    border-radius: 6px;
  }
  .row label:hover {
    background: var(--surface-2);
  }
  .attrs:not(.checkable) .row.static {
    grid-template-columns: 0 minmax(110px, 36%) 1fr;
  }
  .compact.attrs:not(.checkable) .row.static {
    grid-template-columns: 0 auto 1fr;
  }
  input[type='checkbox'] {
    width: 0.9rem;
    height: 0.9rem;
    margin: 0;
    align-self: center;
    accent-color: var(--accent);
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.12s;
  }
  .row label:hover input,
  .row.on input,
  input:focus-visible {
    opacity: 1;
  }
  .spacer {
    width: 1rem;
  }
  .k {
    color: var(--muted);
    white-space: nowrap;
  }
  .v {
    color: var(--fg);
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .row.on .v {
    color: var(--accent);
    font-weight: 500;
  }
  .v.long {
    white-space: pre-wrap;
    line-height: 1.45;
  }
  .v.empty {
    color: var(--muted);
  }
  .flag {
    margin-right: 0.2rem;
  }
</style>
