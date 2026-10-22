# svelte-collection-explorer

Front d'exploration de collections (recherche texte, recherche par image, filtres, comparaison),
écrit avec **Svelte 5**, **SvelteKit 2** et **TypeScript**. Le code est volontairement compact :
chaque fichier illustre un mécanisme de Svelte. Ce README le parcourt comme un tutoriel.

```bash
npm install
npm run dev      # http://localhost:5173
npm run check    # svelte-check : types + accessibilité
npm run build    # bundle de production dans .svelte-kit/output
```

---

## 1. Comment Svelte fonctionne

Svelte est un **compilateur**, pas une librairie chargée au runtime. Un fichier `.svelte` est
transformé au build en JavaScript natif qui manipule le DOM directement. Il n'y a pas de DOM virtuel
ni de diff : le compilateur sait quelles variables alimentent quel nœud et génère le code de mise à
jour minimal.

Un composant tient dans un seul fichier, en trois blocs :

```svelte
<script lang="ts">
  // logique : état, props, fonctions
</script>

<!-- markup : HTML + blocs de contrôle {#if} {#each} -->

<style>
  /* CSS scoppé au composant */
</style>
```

**SvelteKit** est le framework au-dessus : routage par fichiers, rendu côté serveur (SSR),
chargement de données, build Vite. Ce projet n'utilise que le routage et le SSR par défaut.

---

## 2. Structure du projet

```
src/
  app.html                     # squelette HTML, SvelteKit injecte %sveltekit.head% et %sveltekit.body%
  routes/
    +layout.svelte             # enveloppe toutes les pages (nav, thème)
    +page.svelte               # route "/"
    compare/+page.svelte       # route "/compare"
  lib/                         # importable via l'alias $lib
    api/
      types.ts                 # contrats de données
      adapter.ts               # interface CollectionAdapter
      mockAdapter.ts           # backend simulé en mémoire
      imageInfo.ts             # extraction EXIF/IPTC/XMP côté client
      index.ts                 # point d'entrée : quel adapter est actif
    config/schema.ts           # schéma des métadonnées (pilote l'UI)
    config/countries.ts        # codes ISO 3166 + noms localisés via Intl.DisplayNames
    config/vocabularies.ts     # vocabulaires contrôlés (types, matériaux, techniques, périodes, sujets)
    components/*.svelte        # composants réutilisables
    stores/compare.svelte.ts   # état partagé réactif
```

**Routage** : chaque dossier sous `src/routes` est une URL. `+page.svelte` est la page,
`+layout.svelte` l'enveloppe commune. Un `+layout.svelte` à la racine s'applique à toutes les routes
en dessous.

---

## 3. Les runes de Svelte 5

Svelte 5 remplace la réactivité implicite (`let x` + `$:`) par des **runes** : des fonctions
spéciales préfixées `$` que le compilateur reconnaît. Toutes sont utilisées dans ce projet.

### `$state` : une valeur réactive

```ts
// src/routes/+page.svelte
let text = $state('');
let page = $state(1);
let result = $state<SearchResult | null>(null);
```

Modifier la variable (`page++`, `text = '...'`) met à jour tout ce qui la lit dans le markup.
Les objets et tableaux déclarés avec `$state` sont des proxies profonds : `filters.origin = 'Ukraine'`
déclenche aussi la mise à jour.

### `$derived` : une valeur calculée

```ts
const totalPages = $derived(result ? Math.ceil(result.total / result.pageSize) : 1);
```

Recalculée uniquement quand `result` change. Pour un calcul sur plusieurs lignes, `$derived.by(() => {...})`
(voir `MetadataValue.svelte`).

### `$effect` : exécuter du code quand des dépendances changent

```ts
$effect(() => {
  void text; void image; void filters; void page;   // dépendances lues explicitement
  runSearch();
});
```

Le `$effect` suit automatiquement les valeurs réactives **lues de façon synchrone** dans son corps.
Ici `runSearch()` est asynchrone, donc ses lectures ne seraient pas suivies : on lit les
dépendances en tête pour les déclarer. Un effet peut retourner une fonction de nettoyage, exécutée
avant la prochaine exécution ou à la destruction :

```ts
$effect(() => {
  const f = image;
  if (!f) { imageInfo = null; return; }
  let cancelled = false;
  extractImageInfo(f).then((info) => { if (!cancelled) imageInfo = info; });
  return () => { cancelled = true; };   // évite d'écrire un résultat obsolète
});
```

Règle : `$effect` sert aux effets de bord (appels réseau, DOM, timers). Pour dériver une valeur,
toujours préférer `$derived`.

### `$props` : recevoir des propriétés

```ts
// src/lib/components/ResultCard.svelte
let { item }: { item: CollectionItem } = $props();
```

Déstructuration typée. Valeur par défaut : `let { pageSize = 12 } = $props();`.

### `$bindable` : une prop modifiable par l'enfant

```ts
// src/lib/components/ImageUpload.svelte
let { file = $bindable<File | null>(null), onchange } = $props();
```

Le parent écrit `<ImageUpload bind:file={image} />`. Quand l'enfant fait `file = f`, la variable
`image` du parent change aussi. Sans `$bindable`, une prop est en lecture seule.

---

## 4. Le markup

### Blocs de contrôle

```svelte
{#if loading}
  Chargement…
{:else if result}
  {result.total} résultats
{/if}

{#each result.items as item (item.id)}
  <ResultCard {item} />
{/each}
```

La **clé** `(item.id)` dans `{#each}` est importante : sans elle, Svelte réutilise les nœuds par
position et une suppression en milieu de liste déplace l'état des composants.

`{item}` est un raccourci pour `item={item}`.

### Événements

En Svelte 5, les événements sont des propriétés ordinaires : `onclick`, `oninput`, `ondrop`.

```svelte
<button onclick={() => page++}>Suivant</button>
<input oninput={(e) => update(field.key, e.currentTarget.value)} />
```

Pour qu'un composant remonte un événement au parent, on passe une **fonction en prop**
(`onchange` dans `FilterPanel`). Il n'y a plus de `createEventDispatcher`.

### Liaisons `bind:`

```svelte
<input type="search" bind:value={text} />
<input type="checkbox" bind:checked={includeGps} />
<input bind:this={inputEl} type="file" hidden />
```

`bind:value` synchronise dans les deux sens. `bind:this` donne une référence au nœud DOM.

### Classes conditionnelles

```svelte
<article class="card" class:selected>          <!-- class:selected={selected} -->
<div class="grid" class:dim={loading}>
```

### Snippets et `{@render}`

Le layout reçoit la page courante comme **snippet** `children` et l'affiche :

```svelte
<!-- src/routes/+layout.svelte -->
let { children } = $props();
...
<main>{@render children()}</main>
```

C'est le remplacement du `<slot />` de Svelte 4.

---

## 5. État partagé : un store en `.svelte.ts`

Les runes fonctionnent aussi dans des modules TypeScript si le fichier se termine en
`.svelte.ts`. C'est ainsi qu'on partage un état entre pages sans librairie :

```ts
// src/lib/stores/compare.svelte.ts
function createCompareStore() {
  let items = $state<CollectionItem[]>(load());
  return {
    get items() { return items; },          // getter : la lecture reste réactive
    get count() { return items.length; },
    toggle(item) { ... },
    clear() { ... }
  };
}
export const compare = createCompareStore();
```

Deux points à retenir :

- On exporte un **objet avec des getters**, pas la variable `items` directement. Exporter une
  variable `$state` casserait la réactivité à l'import (on recevrait une copie de la valeur).
- Le store persiste dans `sessionStorage`. Comme SvelteKit rend d'abord côté serveur, où
  `sessionStorage` n'existe pas, l'accès est gardé par `browser` de `$app/environment`.

Dans un composant, `compare.count` ou `compare.has(id)` se mettent à jour tout seuls.

---

## 6. CSS scoppé, variables et thème

Le `<style>` d'un composant ne s'applique qu'à son propre markup : le compilateur ajoute une classe
de hachage à chaque sélecteur. Pour sortir de ce périmètre, `:global()` :

```css
/* src/routes/+layout.svelte */
:global(:root) { --bg: #f6f7f9; --accent: #2563eb; ... }
@media (prefers-color-scheme: dark) { :global(:root) { --bg: #0f1216; ... } }
:global(body) { background: var(--bg); color: var(--fg); }
```

Les composants ne consomment que des variables CSS (`var(--accent)`), donc le thème clair/sombre
et le rebranding se font en un seul endroit.

---

## 7. Architecture : schéma + adapter

Le front est générique grâce à deux fichiers de configuration.

### Le schéma pilote l'interface

```ts
// src/lib/config/schema.ts
{ key: 'material', label: 'Matériaux', kind: 'vocab', vocabulary: 'material', multiple: true, filterable: true, group: 'Matériaux et techniques' }
```

Chaque champ déclare son `kind`, et les composants s'adaptent :

| `kind`     | Valeur stockée                | Options du filtre                | Libellé affiché                     |
|------------|-------------------------------|----------------------------------|-------------------------------------|
| `vocab`    | code d'un vocabulaire (`gold`)| liste complète du vocabulaire    | `termLabel()` dans la locale        |
| `country`  | code ISO 3166-1 (`UA`)        | les 249 pays                     | `Intl.DisplayNames` dans la locale  |
| `select`   | chaîne libre                  | facettes renvoyées par le backend| la valeur telle quelle              |
| `text`     | chaîne libre                  | champ « contient »               | la valeur telle quelle              |
| `number`   | nombre                        | champ numérique (minimum)        | valeur + `unit`                     |
| `longtext` | texte long                    | —                                | texte multiligne                    |

- `FilterPanel` itère sur `filterFields` et génère le bon contrôle.
- `ResultCard` affiche `cardFields`.
- La page Comparer affiche les champs **regroupés par `group`** et surligne les lignes différentes.
- `MetadataValue` traduit codes et tableaux de codes (`multiple: true`) en libellés.

Les champs suivent le standard **Object ID** (ICOM / Interpol / UNESCO), utilisé par les douanes et
la police pour décrire un bien culturel : type d'objet, matériaux et techniques, mesures,
inscriptions et marques, signes distinctifs, sujet, date ou période, auteur.

### Vocabulaires contrôlés : code stable, libellé traduit

```ts
// src/lib/config/vocabularies.ts
t('gold', 'Or', 'Gold'),
t('18th', 'XVIIIe siècle', '18th century', 140),   // 4e argument : ordre chronologique
```

Le principe est le même que pour les pays : les données contiennent le code, jamais le texte.
Avantages :

- **Pas de confusion** entre « Or », « or », « doré » : une seule clé `gold`.
- **Extensible** : ajouter une ligne suffit, les filtres, cartes et comparaisons se mettent à jour.
- **Multilingue** : `locale: 'en'` dans le schéma bascule tous les libellés. Un terme sans
  traduction retombe sur l'anglais, puis sur le code.
- **Trié correctement** : alphabétique localisé via `Intl.Collator`, ou ordre explicite (périodes).

Les listes sont inspirées des facettes du Getty AAT (Art & Architecture Thesaurus). Pour un projet
réel, on peut les remplacer par les identifiants AAT eux-mêmes et charger les libellés depuis le
backend, sans toucher aux composants.

### L'adapter isole le backend

```ts
// src/lib/api/adapter.ts
export interface CollectionAdapter {
  search(query: SearchQuery): Promise<SearchResult>;
  getItem(id: string): Promise<CollectionItem | null>;
  getFacets(): Promise<FacetValues>;
}
```

Les pages importent `api` depuis `$lib/api` et ne voient que cette interface. `mockAdapter.ts`
fournit 48 objets en mémoire avec une latence simulée. Pour brancher une vraie API :

1. Créer `src/lib/api/httpAdapter.ts` qui implémente `CollectionAdapter` avec `fetch`.
2. Dans `index.ts`, remplacer `export const api = mockAdapter` par le nouvel adapter.

Aucun composant ne change.

### Requêtes concurrentes

`runSearch` incrémente un compteur `requestId` et n'écrit le résultat que si l'identifiant est
toujours le dernier. Sans ça, une réponse lente d'une recherche précédente pourrait écraser une
réponse plus récente.

---

## 8. Métadonnées des images

`src/lib/api/imageInfo.ts` lit, côté client, EXIF/IPTC/XMP (librairie `exifr`), les dimensions
réelles (via un `Image()` en mémoire) et un SHA-256 (`crypto.subtle`). Les trois s'exécutent en
parallèle avec `Promise.all`.

Le panneau `ImageInfoPanel` affiche le résultat, signale une image sans aucune métadonnée, et
propose d'exclure la position GPS avant l'envoi (`withoutGps`). Les infos partent dans
`SearchQuery.imageInfo`.

Ces données sont **indicatives** : souvent absentes (messageries, réseaux sociaux, captures d'écran)
et falsifiables. Le backend doit refaire l'extraction de référence et calculer un hash perceptuel.

---

## 9. SSR : ce qu'il faut savoir

SvelteKit rend chaque page une première fois côté serveur, puis l'« hydrate » dans le navigateur.
Conséquences dans ce projet :

- `onMount` ne s'exécute que dans le navigateur : on y charge les facettes.
- `$effect` ne s'exécute jamais côté serveur.
- Tout accès à `window`, `sessionStorage`, `URL.createObjectURL` doit être gardé par `browser`
  ou placé dans un effet/`onMount`.
- `page` de `$app/state` donne l'URL courante de façon réactive (utilisé pour `aria-current` dans la nav).

---

## 10. Pour aller plus loin

- **Chargement de données serveur** : un `+page.ts` ou `+page.server.ts` avec une fonction `load`
  permet de récupérer les données avant le rendu, au lieu d'un `$effect` côté client.
- **Page de détail** : `src/routes/item/[id]/+page.svelte` avec `params.id`.
- **Tests** : Vitest + `@testing-library/svelte` pour les composants, Playwright pour le parcours complet.
- **Déploiement** : remplacer `adapter-auto` par `adapter-node`, `adapter-static` ou celui de la plateforme cible.
