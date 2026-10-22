import type { LocalizedLabel } from '$lib/i18n/index.svelte';
import type { CollectionItem } from '$lib/api/types';

/**
 * Référentiels de risque : les Listes rouges de l'ICOM recensent, par pays, les catégories
 * de biens culturels les plus exposées au trafic. Une correspondance est un signal pour
 * l'agent, pas une preuve : l'objet peut être parfaitement en règle.
 *
 * Les catégories ci-dessous sont des correspondances larges vers les codes du schéma ;
 * les listes officielles sont plus fines. Source : https://icom.museum/fr/ressources/listes-rouges/
 */
export interface RiskRule {
  id: string;
  /** Pays ISO concerné(s) par la liste. */
  origins: string[];
  /** Catégories du schéma mentionnées par la liste. */
  categories: string[];
  label: LocalizedLabel;
  advice: LocalizedLabel;
  url: string;
  /** Liste d'urgence (conflit en cours). */
  emergency?: boolean;
}

const ARCHAEO = ['archaeological-fragment', 'vessel', 'ceramic', 'figurine', 'coin', 'sculpture', 'relief', 'jewellery', 'glassware', 'metalwork', 'seal', 'weapon'];
const RELIGIOUS = ['icon', 'religious-object', 'liturgical-object', 'manuscript', 'book'];

export const riskRules: RiskRule[] = [
  {
    id: 'icom-ua-2022',
    origins: ['UA'],
    categories: [...ARCHAEO, ...RELIGIOUS, 'textile', 'costume', 'painting', 'medal', 'ethnographic-object', 'furniture'],
    emergency: true,
    label: { fr: 'Liste rouge d’urgence ICOM · Ukraine (2022)', en: 'ICOM Emergency Red List · Ukraine (2022)' },
    advice: {
      fr: 'Catégorie recensée comme exposée au trafic depuis l’invasion de 2022. Vérifier le certificat d’exportation ukrainien et l’historique de propriété avant toute mainlevée.',
      en: 'Category listed as at risk of trafficking since the 2022 invasion. Check the Ukrainian export certificate and ownership history before release.'
    },
    url: 'https://icom.museum/fr/ressources/listes-rouges/'
  },
  {
    id: 'icom-sy',
    origins: ['SY'],
    categories: [...ARCHAEO, ...RELIGIOUS],
    emergency: true,
    label: { fr: 'Liste rouge d’urgence ICOM · Syrie', en: 'ICOM Emergency Red List · Syria' },
    advice: { fr: 'Biens archéologiques et religieux syriens sous embargo d’importation dans l’Union européenne et aux États-Unis.', en: 'Syrian archaeological and religious objects are under import restrictions in the EU and the US.' },
    url: 'https://icom.museum/fr/ressources/listes-rouges/'
  },
  {
    id: 'icom-iq',
    origins: ['IQ'],
    categories: [...ARCHAEO, ...RELIGIOUS],
    emergency: true,
    label: { fr: 'Liste rouge d’urgence ICOM · Irak', en: 'ICOM Emergency Red List · Iraq' },
    advice: { fr: 'Antiquités irakiennes : restrictions d’importation en vigueur, provenance à documenter avant 1990.', en: 'Iraqi antiquities: import restrictions in force; provenance must be documented before 1990.' },
    url: 'https://icom.museum/fr/ressources/listes-rouges/'
  },
  {
    id: 'icom-eg',
    origins: ['EG'],
    categories: ARCHAEO,
    label: { fr: 'Liste rouge ICOM · Égypte', en: 'ICOM Red List · Egypt' },
    advice: { fr: 'Antiquités égyptiennes : exportation interdite depuis 1983 sauf autorisation, provenance antérieure à documenter.', en: 'Egyptian antiquities: export banned since 1983 unless licensed; earlier provenance must be documented.' },
    url: 'https://icom.museum/fr/ressources/listes-rouges/'
  },
  {
    id: 'icom-pe',
    origins: ['PE'],
    categories: [...ARCHAEO, 'textile', 'mask'],
    label: { fr: 'Liste rouge ICOM · Pérou', en: 'ICOM Red List · Peru' },
    advice: { fr: 'Biens précolombiens : accord bilatéral États-Unis–Pérou, certificat d’exportation requis.', en: 'Pre-Columbian objects: US–Peru bilateral agreement, export certificate required.' },
    url: 'https://icom.museum/fr/ressources/listes-rouges/'
  },
  {
    id: 'icom-cn',
    origins: ['CN'],
    categories: ARCHAEO,
    label: { fr: 'Liste rouge ICOM · Chine', en: 'ICOM Red List · China' },
    advice: { fr: 'Biens archéologiques chinois antérieurs à 1911 : restrictions d’importation aux États-Unis.', en: 'Chinese archaeological material predating 1911: US import restrictions apply.' },
    url: 'https://icom.museum/fr/ressources/listes-rouges/'
  },
  {
    id: 'icom-ly-ye-af',
    origins: ['LY', 'YE', 'AF'],
    categories: [...ARCHAEO, ...RELIGIOUS],
    emergency: true,
    label: { fr: 'Listes rouges d’urgence ICOM · Libye, Yémen, Afghanistan', en: 'ICOM Emergency Red Lists · Libya, Yemen, Afghanistan' },
    advice: { fr: 'Zones de conflit : provenance à documenter avec une attention particulière.', en: 'Conflict zones: provenance requires particular scrutiny.' },
    url: 'https://icom.museum/fr/ressources/listes-rouges/'
  }
];

/** Règles correspondant à une origine et une catégorie données. */
export function riskForCodes(origin: string | undefined, category: string | undefined): RiskRule[] {
  if (!origin || !category) return [];
  return riskRules.filter((r) => r.origins.includes(origin) && r.categories.includes(category));
}

export function riskFor(item: CollectionItem): RiskRule[] {
  return riskForCodes(item.metadata.origin ? String(item.metadata.origin) : undefined, item.metadata.category ? String(item.metadata.category) : undefined);
}
