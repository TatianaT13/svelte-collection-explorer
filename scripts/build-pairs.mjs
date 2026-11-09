/**
 * Paires (photo principale, vue alternative) d'objets du Met, embarquées avec un modèle gelé.
 * Servent à la calibration conforme (calibrate.mjs) et à l'affinage (experiments/train-head.mjs).
 *
 *   node scripts/build-pairs.mjs                      # dinov2-small, ~400 objets
 *   node scripts/build-pairs.mjs --model clip --max 600
 *
 * Produit eval/pairs/<modèle>.json : { model, dim, objects: [{ id, category, origin, primary: [...], alt: [...] }] }.
 * Vecteurs seulement, pas d'images. Les objets du corpus de démo sont exclus : ils restent le jeu de test.
 */
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { RawImage } from '@huggingface/transformers';
import { getModel } from './lib/models.mjs';
import { argValue } from './lib/metrics.mjs';

const API = 'https://collectionapi.metmuseum.org/public/collection/v1';
const MODEL_KEY = argValue('--model', 'dinov2-small');
const MAX = Number(argValue('--max', 400));
const PX = 512;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mêmes thèmes que build-data.mjs, élargis : variété de types et d'origines, accent Europe de l'Est et pays du 19 CFR §12.104g. */
const QUERIES = [
  'icon', 'ukraine', 'kiev', 'russian', 'byzantine', 'amphora', 'greek vase', 'egyptian', 'roman bronze', 'persian',
  'chinese porcelain', 'peru', 'textile embroidery', 'coin gold', 'jewelry', 'manuscript illuminated', 'mask', 'sword',
  'medal', 'ivory', 'cypriot', 'etruscan', 'mesopotamia', 'syrian', 'coptic', 'islamic ceramic', 'precolumbian', 'maya',
  'inca', 'nubian', 'reliquary', 'chalice', 'bronze figure', 'terracotta figurine', 'glass bottle', 'seal cylinder'
];

async function getJson(url, attempt = 0) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if ((res.status === 403 || res.status === 429) && attempt < 3) {
    await sleep(2500 * (attempt + 1));
    return getJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function readResized(url) {
  const img = await RawImage.read(url);
  const scale = Math.min(1, PX / Math.max(img.width, img.height));
  return scale < 1 ? await img.resize(Math.round(img.width * scale), Math.round(img.height * scale)) : img;
}

const COUNTRY = { ukraine: 'UA', russia: 'RU', greece: 'GR', egypt: 'EG', italy: 'IT', peru: 'PE', china: 'CN', turkey: 'TR', iran: 'IR', syria: 'SY', iraq: 'IQ', cyprus: 'CY', israel: 'IL', mexico: 'MX', india: 'IN', japan: 'JP', france: 'FR', germany: 'DE', spain: 'ES', 'united kingdom': 'GB', 'united states': 'US' };
const origin = (o) => COUNTRY[(o.country || '').toLowerCase().trim()] ?? '';
const category = (o) => `${o.objectName || ''} ${o.classification || ''}`.toLowerCase().split(/[^a-z]+/).find((w) => w.length > 2) ?? 'other';

async function main() {
  const def = getModel(MODEL_KEY);
  const exclude = new Set(JSON.parse(await readFile('static/data/items.json', 'utf8')).items.map((it) => String(it.id)));
  await mkdir('eval/pairs', { recursive: true });
  const outPath = `eval/pairs/${MODEL_KEY}.json`;
  const objects = [];
  if (await access(outPath).then(() => true, () => false)) {
    objects.push(...JSON.parse(await readFile(outPath, 'utf8')).objects);
    console.log(`${objects.length} objets déjà présents dans ${outPath}, on complète`);
  }
  const seen = new Set(objects.map((o) => o.id));

  console.log('chargement du modèle', def.id);
  const embed = await def.load();
  const rounded = (v) => [...v].map((x) => Math.round(x * 10000) / 10000);

  for (const q of QUERIES) {
    if (objects.length >= MAX) break;
    await sleep(600);
    let ids;
    try {
      ids = (await getJson(`${API}.1/search?hasImages=true&isPublicDomain=true&limit=60&q=${encodeURIComponent(q)}`)).objectIDs ?? [];
    } catch (e) {
      console.warn('recherche échouée', q, e.message);
      continue;
    }
    let taken = 0;
    for (const id of ids) {
      if (taken >= 20 || objects.length >= MAX) break;
      const sid = String(id);
      if (seen.has(sid) || exclude.has(sid)) continue;
      seen.add(sid);
      await sleep(80);
      let o;
      try {
        o = await getJson(`${API}/objects/${id}`);
      } catch {
        continue;
      }
      const alt = (o.additionalImages ?? []).find((u) => u && u !== o.primaryImage);
      if (!o.isPublicDomain || !o.primaryImageSmall || !alt) continue;
      try {
        const [p, a] = await Promise.all([readResized(o.primaryImageSmall), readResized(alt)]);
        objects.push({ id: sid, title: o.title || '', category: category(o), origin: origin(o), primary: rounded(await embed(p)), alt: rounded(await embed(a)) });
        taken++;
        process.stdout.write(`\r${objects.length} paires… (${q})      `);
      } catch (e) {
        console.warn('\nimage illisible', sid, e.message);
      }
    }
    await writeFile(outPath, JSON.stringify({ model: def.id, dim: objects[0]?.primary.length ?? 0, generatedAt: new Date().toISOString(), objects }));
  }
  console.log(`\nécrit ${outPath} (${objects.length} paires, ${MODEL_KEY})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
