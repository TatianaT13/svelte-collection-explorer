/**
 * Prédiction conforme et rejet hors-base, sur les paires de build-pairs.mjs.
 *
 *   node scripts/calibrate.mjs                         # dinov2-small, embeddings bruts
 *   node scripts/calibrate.mjs --model clip            # le modèle du navigateur : τ à recopier dans schema.similarity.calibration
 *   node scripts/calibrate.mjs --head eval/heads/dinov2-small.json
 *
 * Partition (scripts/lib/metrics.mjs) : lots 6–7 = calibration, 8–9 = test. Le corpus est fait des photos
 * principales ; les requêtes sont les vues alternatives. La moitié des objets de test est retirée du corpus :
 * leurs vues deviennent des requêtes « hors base ».
 *
 * Pour chaque α : τ_α = quantile conforme des similarités du bon objet sur la calibration ; l'ensemble d'une
 * requête = { objets de similarité ≥ τ_α }. Sur la distribution de calibration, le bon objet est dans
 * l'ensemble dans une part visée de 1 − α des cas. Ensemble vide = résultat non concluant.
 * Produit eval/calibration-<modèle>[-head].json.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { argValue, conformalThreshold, cosine, isCalibration, isTest, mean, median, pct, projector, round3 } from './lib/metrics.mjs';

const MODEL_KEY = argValue('--model', 'dinov2-small');
const HEAD = argValue('--head', null);
const ALPHAS = [0.05, 0.1, 0.2];

async function main() {
  const pairs = JSON.parse(await readFile(`eval/pairs/${MODEL_KEY}.json`, 'utf8'));
  const head = HEAD ? JSON.parse(await readFile(HEAD, 'utf8')) : null;
  if (head && head.model !== pairs.model) throw new Error(`la tête (${head.model}) ne correspond pas aux paires (${pairs.model})`);
  const project = projector(head);
  const vec = (v) => project(Float32Array.from(v));

  const calib = pairs.objects.filter((o) => isCalibration(o.id));
  const test = pairs.objects.filter((o) => isTest(o.id));
  const testIn = test.filter((_, i) => i % 2 === 0);
  const testOut = test.filter((_, i) => i % 2 === 1);
  const corpus = [...calib, ...testIn].map((o) => ({ id: o.id, v: vec(o.primary) }));
  console.log(`${pairs.objects.length} paires (${pairs.model}${head ? ' + tête apprise' : ''}) · corpus ${corpus.length} · calibration ${calib.length} · test dans la base ${testIn.length} · test hors base ${testOut.length}`);

  const run = (o) => {
    const q = vec(o.alt);
    const scored = corpus.map((c) => ({ id: c.id, s: cosine(q, c.v) })).sort((a, b) => b.s - a.s);
    const rank = scored.findIndex((x) => x.id === o.id) + 1;
    return { scored, rank, truth: rank ? scored[rank - 1].s : NaN, margin: scored[0].s - (scored[1]?.s ?? 0) };
  };
  const calibRuns = calib.map(run);
  const inRuns = testIn.map(run);
  const outRuns = testOut.map(run);

  const recall1 = pct(inRuns.filter((r) => r.rank === 1).length / inRuns.length);
  const recall5 = pct(inRuns.filter((r) => r.rank <= 5).length / inRuns.length);
  console.log(`recall@1 ${recall1} % · recall@5 ${recall5} % (test dans la base, référence hors calibration)`);

  const rows = ALPHAS.map((alpha) => {
    const tau = conformalThreshold(calibRuns.map((r) => r.truth), alpha);
    const sets = inRuns.map((r) => r.scored.filter((x) => x.s >= tau));
    const outSets = outRuns.map((r) => r.scored.filter((x) => x.s >= tau));
    const sizes = sets.map((s) => s.length);
    return {
      alpha,
      tau: round3(tau),
      target: pct(1 - alpha),
      coverage: pct(sets.filter((s, i) => s.some((x) => x.id === testIn[i].id)).length / testIn.length),
      meanSetSize: Math.round(mean(sizes) * 10) / 10,
      medianSetSize: median(sizes),
      singletons: pct(sizes.filter((n) => n === 1).length / sizes.length),
      falseRejectRate: pct(sets.filter((s) => s.length === 0).length / testIn.length),
      outOfBaseRejectRate: pct(outSets.filter((s) => s.length === 0).length / testOut.length),
      outOfBaseMeanSetSize: Math.round(mean(outSets.map((s) => s.length)) * 10) / 10
    };
  });
  console.log('\n| α | τ | visé ≥ | couverture test | taille moy. | médiane | singletons | faux rejets | rejets hors base | taille moy. hors base |\n|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) console.log(`| ${r.alpha} | ${r.tau} | ${r.target} % | ${r.coverage} % | ${r.meanSetSize} | ${r.medianSetSize} | ${r.singletons} % | ${r.falseRejectRate} % | ${r.outOfBaseRejectRate} % | ${r.outOfBaseMeanSetSize} |`);

  // Règle de marge pour le rejet : m = s(top-1) − s(top-2). Seuil = quantile α des marges de calibration.
  const marginRows = ALPHAS.map((alpha) => {
    const m = conformalThreshold(calibRuns.map((r) => r.margin), alpha);
    return { alpha, marginThreshold: round3(m), falseRejectRate: pct(inRuns.filter((r) => r.margin < m).length / testIn.length), outOfBaseRejectRate: pct(outRuns.filter((r) => r.margin < m).length / testOut.length) };
  });
  console.log(`\nmarge top-1 − top-2 : médiane ${round3(median(inRuns.map((r) => r.margin)))} (dans la base) contre ${round3(median(outRuns.map((r) => r.margin)))} (hors base)\n| α | seuil de marge | faux rejets | rejets hors base |\n|---:|---:|---:|---:|`);
  for (const r of marginRows) console.log(`| ${r.alpha} | ${r.marginThreshold} | ${r.falseRejectRate} % | ${r.outOfBaseRejectRate} % |`);
  console.log('\ncouverture : part des requêtes (objet dans la base) dont l’ensemble contient le bon objet · rejet hors base : ensemble vide pour un objet absent · faux rejets : ensemble vide pour un objet présent');

  const out = `eval/calibration-${MODEL_KEY}${head ? '-head' : ''}.json`;
  await writeFile(out, JSON.stringify({ model: pairs.model, head: HEAD, generatedAt: new Date().toISOString(), corpus: corpus.length, calibration: calib.length, testIn: testIn.length, testOut: testOut.length, recall1, recall5, thresholds: rows, marginRule: marginRows }, null, 2));
  console.log(`écrit ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
