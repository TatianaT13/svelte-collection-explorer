<script lang="ts">
  /**
   * Page Comparer : les objets sélectionnés côte à côte, un champ par ligne.
   * Les lignes viennent du schéma, les valeurs différentes sont mises en évidence.
   */
  import { compare } from '$lib/stores/compare.svelte';
  import { fieldGroups } from '$lib/config/schema';
  import MetadataValue from '$lib/components/MetadataValue.svelte';

  const items = $derived(compare.items);

  function differs(key: string): boolean {
    if (items.length < 2) return false;
    const first = JSON.stringify(items[0].metadata[key] ?? null);
    return items.some((it) => JSON.stringify(it.metadata[key] ?? null) !== first);
  }
</script>

<header class="head">
  <h1>Comparaison</h1>
  <div class="actions">
    <span class="muted">{items.length} / {compare.max} objets</span>
    {#if items.length}
      <button type="button" class="link" onclick={() => compare.clear()}>Tout retirer</button>
    {/if}
  </div>
</header>

{#if items.length === 0}
  <p class="empty">
    Aucun objet sélectionné. <a href="/">Retourner à l'explorateur</a> et cliquer sur « Comparer » sur une carte.
  </p>
{:else}
  <div class="scroller">
    <table style="--cols: {items.length}">
      <thead>
        <tr>
          <th class="label"></th>
          {#each items as item (item.id)}
            <th>
              <img src={item.imageUrl} alt={item.title} />
              <div class="title">{item.title}</div>
              <button type="button" class="link" onclick={() => compare.remove(item.id)}>Retirer</button>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#if items.some((it) => it.score !== undefined)}
          <tr>
            <th class="label">Similarité</th>
            {#each items as item (item.id)}
              <td>{item.score !== undefined ? `${Math.round(item.score * 100)} %` : '—'}</td>
            {/each}
          </tr>
        {/if}
        {#each fieldGroups as group (group.name)}
          {#if group.name}
            <tr class="group">
              <th colspan={items.length + 1}>{group.name}</th>
            </tr>
          {/if}
          {#each group.fields as field (field.key)}
            <tr class:diff={differs(field.key)}>
              <th class="label">{field.label}</th>
              {#each items as item (item.id)}
                <td><MetadataValue {field} value={item.metadata[field.key]} /></td>
              {/each}
            </tr>
          {/each}
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 1rem;
  }
  h1 {
    font-size: 1.4rem;
    margin: 0;
  }
  .actions {
    display: flex;
    gap: 1rem;
    align-items: baseline;
  }
  .muted {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .empty {
    color: var(--muted);
    text-align: center;
    padding: 3rem 0;
  }
  .scroller {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    min-width: calc(180px + var(--cols) * 220px);
  }
  th,
  td {
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
    text-align: left;
  }
  thead th {
    background: var(--surface);
    position: sticky;
    top: 3.2rem;
  }
  th.label {
    width: 180px;
    color: var(--muted);
    font-weight: 500;
    font-size: 0.85rem;
  }
  thead img {
    display: block;
    width: 100%;
    max-width: 260px;
    height: 150px;
    object-fit: cover;
    border-radius: 8px;
    background: var(--surface-2);
  }
  .title {
    margin: 0.5rem 0 0.25rem;
    font-weight: 600;
  }
  tr.group th {
    padding-top: 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
    border-bottom: 2px solid var(--border);
  }
  tr.diff td {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .link {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font: inherit;
    font-size: 0.85rem;
    padding: 0;
  }
</style>
