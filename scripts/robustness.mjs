/**
 * Robustesse au terrain, mesurée : les 39 vues alternatives de l'évaluation sont dégradées comme le seraient des
 * photos de comptoir (flou, sous-exposition, rotation, cadrage partiel, forte compression, basse résolution, et une
 * combinaison), puis rejouées contre l'index. Pour chaque condition : recall@1/5, MRR, score du bon objet, part des
 * requêtes dont le bon objet reste au-dessus de τ (sinon « résultat non concluant »).
 *
 *   node scripts/robustness.mjs                 # CLIP, écrit eval/robustness.json
 *   node scripts/robustness.mjs --models clip,dinov2-small
 *
 * Les images dégradées sont produites avec sharp dans eval/cache/degraded/ (non versionné).
 */
import { mkdir, writeFile, access } from 'node:fs/promises';
import sharp from 'sharp';
import { RawImage } from '@huggingface/transformers';
import { getModel } from './lib/models.mjs';
import { argValue, cosine, loadCorpus, median, pct, round3 } from './lib/metrics.mjs';
import { corpusEmbeddings, loadQueries } from './evaluate.mjs';
import { schema } from './lib/schema-tau.mjs';

const MODELS = argValue('--models', 'clip').split(',');
const exists = (p) => access(p).then(() => true, () => false);

/** Conditions : nom → transformation sharp. Paramètres choisis pour ressembler à une photo ratée, pas à un cas extrême. */
const CONDITIONS = {
  original: (img) => img,
  flou: (img) => img.blur(2.5),
  sombre: (img) => img.modulate({ brightness: 0.45 }),
  rotation: (img) => img.rotate(15, { background: '#808080' }),
  recadrage: async (img) => {
    const { width, height } = await img.metadata();
    const w = Math.round(width * 0.6);
    const h = Math.round(height * 0.6);
    return img.extract({ left: Math.round((width - w) / 2), top: Math.round((height - h) / 2), width: w, height: h });
  },
  compression: (img) => img.jpeg({ quality: 25 }),
  basse_resolution: (img) => img.resize({ width: 320, height: 320, fit: 'inside' }),
  flou_et_sombre: (img) => img.blur(2.5).modulate({ brightness: 0.45 })
};

async function degraded(file, condition) {
  if (condition === 'original') return file; // tel quel : pas de réencodage, mêmes chiffres que evaluate.mjs
  const out = `eval/cache/degraded/${condition}/${file.split('/').pop()}`;
  if (!(await exists(out))) {
    await mkdir(`eval/cache/degraded/${condition}`, { recursive: true });
    const img = await CONDITIONS[condition](sharp(file));
    await img.toFile(out);
  }
  return out;
}

async function main() {
  const corpusData = await loadCorpus();
  const queries = await loadQueries(corpusData.items);
  const tau = schema.tau;
  console.log(`${corpusData.items.length} objets, ${queries.length} requêtes, ${Object.keys(CONDITIONS).length} conditions, τ = ${tau}`);
  const results = {};
  for (const key of MODELS) {
    const def = getModel(key);
    console.log(`\n== ${key} (${def.id})`);
    const embed = await def.load();
    const corpus = await corpusEmbeddings(key, embed, corpusData.items);
    const rows = {};
    for (const condition of Object.keys(CONDITIONS)) {
      const r = [];
      for (const q of queries) {
        const v = await embed(await RawImage.read(await degraded(q.file, condition)));
        const ranked = corpusData.items.map((it, i) => ({ id: it.id, score: cosine(v, corpus[i]) })).sort((a, b) => b.score - a.score);
        const rank = ranked.findIndex((x) => x.id === q.objectId) + 1;
        r.push({ rank, truth: ranked[rank - 1].score, top1: ranked[0].score });
        process.stdout.write(`\r  ${condition.padEnd(16)} ${r.length}/${queries.length}`);
      }
      const n = r.length;
      rows[condition] = {
        'recall@1': pct(r.filter((x) => x.rank === 1).length / n),
        'recall@5': pct(r.filter((x) => x.rank <= 5).length / n),
        mrr: round3(r.reduce((s, x) => s + 1 / x.rank, 0) / n),
        medianTruthScore: round3(median(r.map((x) => x.truth))),
        aboveTau: key === 'clip' ? pct(r.filter((x) => x.truth >= tau).length / n) : undefined,
        inconclusive: key === 'clip' ? pct(r.filter((x) => x.top1 < tau).length / n) : undefined
      };
      process.stdout.write('\n');
    }
    results[key] = rows;
    const cols = ['recall@1', 'recall@5', 'mrr', 'medianTruthScore', ...(key === 'clip' ? ['aboveTau', 'inconclusive'] : [])];
    console.log(`\n| condition | ${cols.join(' | ')} |\n|---|${cols.map(() => '---:').join('|')}|`);
    for (const [c, row] of Object.entries(rows)) console.log(`| ${c} | ${cols.map((k) => row[k]).join(' | ')} |`);
  }
  console.log('\naboveTau : part des requêtes dont le bon objet reste ≥ τ · inconclusive : part des requêtes dont aucun objet n’atteint τ (« résultat non concluant »)');
  await writeFile('eval/robustness.json', JSON.stringify({ generatedAt: new Date().toISOString(), queries: queries.length, tau, conditions: { flou: 'sharp.blur(2.5) à 1024 px', sombre: 'luminosité × 0,45', rotation: '15°, fond gris', recadrage: '60 % centré', compression: 'JPEG qualité 25', basse_resolution: '320 px côté max', flou_et_sombre: 'les deux' }, results }, null, 2));
  console.log('écrit eval/robustness.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
