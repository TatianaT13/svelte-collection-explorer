import type { ArchiveReceipt, CollectionAdapter } from './adapter';
import type { ImageInfo } from './imageInfo';
import type { CollectionItem, FacetValues, SearchQuery, SearchResult } from './types';
import { countryName } from '$lib/config/countries';
import { schema } from '$lib/config/schema';
import { termLabel, vocabCodes } from '$lib/config/vocabularies';
import { i18n } from '$lib/i18n/index.svelte';
import { matchesFilters, matchesText, paginate } from './filtering';

/**
 * Backend simulé : données en mémoire, latence artificielle.
 * Sert à développer le front sans API, et de modèle pour un vrai adapter.
 * Les valeurs sont des codes (pays ISO, termes de vocabulaire), jamais des libellés.
 */

const ORIGINS = ['UA', 'GR', 'EG', 'IT', 'PE', 'CN', 'TR', 'IR', 'FR', 'SY'];
const CATEGORIES = vocabCodes('category');
const MATERIALS = vocabCodes('material');
const TECHNIQUES = vocabCodes('technique');
const PERIODS = vocabCodes('period').filter((p) => p !== 'unknown');
const SUBJECTS = vocabCodes('subject');
const MAKERS = ['Atelier inconnu', 'Atelier de Kyiv', 'Maître anonyme', 'École de Novgorod', 'Manufacture royale', ''];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

function pickMany<T>(arr: T[], i: number, n: number): T[] {
  const out: T[] = [];
  for (let k = 0; k < n; k++) out.push(arr[(i * 7 + k * 13) % arr.length]);
  return [...new Set(out)];
}

/** Données brutes : uniquement des codes. Les textes sont produits à la requête, dans la langue courante. */
const RAW = Array.from({ length: 48 }, (_, i) => {
  const id = String(i + 1).padStart(3, '0');
  const hue = (i * 37) % 360;
  const category = pick(CATEGORIES, i * 3);
  const origin = pick(ORIGINS, i * 3 + 1);
  const material = pickMany(MATERIALS, i, 1 + (i % 2));
  const technique = pickMany(TECHNIQUES, i + 3, 1 + (i % 3 === 0 ? 1 : 0));
  return {
    id,
    hue,
    metadata: {
      category,
      origin,
      period: pick(PERIODS, i * 7 + 2),
      year: 1200 + ((i * 53) % 800),
      maker: pick(MAKERS, i * 11),
      material,
      technique,
      height_cm: 10 + ((i * 17) % 120),
      width_cm: 5 + ((i * 23) % 90),
      depth_cm: i % 4 === 0 ? null : 2 + ((i * 7) % 40),
      weight_g: 50 + ((i * 131) % 5000),
      subject: pick(SUBJECTS, i * 5),
      inscriptions: i % 3 === 0 ? `Marque « ${String.fromCharCode(65 + (i % 26))}${i} » au revers.` : '',
      distinguishing_features: i % 4 === 1 ? 'Éclat sur le bord supérieur, restauration ancienne visible.' : '',
      inventory: `INV-${2020 + (i % 6)}-${id}`
    }
  };
});

/** Construit l'objet présenté, avec titre et description dans la langue courante. */
function present(raw: (typeof RAW)[number]): CollectionItem {
  const L = i18n.locale;
  const catLabel = termLabel('category', String(raw.metadata.category), L);
  const materials = (raw.metadata.material as string[]).map((m) => termLabel('material', m, L).toLowerCase());
  const and = L === 'fr' ? ' et ' : ' and ';
  const description =
    L === 'fr'
      ? `${catLabel} attribué à la région ${countryName(String(raw.metadata.origin), L)}, ${materials.join(and)}.`
      : `${catLabel} attributed to the ${countryName(String(raw.metadata.origin), L)} region, ${materials.join(and)}.`;
  return {
    id: raw.id,
    title: `${catLabel} ${L === 'fr' ? 'n°' : '#'}${raw.id}`,
    imageUrl: `https://placehold.co/800x600/${hslToHex(raw.hue, 40, 35)}/ffffff?text=${encodeURIComponent(catLabel)}`,
    thumbnailUrl: `https://placehold.co/400x300/${hslToHex(raw.hue, 40, 35)}/ffffff?text=${encodeURIComponent(catLabel)}`,
    metadata: { ...raw.metadata, description }
  };
}

function hslToHex(h: number, s: number, l: number): string {
  const a = (s * Math.min(l, 100 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round((c * 255) / 100)
      .toString(16)
      .padStart(2, '0');
  };
  return `${f(0)}${f(8)}${f(4)}`;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const mockAdapter: CollectionAdapter = {
  async search(query: SearchQuery): Promise<SearchResult> {
    await delay(300);
    let results = RAW.map(present).filter((it) => matchesFilters(it, query.filters) && matchesText(it, query.text, i18n.locale));

    if (query.image) {
      // Simule une recherche visuelle : score pseudo-aléatoire dérivé du fichier.
      const seed = query.image.name.length + query.image.size + (query.imageInfo?.width ?? 0);
      results = results
        .map((it, i) => ({ ...it, score: Number((((seed * (i + 7)) % 97) / 100).toFixed(2)) }))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }

    return {
      items: paginate(results, query.page, query.pageSize),
      total: results.length,
      page: query.page,
      pageSize: query.pageSize
    };
  },

  async getItem(id: string): Promise<CollectionItem | null> {
    await delay(150);
    const raw = RAW.find((it) => it.id === id);
    return raw ? present(raw) : null;
  },

  /** Facettes dynamiques : seulement pour les champs `select` (aucun dans le schéma actuel). */
  async getFacets(): Promise<FacetValues> {
    await delay(100);
    return {};
  },

  /** Simule l'archivage : ne stocke rien, renvoie un identifiant et l'empreinte reçue. */
  async archiveImage(original: File, info?: ImageInfo): Promise<ArchiveReceipt> {
    await delay(200);
    return { id: `mock-${Date.now().toString(36)}-${original.size.toString(36)}`, sha256: info?.sha256 };
  }
};
