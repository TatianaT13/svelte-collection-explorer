/**
 * Constitue le jeu de données de démonstration à partir de l'API Open Access du
 * Metropolitan Museum of Art (objets du domaine public, CC0).
 *
 *   node scripts/build-data.mjs            # ~64 objets
 *   node scripts/build-data.mjs --max 40
 *
 * Produit :
 *   static/data/thumbs/<id>.jpg   vignettes 512 px
 *   static/data/items.json        objets au format CollectionItem + embedding CLIP
 *
 * Les embeddings sont calculés avec le même modèle que celui chargé dans le
 * navigateur (src/lib/ml/embedder.ts), pour que la recherche par image soit cohérente.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';

const API = 'https://collectionapi.metmuseum.org/public/collection/v1';
const MODEL = 'Xenova/clip-vit-base-patch32';
const MAX = Number(process.argv[process.argv.indexOf('--max') + 1]) || 64;
const PER_QUERY = 4;
const THUMB_PX = 512;

/** Thèmes de recherche : variété de types, matériaux et origines, avec un accent sur l'Europe de l'Est. */
const QUERIES = [
  'icon', 'ukraine', 'kiev', 'russian', 'byzantine', 'amphora', 'greek vase', 'egyptian', 'roman bronze',
  'persian', 'chinese porcelain', 'peru', 'textile embroidery', 'coin gold', 'jewelry', 'manuscript illuminated',
  'mask', 'sword', 'medal', 'ivory'
];

// ---------- correspondances vers le schéma ----------

const COUNTRY_BY_NAME = {
  ukraine: 'UA', russia: 'RU', greece: 'GR', egypt: 'EG', italy: 'IT', peru: 'PE', china: 'CN', turkey: 'TR',
  iran: 'IR', france: 'FR', syria: 'SY', iraq: 'IQ', india: 'IN', japan: 'JP', germany: 'DE', spain: 'ES',
  'united kingdom': 'GB', england: 'GB', netherlands: 'NL', belgium: 'BE', mexico: 'MX', cyprus: 'CY',
  israel: 'IL', lebanon: 'LB', jordan: 'JO', tunisia: 'TN', morocco: 'MA', ethiopia: 'ET', nigeria: 'NG',
  'democratic republic of the congo': 'CD', mali: 'ML', ghana: 'GH', indonesia: 'ID', thailand: 'TH', korea: 'KR',
  afghanistan: 'AF', pakistan: 'PK', uzbekistan: 'UZ', georgia: 'GE', armenia: 'AM', poland: 'PL', austria: 'AT',
  switzerland: 'CH', hungary: 'HU', bulgaria: 'BG', romania: 'RO', serbia: 'RS', 'united states': 'US',
  colombia: 'CO', ecuador: 'EC', bolivia: 'BO', guatemala: 'GT', 'costa rica': 'CR', panama: 'PA', sudan: 'SD',
  libya: 'LY', algeria: 'DZ', 'sri lanka': 'LK', nepal: 'NP', tibet: 'CN', vietnam: 'VN', cambodia: 'KH', myanmar: 'MM'
};
const COUNTRY_BY_CULTURE = [
  ['ukrain', 'UA'], ['kiev', 'UA'], ['kyiv', 'UA'], ['russia', 'RU'], ['novgorod', 'RU'], ['moscow', 'RU'],
  ['greek', 'GR'], ['attic', 'GR'], ['corinth', 'GR'], ['cycladic', 'GR'], ['minoan', 'GR'], ['mycenaean', 'GR'],
  ['egypt', 'EG'], ['coptic', 'EG'], ['roman', 'IT'], ['etruscan', 'IT'], ['italian', 'IT'], ['venetian', 'IT'],
  ['byzantine', 'TR'], ['ottoman', 'TR'], ['turkish', 'TR'], ['anatolia', 'TR'], ['iran', 'IR'], ['persian', 'IR'],
  ['sasanian', 'IR'], ['safavid', 'IR'], ['chinese', 'CN'], ['china', 'CN'], ['peru', 'PE'], ['inca', 'PE'], ['moche', 'PE'],
  ['chimú', 'PE'], ['nazca', 'PE'], ['french', 'FR'], ['syria', 'SY'], ['mesopotamia', 'IQ'], ['assyrian', 'IQ'],
  ['babylon', 'IQ'], ['sumerian', 'IQ'], ['india', 'IN'], ['mughal', 'IN'], ['japan', 'JP'], ['german', 'DE'],
  ['spanish', 'ES'], ['british', 'GB'], ['english', 'GB'], ['netherland', 'NL'], ['dutch', 'NL'], ['flemish', 'BE'],
  ['aztec', 'MX'], ['maya', 'MX'], ['mexic', 'MX'], ['cypriot', 'CY'], ['korea', 'KR'], ['tibet', 'CN'],
  ['armenia', 'AM'], ['georgia', 'GE'], ['polish', 'PL'], ['american', 'US'], ['nubia', 'SD'], ['edo', 'NG'],
  ['yoruba', 'NG'], ['kongo', 'CD'], ['dogon', 'ML'], ['akan', 'GH'], ['thai', 'TH'], ['khmer', 'KH'], ['balkan', 'RS'],
  ['bulgar', 'BG'], ['romania', 'RO'], ['hungar', 'HU'], ['austria', 'AT'], ['swiss', 'CH']
];
function toOrigin(o) {
  const c = (o.country || '').toLowerCase().trim();
  if (c && COUNTRY_BY_NAME[c]) return COUNTRY_BY_NAME[c];
  const hay = `${o.culture} ${o.country} ${o.region} ${o.subregion} ${o.artistNationality}`.toLowerCase();
  for (const [k, code] of COUNTRY_BY_CULTURE) if (hay.includes(k)) return code;
  return '';
}

const CATEGORY_RULES = [
  ['icon', 'icon'], ['painting', 'painting'], ['drawing', 'drawing'], ['print', 'print'], ['photograph', 'photograph'],
  ['relief', 'relief'], ['sculpture', 'sculpture'], ['statue', 'sculpture'], ['figure', 'figurine'], ['figurine', 'figurine'],
  ['manuscript', 'manuscript'], ['codex', 'manuscript'], ['folio', 'manuscript'], ['leaf', 'manuscript'], ['book', 'book'],
  ['map', 'map'], ['coin', 'coin'], ['medal', 'medal'], ['seal', 'seal'], ['jewel', 'jewellery'], ['ring', 'jewellery'],
  ['necklace', 'jewellery'], ['earring', 'jewellery'], ['bracelet', 'jewellery'], ['pendant', 'jewellery'], ['brooch', 'jewellery'],
  ['glass', 'glassware'], ['vase', 'vessel'], ['amphora', 'vessel'], ['bowl', 'vessel'], ['cup', 'vessel'], ['jar', 'vessel'],
  ['jug', 'vessel'], ['bottle', 'vessel'], ['vessel', 'vessel'], ['ceramic', 'ceramic'], ['pottery', 'ceramic'], ['terracotta', 'ceramic'],
  ['porcelain', 'ceramic'], ['stoneware', 'ceramic'], ['earthenware', 'ceramic'], ['sword', 'weapon'], ['dagger', 'weapon'],
  ['weapon', 'weapon'], ['arm', 'weapon'], ['helmet', 'armour'], ['armor', 'armour'], ['armour', 'armour'], ['furniture', 'furniture'],
  ['chair', 'furniture'], ['chest', 'furniture'], ['cabinet', 'furniture'], ['textile', 'textile'], ['tapestry', 'textile'],
  ['embroider', 'textile'], ['carpet', 'carpet'], ['rug', 'carpet'], ['costume', 'costume'], ['dress', 'costume'], ['robe', 'costume'],
  ['instrument', 'musical-instrument'], ['clock', 'clock'], ['watch', 'clock'], ['tool', 'tool'], ['mask', 'mask'],
  ['reliquary', 'liturgical-object'], ['chalice', 'liturgical-object'], ['censer', 'liturgical-object'], ['cross', 'religious-object'],
  ['crucifix', 'religious-object'], ['amulet', 'religious-object'], ['fragment', 'archaeological-fragment'], ['shard', 'archaeological-fragment'],
  ['ivory', 'sculpture'], ['metalwork', 'metalwork'], ['toy', 'toy']
];
function toCategory(o) {
  const hay = `${o.objectName} ${o.classification}`.toLowerCase();
  for (const [k, code] of CATEGORY_RULES) if (hay.includes(k)) return code;
  return 'other';
}

const MATERIAL_RULES = [
  ['gold', 'gold'], ['gilt', 'gold'], ['silver', 'silver'], ['bronze', 'bronze'], ['copper', 'copper'], ['brass', 'brass'],
  ['iron', 'iron'], ['steel', 'steel'], ['lead', 'lead'], ['tin', 'tin'], ['pewter', 'tin'], ['terracotta', 'terracotta'],
  ['earthenware', 'earthenware'], ['faience', 'earthenware'], ['maiolica', 'earthenware'], ['stoneware', 'stoneware'],
  ['porcelain', 'porcelain'], ['clay', 'clay'], ['marble', 'marble'], ['limestone', 'limestone'], ['sandstone', 'sandstone'],
  ['granite', 'granite'], ['alabaster', 'alabaster'], ['stone', 'stone'], ['basalt', 'stone'], ['jade', 'stone'], ['glass', 'glass'],
  ['enamel', 'enamel'], ['wood', 'wood'], ['oak', 'wood'], ['walnut', 'wood'], ['bone', 'bone'], ['ivory', 'ivory'], ['horn', 'horn'],
  ['shell', 'shell'], ['mother-of-pearl', 'shell'], ['amber', 'amber'], ['coral', 'coral'], ['pearl', 'pearl'], ['leather', 'leather'],
  ['parchment', 'parchment'], ['vellum', 'parchment'], ['papyrus', 'papyrus'], ['paper', 'paper'], ['linen', 'linen'], ['wool', 'wool'],
  ['silk', 'silk'], ['cotton', 'cotton'], ['canvas', 'canvas'], ['oil', 'oil-paint'], ['tempera', 'tempera'], ['watercolor', 'watercolour'],
  ['ink', 'ink'], ['pigment', 'pigment'], ['gesso', 'gesso'], ['lacquer', 'lacquer'], ['plaster', 'plaster'], ['wax', 'wax']
];
const TECHNIQUE_RULES = [
  ['carved', 'carved'], ['cast', 'cast'], ['forged', 'forged'], ['chased', 'chased'], ['engraved', 'engraved'], ['engraving', 'engraved'],
  ['repoussé', 'embossed'], ['embossed', 'embossed'], ['gilt', 'gilded'], ['gilded', 'gilded'], ['gilding', 'gilded'], ['inlaid', 'inlaid'],
  ['inlay', 'inlaid'], ['niello', 'inlaid'], ['enamel', 'enamelled'], ['cloisonné', 'enamelled'], ['painted', 'painted'], ['paint', 'painted'],
  ['glazed', 'glazed'], ['glaze', 'glazed'], ['wheel', 'wheel-thrown'], ['molded', 'moulded'], ['moulded', 'moulded'], ['woven', 'woven'],
  ['tapestry', 'woven'], ['embroider', 'embroidered'], ['knotted', 'knotted'], ['printed', 'printed'], ['lithograph', 'lithograph'],
  ['etching', 'etching'], ['woodcut', 'woodcut'], ['photograph', 'photographic'], ['assembled', 'assembled'], ['welded', 'welded']
];
function pickAll(rules, text, max = 3) {
  const t = text.toLowerCase();
  const out = [];
  for (const [k, code] of rules) if (t.includes(k) && !out.includes(code)) out.push(code);
  return out.slice(0, max);
}

function toPeriod(o) {
  const y = Number.isFinite(o.objectBeginDate) ? o.objectBeginDate : NaN;
  const culture = (o.culture || '').toLowerCase();
  if (!Number.isFinite(y)) return 'unknown';
  if (culture.includes('byzantine') && y >= 300 && y < 1453) return 'byzantine';
  if (y < -3000) return 'prehistory';
  if (y < -1200) return 'bronze-age';
  if (y < -800) return 'iron-age';
  if (y < -323) return 'antiquity';
  if (y < -31) return 'hellenistic';
  if (y < 300) return 'roman';
  if (y < 600) return 'late-antiquity';
  if (y < 1000) return 'early-medieval';
  if (y < 1300) return 'medieval';
  if (y < 1450) return 'late-medieval';
  if (y < 1600) return 'renaissance';
  if (y < 1700) return 'baroque';
  if (y < 1800) return '18th';
  if (y < 1900) return '19th';
  if (y < 1918) return 'early-20th';
  if (y < 1945) return 'interwar';
  if (y < 1990) return 'post-1945';
  return 'contemporary';
}

const SUBJECT_RULES = [
  [['christ', 'virgin', 'madonna', 'saint', 'angel', 'buddha', 'bodhisattva', 'god', 'goddess', 'deity', 'cross', 'crucifix', 'prayer'], 'religious'],
  [['zeus', 'athena', 'hercules', 'dionysus', 'apollo', 'aphrodite', 'eros', 'satyr', 'centaur', 'sphinx', 'griffin', 'myth'], 'mythological'],
  [['portrait', 'men', 'women', 'boys', 'girls', 'kings', 'queens', 'emperor'], 'portrait'],
  [['landscape', 'mountains', 'rivers', 'trees'], 'landscape'],
  [['still life', 'fruit', 'vessels'], 'still-life'],
  [['horse', 'bird', 'lion', 'dog', 'cat', 'fish', 'animal', 'bull', 'snake', 'deer', 'elephant', 'eagle'], 'animal'],
  [['flower', 'plant', 'leaves', 'floral', 'vine'], 'floral'],
  [['geometric', 'pattern'], 'geometric'], [['coat of arms', 'heraldry'], 'heraldic'], [['inscription', 'text', 'calligraphy'], 'inscription'],
  [['funerary', 'tomb', 'death', 'mummy', 'sarcophag'], 'funerary'], [['soldier', 'battle', 'war', 'weapon', 'armor'], 'military'],
  [['boat', 'ship', 'sea'], 'maritime'], [['domestic', 'kitchen', 'dining'], 'domestic']
];
function toSubject(o) {
  const hay = `${(o.tags || []).map((t) => t.term).join(' ')} ${o.title}`.toLowerCase();
  for (const [keys, code] of SUBJECT_RULES) if (keys.some((k) => hay.includes(k))) return code;
  return '';
}

function toMeasures(o) {
  const m = (o.measurements || []).find((x) => /overall/i.test(x.elementName || '')) || (o.measurements || [])[0];
  const e = m?.elementMeasurements || {};
  const r = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
  return { height_cm: r(e.Height), width_cm: r(e.Width), depth_cm: r(e.Depth), weight_g: Number.isFinite(e.Weight) ? Math.round(e.Weight * 1000) : null };
}

// ---------- collecte ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url, attempt = 0) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if ((res.status === 403 || res.status === 429) && attempt < 3) {
    await sleep(2500 * (attempt + 1)); // limitation de débit : on patiente puis on réessaie
    return getJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function collect() {
  const seen = new Set();
  const objects = [];
  for (const q of QUERIES) {
    if (objects.length >= MAX) break;
    await sleep(800);
    let ids = [];
    try {
      const r = await getJson(`${API}.1/search?hasImages=true&isPublicDomain=true&limit=40&q=${encodeURIComponent(q)}`);
      ids = r.objectIDs || [];
    } catch (e) {
      console.warn('recherche échouée', q, e.message);
      continue;
    }
    let taken = 0;
    for (const id of ids) {
      if (taken >= PER_QUERY || objects.length >= MAX) break;
      if (seen.has(id)) continue;
      seen.add(id);
      await sleep(60);
      let o;
      try {
        o = await getJson(`${API}/objects/${id}`);
      } catch {
        continue;
      }
      if (!o.isPublicDomain || !o.primaryImageSmall) continue;
      const category = toCategory(o);
      if (category === 'print' || category === 'drawing' || category === 'photograph') continue; // moins pertinent pour les douanes
      objects.push({ o, query: q, category });
      taken++;
      process.stdout.write(`\r${objects.length} objets… (${q})      `);
    }
  }
  console.log();
  return objects;
}

// ---------- vignettes + embeddings ----------

async function main() {
  await mkdir('static/data/thumbs', { recursive: true });
  const collected = await collect();

  env.allowLocalModels = false;
  console.log('chargement du modèle', MODEL);
  const processor = await AutoProcessor.from_pretrained(MODEL);
  const vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: 'q8' });

  const items = [];
  for (const { o, category } of collected) {
    const id = String(o.objectID);
    let img;
    try {
      img = await RawImage.read(o.primaryImageSmall);
    } catch (e) {
      console.warn('image illisible', id, e.message);
      continue;
    }
    const scale = Math.min(1, THUMB_PX / Math.max(img.width, img.height));
    const thumb = scale < 1 ? await img.resize(Math.round(img.width * scale), Math.round(img.height * scale)) : img;
    await thumb.save(`static/data/thumbs/${id}.jpg`);

    const inputs = await processor(thumb);
    const { image_embeds } = await vision(inputs);
    const vec = image_embeds.normalize(2, -1).tolist()[0].map((x) => Math.round(x * 10000) / 10000);

    const medium = o.medium || '';
    items.push({
      id,
      title: o.title || o.objectName || `Objet ${id}`,
      imageUrl: o.primaryImageSmall,
      thumbnailUrl: `data/thumbs/${id}.jpg`,
      metadata: {
        category,
        origin: toOrigin(o),
        period: toPeriod(o),
        year: Number.isFinite(o.objectBeginDate) ? o.objectBeginDate : null,
        maker: o.artistDisplayName || '',
        material: pickAll(MATERIAL_RULES, medium),
        technique: pickAll(TECHNIQUE_RULES, medium, 2),
        ...toMeasures(o),
        subject: toSubject(o),
        inscriptions: '',
        distinguishing_features: '',
        description: [medium, o.culture, o.objectDate].filter(Boolean).join(' · '),
        inventory: o.accessionNumber || '',
        source: `The Metropolitan Museum of Art, Open Access (CC0) · ${o.objectURL}`
      },
      embedding: vec
    });
    process.stdout.write(`\rembeddings ${items.length}/${collected.length}   `);
  }
  console.log();

  const out = { model: MODEL, generatedAt: new Date().toISOString(), source: 'The Metropolitan Museum of Art Open Access API (CC0)', items };
  await writeFile('static/data/items.json', JSON.stringify(out));
  console.log(`écrit static/data/items.json (${items.length} objets)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
