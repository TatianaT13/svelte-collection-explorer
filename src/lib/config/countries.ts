/**
 * Pays : codes ISO 3166-1 alpha-2, traduits à l'affichage par `Intl.DisplayNames`.
 * On stocke le code (stable, indépendant de la langue), on affiche le nom localisé.
 */

export const COUNTRY_CODES: readonly string[] = [
  'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ',
  'BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ',
  'CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ',
  'DE','DJ','DK','DM','DO','DZ',
  'EC','EE','EG','EH','ER','ES','ET',
  'FI','FJ','FK','FM','FO','FR',
  'GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY',
  'HK','HM','HN','HR','HT','HU',
  'ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT',
  'JE','JM','JO','JP',
  'KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ',
  'LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY',
  'MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ',
  'NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ',
  'OM',
  'PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY',
  'QA',
  'RE','RO','RS','RU','RW',
  'SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ',
  'TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ',
  'UA','UG','UM','US','UY','UZ',
  'VA','VC','VE','VG','VI','VN','VU',
  'WF','WS',
  'YE','YT',
  'ZA','ZM','ZW'
];

const displayNames = new Map<string, Intl.DisplayNames>();

function namesFor(locale: string): Intl.DisplayNames {
  let dn = displayNames.get(locale);
  if (!dn) {
    dn = new Intl.DisplayNames([locale], { type: 'region', fallback: 'code' });
    displayNames.set(locale, dn);
  }
  return dn;
}

/** Nom localisé d'un pays. Retourne le code si inconnu. */
export function countryName(code: string, locale: string): string {
  if (!code) return '';
  try {
    return namesFor(locale).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export interface CountryOption {
  code: string;
  name: string;
}

const optionsCache = new Map<string, CountryOption[]>();

/** Tous les pays, triés par nom dans la langue demandée. */
export function countryOptions(locale: string): CountryOption[] {
  let opts = optionsCache.get(locale);
  if (!opts) {
    const collator = new Intl.Collator(locale);
    opts = COUNTRY_CODES.map((code) => ({ code, name: countryName(code, locale) })).sort((a, b) =>
      collator.compare(a.name, b.name)
    );
    optionsCache.set(locale, opts);
  }
  return opts;
}
