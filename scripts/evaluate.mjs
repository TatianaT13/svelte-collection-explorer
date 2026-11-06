/**
 * Évaluation chiffrée de la recherche par image : une vue alternative d'un objet du corpus
 * (dos, détail, autre angle, fournie par le Met) doit retrouver cet objet.
 *
 *   node scripts/evaluate.mjs                       # CLIP, requêtes = eval/queries.json (sinon static/data/samples.json)
 *   node scripts/evaluate.mjs --build               # constitue d'abord eval/queries.json : une vue alternative par objet qui en a une
 *   node scripts/evaluate.mjs --models clip,dinov2-small
 *   node scripts/evaluate.mjs --models dinov2-small --head eval/heads/dinov2-small.json   # tête apprise (experiments/)
 *
 * Mesures par modèle : recall@1/5/10, MRR, rang médian, catégorie et origine du top-1,
 * et la distribution du score de la bonne réponse (pour situer τ). Produit eval/results.json.
 * Les embeddings du corpus sont recalculés par modèle depuis static/data/thumbs et mis en cache dans eval/cache/.
 */
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { RawImage } from '@huggingface/transformers';
import { getModel } from './lib/models.mjs';
import { argValue, cosine, loadCorpus, median, pct, projector, round3 } from './lib/metrics.mjs';

const API = 'https://collectionapi.metmuseum.org/public/collection/v1';
const PX = 1024;
const BUILD = process.argv.includes('--build');
const MODELS = argValue('--models', 'clip').split(',');
const HEAD = argValue('--head', null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (p) => access(p).then(() => true, () => false);

async function getJson(url, attempt = 0) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if ((res.status === 403 || res.status === 429) && attempt < 3) {
    await sleep(2500 * (attempt + 1));
    return getJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/** Jeu de requêtes : une vue alternative par objet du corpus qui en propose une. */
async function buildQueries(items) {
  await mkdir('eval/images', { recursive: true });
  const queries = [];
  for (const it of items) {
    await sleep(120);
    let o;
    try {
      o = await getJson(`${API}/objects/${it.id}`);
    } catch (e) {
      console.warn('objet indisponible', it.id, e.message);
      continue;
    }
    const alt = (o.additionalImages ?? []).find((u) => u && u !== o.primaryImage);
    if (!alt) continue;
    const file = `eval/images/${it.id}-alt.jpg`;
    try {
      if (!(await exists(file))) {
        const img = await RawImage.read(alt);
        const scale = Math.min(1, PX / Math.max(img.width, img.height));
        await (scale < 1 ? await img.resize(Math.round(img.width * scale), Math.round(img.height * scale)) : img).save(file);
      }
      queries.push({ file, objectId: it.id, title: it.title, category: it.metadata.category, origin: it.metadata.origin, source: alt });
      process.stdout.write(`\r${queries.length} requêtes… `);
    } catch (e) {
      console.warn('\nimage illisible', it.id, e.message);
    }
  }
  console.log();
  await writeFile('eval/queries.json', JSON.stringify({ note: 'Vues alternatives d’objets du corpus (Met, CC0) : vérité terrain = objectId', generatedAt: new Date().toISOString(), queries }, null, 2));
  console.log(`écrit eval/queries.json (${queries.length} requêtes)`);
  return queries;
}

export async function loadQueries(items) {
  if (BUILD) return buildQueries(items);
  if (await exists('eval/queries.json')) return JSON.parse(await readFile('eval/queries.json', 'utf8')).queries;
  console.log('eval/queries.json absent : repli sur static/data/samples.json (lancer --build pour un jeu plus large)');
  const { samples } = JSON.parse(await readFile('static/data/samples.json', 'utf8'));
  return samples.map((s) => ({ ...s, file: `static/${s.file}` }));
}

/** Embeddings du corpus pour un modèle, depuis les vignettes stockées, avec cache. */
export async function corpusEmbeddings(key, embed, items) {
  await mkdir('eval/cache', { recursive: true });
  const cache = `eval/cache/${key}.json`;
  if (await exists(cache)) {
    const c = JSON.parse(await readFile(cache, 'utf8'));
    if (c.ids.length === items.length && c.ids.every((id, i) => id === items[i].id)) return c.vectors.map((v) => Float32Array.from(v));
  }
  const vectors = [];
  for (const it of items) {
    vectors.push(await embed(await RawImage.read(`static/data/thumbs/${it.id}.jpg`)));
    process.stdout.write(`\r  corpus ${vectors.length}/${items.length}`);
  }
  console.log();
  await writeFile(cache, JSON.stringify({ model: getModel(key).id, ids: items.map((it) => it.id), vectors: vectors.map((v) => [...v].map((x) => Math.round(x * 10000) / 10000)) }));
  return vectors;
}

async function loadHead(modelId) {
  if (!HEAD) return null;
  const head = JSON.parse(await readFile(HEAD, 'utf8'));
  if (head.model !== modelId) {
    console.log(`  tête ${HEAD} ignorée : entraînée pour ${head.model}`);
    return null;
  }
  console.log(`  tête appliquée : ${HEAD} (${head.trainedOn} paires, ${head.epochs} époques)`);
  return head;
}

async function evaluate(key, corpusData, queries) {
  const def = getModel(key);
  console.log(`\n== ${key} (${def.id})`);
  const raw = await def.load();
  const head = await loadHead(def.id);
  const project = projector(head);
  const embed = async (img) => project(await raw(img));
  const { items } = corpusData;
  const corpus = (await corpusEmbeddings(key, raw, items)).map(project);

  // Cohérence index / requête : embeddings.bin doit être ce que le modèle du navigateur produit sur les vignettes.
  if (def.id === corpusData.model && !head) {
    const drift = items.map((_, i) => 1 - cosine(corpusData.vectors[i], corpus[i]));
    console.log(`  écart max entre embeddings.bin et recalcul : ${Math.max(...drift).toFixed(4)} (0 = même modèle, même image)`);
  }

  const rows = [];
  for (const q of queries) {
    const t0 = performance.now();
    const v = await embed(await RawImage.read(q.file));
    const ms = performance.now() - t0;
    const ranked = items.map((it, i) => ({ id: it.id, score: cosine(v, corpus[i]), category: it.metadata.category, origin: it.metadata.origin })).sort((a, b) => b.score - a.score);
    const rank = ranked.findIndex((r) => r.id === q.objectId) + 1;
    const truth = ranked[rank - 1];
    const bestOther = ranked.find((r) => r.id !== q.objectId);
    rows.push({ objectId: q.objectId, title: q.title, rank, truthScore: truth.score, top1: ranked[0].id, marginVsBestOther: truth.score - bestOther.score, categoryHit: ranked[0].category === q.category, originHit: !!q.origin && ranked[0].origin === q.origin, ms: Math.round(ms) });
    process.stdout.write(`\r  requêtes ${rows.length}/${queries.length}`);
  }
  console.log();

  const n = rows.length;
  const share = (f) => pct(rows.filter(f).length / n);
  const summary = {
    model: def.id,
    dim: corpus[0].length,
    queries: n,
    'recall@1': share((r) => r.rank === 1),
    'recall@5': share((r) => r.rank <= 5),
    'recall@10': share((r) => r.rank <= 10),
    mrr: round3(rows.reduce((s, r) => s + 1 / r.rank, 0) / n),
    medianRank: median(rows.map((r) => r.rank)),
    'category@1': share((r) => r.categoryHit),
    'origin@1': share((r) => r.originHit),
    medianTruthScore: round3(median(rows.map((r) => r.truthScore))),
    'truth>=0.75': share((r) => r.truthScore >= 0.75),
    'truth>=0.8': share((r) => r.truthScore >= 0.8),
    medianMargin: round3(median(rows.map((r) => r.marginVsBestOther))),
    medianMs: median(rows.map((r) => r.ms))
  };
  return { summary, rows };
}

function table(results) {
  const keys = ['recall@1', 'recall@5', 'recall@10', 'mrr', 'medianRank', 'category@1', 'origin@1', 'medianTruthScore', 'truth>=0.75', 'truth>=0.8', 'medianMargin', 'medianMs', 'dim'];
  const names = Object.keys(results);
  const lines = [`| mesure | ${names.join(' | ')} |`, `|---|${names.map(() => '---:').join('|')}|`];
  for (const k of keys) lines.push(`| ${k} | ${names.map((m) => results[m].summary[k]).join(' | ')} |`);
  return lines.join('\n');
}

async function main() {
  const corpusData = await loadCorpus();
  const queries = await loadQueries(corpusData.items);
  console.log(`${corpusData.items.length} objets de référence, ${queries.length} requêtes (vues alternatives)`);
  const results = {};
  for (const key of MODELS) results[key] = await evaluate(key, corpusData, queries);
  await mkdir('eval', { recursive: true });
  await writeFile('eval/results.json', JSON.stringify({ generatedAt: new Date().toISOString(), corpus: corpusData.items.length, queries: queries.length, head: HEAD, results }, null, 2));
  console.log(`\n${table(results)}\n\nrecall@k : part des requêtes dont le bon objet est dans les k premiers · MRR : moyenne de 1/rang\ncategory@1, origin@1 : le premier résultat a la même catégorie / origine que le bon objet\ntruth>=0.75 : part des bonnes réponses au-dessus de ce seuil · margin : score du bon objet − meilleur autre\nécrit eval/results.json`);
}

if (process.argv[1]?.endsWith('evaluate.mjs')) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
