import { browser } from '$app/environment';
import { messages, locales, type Locale } from './messages';

/**
 * Store de langue (Svelte 5, runes dans un module .svelte.ts).
 * - `i18n.locale` : langue courante, réactive.
 * - `i18n.t(key, params)` : texte d'interface traduit.
 * - `i18n.l({ fr, en })` : libellé localisé d'un objet multilingue (schéma, groupes).
 * Détection : localStorage, puis langue du navigateur, puis français.
 */
const STORAGE_KEY = 'locale';
const FALLBACK: Locale = 'fr';

export type LocalizedLabel = Partial<Record<Locale, string>> & { fr: string };

function isLocale(s: string | null | undefined): s is Locale {
  return !!s && s in messages;
}

function detect(): Locale {
  if (!browser) return FALLBACK;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* stockage indisponible */
  }
  const nav = navigator.language?.slice(0, 2);
  return isLocale(nav) ? nav : FALLBACK;
}

function createI18n() {
  // Valeur initiale lue une fois, hors de l'état réactif : la balise <html lang>
  // est posée au chargement, puis mise à jour par set().
  const initial = detect();
  let locale = $state<Locale>(initial);

  if (browser) document.documentElement.lang = initial;

  return {
    locales,
    get locale() {
      return locale;
    },
    set(l: Locale) {
      if (!isLocale(l)) return;
      locale = l;
      if (browser) document.documentElement.lang = l;
      try {
        localStorage.setItem(STORAGE_KEY, l);
      } catch {
        /* ignore */
      }
    },
    t(key: string, params?: Record<string, string | number>): string {
      let k = key;
      if (params && typeof params.n === 'number' && params.n !== 1 && messages[locale][`${key}_plural`]) {
        k = `${key}_plural`;
      }
      let s = messages[locale][k] ?? messages.en[k] ?? messages.fr[k] ?? key;
      if (params) {
        for (const [p, v] of Object.entries(params)) s = s.replaceAll(`{${p}}`, String(v));
      }
      return s;
    },
    l(label: LocalizedLabel | string): string {
      if (typeof label === 'string') return label;
      return label[locale] ?? label.en ?? label.fr;
    }
  };
}

export const i18n = createI18n();
export type { Locale } from './messages';
