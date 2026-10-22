/**
 * Gazetier des lieux (Wikidata) : libellés fr/en, hiérarchie administrative, coordonnées.
 * Chargé par l'adapter local avec le jeu de données ; `version` change à chaque chargement
 * pour que les composants qui lisent des libellés se mettent à jour.
 */
export interface PlaceNode {
  id: string;
  label: { fr: string; en: string };
  parent?: string;
  countryIso?: string;
  lat?: number;
  lon?: number;
}

function createPlaces() {
  let nodes = $state<Record<string, PlaceNode>>({});
  let version = $state(0);

  function get(id: string | undefined): PlaceNode | undefined {
    return id ? nodes[id] : undefined;
  }

  return {
    get version() {
      return version;
    },
    get all(): PlaceNode[] {
      return Object.values(nodes);
    },
    set(data: Record<string, PlaceNode>) {
      nodes = data;
      version++;
    },
    get,
    /** Lieu puis ses parents, jusqu'au pays. */
    chain(id: string | undefined): PlaceNode[] {
      const out: PlaceNode[] = [];
      let cur = get(id);
      while (cur && out.length < 8 && !out.includes(cur)) {
        out.push(cur);
        cur = get(cur.parent);
      }
      return out;
    },
    /** Identifiants du lieu et de ses parents. */
    selfAndAncestors(id: string | undefined): string[] {
      return this.chain(id).map((n) => n.id);
    },
    isCountry(id: string | undefined): boolean {
      const n = get(id);
      return !!n && !n.parent && !!n.countryIso;
    },
    /** Libellé court : « Kyiv, Ukraine » ou juste le pays. */
    label(id: string | undefined, locale: string): string {
      const chain = this.chain(id);
      if (!chain.length) return id ?? '';
      const lang = locale.startsWith('fr') ? 'fr' : 'en';
      const first = chain[0].label[lang];
      const country = chain[chain.length - 1];
      return chain.length > 1 && country !== chain[0] ? `${first}, ${country.label[lang]}` : first;
    },
    /** Libellé complet de la chaîne : « Kyiv · Oblast de Kyiv · Ukraine ». */
    fullLabel(id: string | undefined, locale: string): string {
      const lang = locale.startsWith('fr') ? 'fr' : 'en';
      return this.chain(id)
        .map((n) => n.label[lang])
        .join(' · ');
    },
    /** Options de filtre : pays puis lieux rattachés, indentés par profondeur. */
    options(locale: string): { code: string; name: string }[] {
      const lang = locale.startsWith('fr') ? 'fr' : 'en';
      const collator = new Intl.Collator(locale);
      const depth = (n: PlaceNode) => this.chain(n.id).length - 1;
      const countryOf = (n: PlaceNode) => this.chain(n.id).at(-1)!;
      return [...this.all]
        .sort((a, b) => {
          const ca = countryOf(a);
          const cb = countryOf(b);
          if (ca !== cb) return collator.compare(ca.label[lang], cb.label[lang]);
          const da = depth(a);
          const db = depth(b);
          if (da !== db) return da - db;
          return collator.compare(a.label[lang], b.label[lang]);
        })
        .map((n) => ({ code: n.id, name: `${'   '.repeat(depth(n))}${n.label[lang]}` }));
    }
  };
}

export const places = createPlaces();
