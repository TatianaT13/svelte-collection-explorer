/**
 * Expérience : ré-ordonnancement des top-K globaux par correspondances de patches (MaxSim), mesuré sur
 * l'image entière et sur des fragments. Résultat retenu (README § 16) : sur un fragment à 50 %, recall@1
 * 59 → 69 %. Le comptage de voisins mutuels, mesuré sans effet, a été retiré.
 *
 *   node experiments/rerank.mjs --crops --topk 20          # dinov2-small, requêtes de scripts/evaluate.mjs
 *
 * MaxSim : moyenne, sur les patches de la requête, de la meilleure similarité dans le candidat. Asymétrique :
 * un fragment est contenu dans l'objet, pas l'inverse. Produit eval/rerank.json.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { RawImage } from '@huggingface/transformers';
import { getModel } from '../scripts/lib/models.mjs';
import { argValue, cosine, loadCorpus, median, pct, round3 } from '../scripts/lib/metrics.mjs';
import { loadQueries } from '../scripts/evaluate.mjs';

const KEY = argValue('--model', 'dinov2-small');
const TOPK = Number(argValue('--topk', 20));
/** Fragments : part du côté conservée par recadrage centré (1 = image entière). */
const CROPS = process.argv.includes('--crops') ? [1, 0.7, 0.5] : [1];

function maxSim(q, c) {
  const { n, d } = q;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const qi = i * d;
    let best = -Infinity;
    for (let j = 0; j < n; j++) {
      const cj = j * d;
      let s = 0;
      for (let k = 0; k < d; k++) s += q.patches[qi + k] * c.patches[cj + k];
      if (s > best) best = s;
    }
    total += best;
  }
  return total / n;
}

const cropped = (img, f) => (f >= 1 ? img : img.center_crop(Math.max(32, Math.round(img.width * f)), Math.max(32, Math.round(img.height * f))));

async function main() {
  const def = getModel(KEY);
  if (!def.loadTokens) throw new Error(`${KEY} n'expose pas de jetons de patch`);
  const { items } = await loadCorpus();
  const queries = await loadQueries(items);
  console.log(`== ${KEY} · ré-ordonnancement MaxSim (top-${TOPK}) · ${items.length} objets, ${queries.length} requêtes`);
  const tokens = await def.loadTokens();
  const corpus = [];
  for (const it of items) {
    corpus.push({ id: it.id, ...(await tokens(await RawImage.read(`static/data/thumbs/${it.id}.jpg`))) });
    process.stdout.write(`\r  corpus ${corpus.length}/${items.length}`);
  }
  console.log();

  const rows = [];
  for (const f of CROPS) {
    const runs = [];
    for (const q of queries) {
      const t = await tokens(await cropped(await RawImage.read(q.file), f));
      const ranked = corpus.map((c) => ({ id: c.id, global: cosine(t.global, c.global), c })).sort((a, b) => b.global - a.global);
      const top = ranked.slice(0, TOPK);
      const t0 = performance.now();
      for (const r of top) r.local = maxSim(t, r.c);
      const ms = performance.now() - t0;
      const rankIn = (list) => list.findIndex((r) => r.id === q.objectId) + 1;
      const rGlobal = rankIn(ranked);
      // Hors du top-K, le rang global est conservé : le ré-ordonnancement ne peut rien pour lui.
      const inTop = rGlobal >= 1 && rGlobal <= TOPK;
      runs.push({ global: rGlobal, maxsim: inTop ? rankIn([...top].sort((a, b) => b.local - a.local || b.global - a.global)) : rGlobal, ms });
      process.stdout.write(`\r  fragment ${Math.round(f * 100)} % · requêtes ${runs.length}/${queries.length}`);
    }
    console.log();
    for (const mode of ['global', 'maxsim']) {
      const ranks = runs.map((r) => r[mode]);
      rows.push({ fragment: `${Math.round(f * 100)} %`, mode, 'recall@1': pct(ranks.filter((r) => r === 1).length / ranks.length), 'recall@5': pct(ranks.filter((r) => r >= 1 && r <= 5).length / ranks.length), mrr: round3(ranks.reduce((s, r) => s + (r ? 1 / r : 0), 0) / ranks.length), msRerank: mode === 'global' ? 0 : Math.round(median(runs.map((r) => r.ms))) });
    }
  }
  console.log('\n| fragment | classement | recall@1 | recall@5 | MRR | ré-ordonnancement (ms) |\n|---|---|---:|---:|---:|---:|');
  for (const r of rows) console.log(`| ${r.fragment} | ${r.mode === 'global' ? 'global seul' : 'MaxSim (top-K)'} | ${r['recall@1']} | ${r['recall@5']} | ${r.mrr} | ${r.msRerank || '—'} |`);
  await mkdir('eval', { recursive: true });
  await writeFile('eval/rerank.json', JSON.stringify({ generatedAt: new Date().toISOString(), model: def.id, topK: TOPK, crops: CROPS, rows }, null, 2));
  console.log('écrit eval/rerank.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
