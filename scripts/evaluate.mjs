/**
 * Évaluation chiffrée de la recherche par image : une vue alternative d'un objet du corpus
 * (dos, détail, autre angle, fournie par le Met) doit retrouver cet objet.
 *
 *   node scripts/evaluate.mjs                       # CLIP, requêtes = eval/queries.json (sinon static/data/samples.json)
 *   node scripts/evaluate.mjs --build               # constitue d'abord eval/queries.json : une vue alternative par objet qui en a une
 *   node scripts/evaluate.mjs --models clip,dinov2-small
 *
 * Mesures par modèle : recall@1/5/10, MRR, rang médian, catégorie et origine du top-1,
 * et la distribution du score de la bonne réponse (pour situer les seuils de schema.similarity).
 * Produit eval/results.json. Les embeddings du corpus sont recalculés par modèle depuis
 * static/data/thumbs et mis en cache dans eval/cache/.
 */
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { AutoModel, AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';

const API = 'https://collectionapi.metmuseum.org/public/collection/v1';
const PX = 1024;
const BUILD = process.argv.includes('--build');
const MODELS = (process.argv[process.argv.indexOf('--models') + 1] || 'clip').split(',').filter((m) => !m.startsWith('--'));
const HEAD = process.argv.includes('--head') ? process.argv[process.argv.indexOf('--head') + 1] : null;
const RERANK = process.argv.includes('--rerank');
const TOPK = Number(process.argv[process.argv.indexOf('--topk') + 1]) || 20;
/** Fragments : part du côté conservée par recadrage centré (1 = image entière). */
const CROPS = process.argv.includes('--crops') ? [1, 0.7, 0.5] : [1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
env.allowLocalModels = false;

/** Modèles comparables : même interface { id, embed(image) → Float32Array normalisé }. */
const REGISTRY = {
  clip: {
    id: 'Xenova/clip-vit-base-patch32',
    async load() {
      const processor = await AutoProcessor.from_pretrained(this.id);
      const model = await CLIPVisionModelWithProjection.from_pretrained(this.id, { dtype: 'q8' });
      return async (img) => {
        const { image_embeds } = await model(await processor(img));
        return Float32Array.from(image_embeds.normalize(2, -1).data);
      };
    }
  },
  'dinov2-small': { id: 'Xenova/dinov2-small', load: loadDino, loadTokens: loadDinoTokens },
  'dinov2-base': { id: 'Xenova/dinov2-base', load: loadDino, loadTokens: loadDinoTokens }
};

/**
 * DINOv2, jetons complets : { global: CLS normalisé, patches: N × d, chaque ligne normalisée }.
 * Avec le prétraitement par défaut (224 px, patch 14) : N = 256.
 */
async function loadDinoTokens() {
  const processor = await AutoProcessor.from_pretrained(this.id);
  const model = await AutoModel.from_pretrained(this.id, { dtype: 'q8' });
  return async (img) => {
    const { last_hidden_state } = await model(await processor(img));
    const [, n, d] = last_hidden_state.dims;
    const all = last_hidden_state.data;
    const global = Float32Array.from(last_hidden_state.slice(null, 0).normalize(2, -1).data);
    const patches = new Float32Array((n - 1) * d);
    for (let i = 1; i < n; i++) {
      let s = 0;
      for (let k = 0; k < d; k++) s += all[i * d + k] ** 2;
      s = Math.sqrt(s) || 1;
      for (let k = 0; k < d; k++) patches[(i - 1) * d + k] = all[i * d + k] / s;
    }
    return { global, patches, n: n - 1, d };
  };
}

/**
 * Score local entre deux images : nombre de plus proches voisins mutuels entre leurs patches,
 * rapporté au nombre de patches. Un fragment de l'objet garde ses correspondances locales même
 * quand son vecteur global s'éloigne.
 */
function mutualNN(q, c) {
  const { n, d } = q;
  const S = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    const qi = i * d;
    for (let j = 0; j < n; j++) {
      const cj = j * d;
      let s = 0;
      for (let k = 0; k < d; k++) s += q.patches[qi + k] * c.patches[cj + k];
      S[i * n + j] = s;
    }
  }
  const rowArg = new Int32Array(n);
  const colArg = new Int32Array(n).fill(-1);
  const colMax = new Float32Array(n).fill(-Infinity);
  for (let i = 0; i < n; i++) {
    let best = -Infinity;
    for (let j = 0; j < n; j++) {
      const s = S[i * n + j];
      if (s > best) {
        best = s;
        rowArg[i] = j;
      }
      if (s > colMax[j]) {
        colMax[j] = s;
        colArg[j] = i;
      }
    }
  }
  let mutual = 0;
  let maxSim = 0;
  for (let i = 0; i < n; i++) {
    if (colArg[rowArg[i]] === i) mutual++;
    maxSim += S[i * n + rowArg[i]];
  }
  // mnn : part de voisins mutuels (symétrique) · maxsim : moyenne, sur les patches de la requête, de la
  // meilleure similarité dans le candidat (asymétrique, type ColBERT) — un fragment est contenu dans l'objet.
  return { mnn: mutual / n, maxsim: maxSim / n };
}

/** Recadrage centré : fraction f du côté conservée (f = 1 : image entière). */
async function cropped(img, f) {
  return f >= 1 ? img : img.center_crop(Math.max(32, Math.round(img.width * f)), Math.max(32, Math.round(img.height * f)));
}

/**
 * Ré-ordonnancement des TOPK premiers résultats globaux par correspondances locales, mesuré sur
 * l'image entière et sur des fragments (--crops). Trois classements comparés : global seul,
 * local seul (parmi les TOPK), combiné (global + local).
 */
async function evaluateRerank(key, items, queries) {
  const def = REGISTRY[key];
  if (!def?.loadTokens) {
    console.log(`\n== ${key} : pas de jetons de patch disponibles, ré-ordonnancement ignoré`);
    return null;
  }
  console.log(`\n== ${key} · ré-ordonnancement par patches (top-${TOPK})`);
  const tokens = await def.loadTokens();
  const project = await loadHead(def.id);
  const corpus = [];
  for (const it of items) {
    const t = await tokens(await RawImage.read(`static/data/thumbs/${it.id}.jpg`));
    corpus.push({ id: it.id, global: project(t.global), patches: t.patches, n: t.n, d: t.d });
    process.stdout.write(`\r  corpus ${corpus.length}/${items.length}`);
  }
  console.log();

  const rows = [];
  for (const f of CROPS) {
    const runs = [];
    for (const q of queries) {
      const t = await tokens(await cropped(await RawImage.read(q.file), f));
      const qg = project(t.global);
      const ranked = corpus.map((c) => ({ id: c.id, global: cosine(qg, c.global), c })).sort((a, b) => b.global - a.global);
      const top = ranked.slice(0, TOPK);
      const t0 = performance.now();
      for (const r of top) Object.assign(r, mutualNN(t, r.c));
      const ms = performance.now() - t0;
      const rankIn = (list) => list.findIndex((r) => r.id === q.objectId) + 1;
      const rGlobal = rankIn(ranked);
      // Hors du top-K, le rang global est conservé : le ré-ordonnancement ne peut rien pour lui.
      const inTop = rGlobal >= 1 && rGlobal <= TOPK;
      const by = (f) => (inTop ? rankIn([...top].sort((a, b) => f(b) - f(a) || b.global - a.global)) : rGlobal);
      runs.push({
        global: rGlobal,
        mnn: by((r) => r.mnn),
        maxsim: by((r) => r.maxsim),
        'global+mnn': by((r) => r.global + r.mnn),
        'global+maxsim': by((r) => r.global + r.maxsim),
        ms
      });
      process.stdout.write(`\r  fragment ${Math.round(f * 100)} % · requêtes ${runs.length}/${queries.length}`);
    }
    console.log();
    const n = runs.length;
    for (const mode of ['global', 'mnn', 'maxsim', 'global+mnn', 'global+maxsim']) {
      const ranks = runs.map((r) => r[mode]);
      rows.push({
        fragment: `${Math.round(f * 100)} %`,
        mode,
        'recall@1': Math.round((ranks.filter((r) => r === 1).length / n) * 1000) / 10,
        'recall@5': Math.round((ranks.filter((r) => r >= 1 && r <= 5).length / n) * 1000) / 10,
        mrr: Math.round((ranks.reduce((s, r) => s + (r ? 1 / r : 0), 0) / n) * 1000) / 1000,
        msRerank: mode === 'global' ? 0 : Math.round(median(runs.map((r) => r.ms)))
      });
    }
  }
  const label = { global: 'global seul', mnn: 'voisins mutuels (top-K)', maxsim: 'MaxSim (top-K)', 'global+mnn': 'global + voisins mutuels', 'global+maxsim': 'global + MaxSim' };
  console.log(`\n| fragment | classement | recall@1 | recall@5 | MRR | ré-ordonnancement (ms) |\n|---|---|---:|---:|---:|---:|`);
  for (const r of rows) console.log(`| ${r.fragment} | ${label[r.mode]} | ${r['recall@1']} | ${r['recall@5']} | ${r.mrr} | ${r.msRerank || '—'} |`);
  return rows;
}

/** DINOv2 : jeton CLS après LayerNorm (pooler_output), normalisé L2. Auto-supervisé, sans texte. */
async function loadDino() {
  const processor = await AutoProcessor.from_pretrained(this.id);
  const model = await AutoModel.from_pretrained(this.id, { dtype: 'q8' });
  return async (img) => {
    const out = await model(await processor(img));
    const t = out.pooler_output ?? out.last_hidden_state.slice(null, 0);
    return Float32Array.from(t.normalize(2, -1).data);
  };
}

async function exists(p) {
  return access(p).then(() => true, () => false);
}

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

async function loadQueries(items) {
  if (BUILD) return buildQueries(items);
  if (await exists('eval/queries.json')) return JSON.parse(await readFile('eval/queries.json', 'utf8')).queries;
  console.log('eval/queries.json absent : repli sur static/data/samples.json (lancer --build pour un jeu plus large)');
  const { samples } = JSON.parse(await readFile('static/data/samples.json', 'utf8'));
  return samples.map((s) => ({ ...s, file: `static/${s.file}` }));
}

/** Embeddings du corpus pour un modèle, depuis les vignettes, avec cache. */
async function corpusEmbeddings(key, embed, items) {
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
  await writeFile(cache, JSON.stringify({ model: REGISTRY[key].id, ids: items.map((it) => it.id), vectors: vectors.map((v) => [...v].map((x) => Math.round(x * 10000) / 10000)) }));
  return vectors;
}

function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
}

/** Tête apprise par train-head.mjs : v ↦ normalize(v W). Sans tête, identité. */
async function loadHead(modelId) {
  if (!HEAD) return (v) => v;
  const head = JSON.parse(await readFile(HEAD, 'utf8'));
  if (head.model !== modelId) {
    console.log(`  tête ${HEAD} ignorée : entraînée pour ${head.model}`);
    return (v) => v;
  }
  console.log(`  tête appliquée : ${HEAD} (${head.trainedOn} paires, ${head.epochs} époques)`);
  const d = head.dim;
  return (v) => {
    const out = new Float32Array(d);
    for (let k = 0; k < d; k++) {
      const a = v[k];
      if (a === 0) continue;
      for (let j = 0; j < d; j++) out[j] += a * head.W[k * d + j];
    }
    let n = 0;
    for (let j = 0; j < d; j++) n += out[j] ** 2;
    n = Math.sqrt(n) || 1;
    for (let j = 0; j < d; j++) out[j] /= n;
    return out;
  };
}

async function evaluate(key, items, queries) {
  const def = REGISTRY[key];
  if (!def) throw new Error(`modèle inconnu : ${key} (choix : ${Object.keys(REGISTRY).join(', ')})`);
  console.log(`\n== ${key} (${def.id})`);
  const raw = await def.load();
  const project = await loadHead(def.id);
  const embed = async (img) => project(await raw(img));
  const corpus = (await corpusEmbeddings(key, raw, items)).map(project);

  // Cohérence index / requête : les vecteurs de items.json doivent être ceux du modèle du navigateur.
  if (key === 'clip' && !HEAD) {
    const drift = items.map((it, i) => 1 - cosine(Float32Array.from(it.embedding), corpus[i]));
    console.log(`  écart max entre items.json et recalcul : ${Math.max(...drift).toFixed(4)} (0 = même modèle)`);
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
    rows.push({
      objectId: q.objectId,
      title: q.title,
      rank,
      truthScore: truth.score,
      top1: ranked[0].id,
      top1Score: ranked[0].score,
      marginVsBestOther: truth.score - bestOther.score,
      categoryHit: ranked[0].category === q.category,
      originHit: !!q.origin && ranked[0].origin === q.origin,
      ms: Math.round(ms)
    });
    process.stdout.write(`\r  requêtes ${rows.length}/${queries.length}`);
  }
  console.log();

  const n = rows.length;
  const pct = (f) => Math.round((rows.filter(f).length / n) * 1000) / 10;
  const summary = {
    model: def.id,
    dim: corpus[0].length,
    queries: n,
    'recall@1': pct((r) => r.rank === 1),
    'recall@5': pct((r) => r.rank <= 5),
    'recall@10': pct((r) => r.rank <= 10),
    mrr: Math.round((rows.reduce((s, r) => s + 1 / r.rank, 0) / n) * 1000) / 1000,
    medianRank: median(rows.map((r) => r.rank)),
    'category@1': pct((r) => r.categoryHit),
    'origin@1': pct((r) => r.originHit),
    medianTruthScore: Math.round(median(rows.map((r) => r.truthScore)) * 1000) / 1000,
    'truth>=0.75': pct((r) => r.truthScore >= 0.75),
    'truth>=0.8': pct((r) => r.truthScore >= 0.8),
    medianMargin: Math.round(median(rows.map((r) => r.marginVsBestOther)) * 1000) / 1000,
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
  const dataset = JSON.parse(await readFile('static/data/items.json', 'utf8'));
  const items = dataset.items;
  const queries = await loadQueries(items);
  console.log(`${items.length} objets de référence, ${queries.length} requêtes (vues alternatives)`);

  const results = {};
  for (const key of MODELS) results[key] = await evaluate(key, items, queries);
  const rerank = {};
  if (RERANK) for (const key of MODELS) rerank[key] = await evaluateRerank(key, items, queries);

  await mkdir('eval', { recursive: true });
  await writeFile('eval/results.json', JSON.stringify({ generatedAt: new Date().toISOString(), corpus: items.length, queries: queries.length, head: HEAD, results, rerank: RERANK ? { topK: TOPK, crops: CROPS, byModel: rerank } : undefined }, null, 2));
  console.log(`\n${table(results)}\n\nrecall@k : part des requêtes dont le bon objet est dans les k premiers · MRR : moyenne de 1/rang\ncategory@1, origin@1 : le premier résultat a la même catégorie / origine que le bon objet\ntruth>=0.75 : part des bonnes réponses au-dessus du seuil « fiable » du schéma · margin : score du bon objet − meilleur autre\nécrit eval/results.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
