/**
 * Prédiction conforme et rejet hors-base, sur les paires de build-pairs.mjs.
 *
 *   node scripts/calibrate.mjs                         # dinov2-small, embeddings bruts
 *   node scripts/calibrate.mjs --head eval/heads/dinov2-small.json
 *
 * Partition (même hash que train-head.mjs) : lots 6–7 = calibration, 8–9 = test. Le corpus est fait des
 * photos principales ; les requêtes sont les vues alternatives. La moitié des objets de test est retirée
 * du corpus : leurs vues deviennent des requêtes « hors base ».
 *
 * Pour chaque α : τ_α = quantile conforme des similarités du bon objet sur la calibration ; l'ensemble
 * d'une requête = { objets de similarité ≥ τ_α }. Garantie : P(bon objet ∈ ensemble) ≥ 1 − α sur la
 * distribution de calibration. Ensemble vide = « inconnu » (rejet).
 * Produit eval/calibration-<modèle>[-head].json.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { bucket } from './train-head.mjs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? dflt : process.argv[i + 1];
};
const MODEL_KEY = arg('--model', 'dinov2-small');
const HEAD = arg('--head', null);
const ALPHAS = [0.05, 0.1, 0.2];

function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** v ↦ normalize(v W) */
function projector(head) {
  if (!head) return (v) => Float32Array.from(v);
  const d = head.dim;
  const W = head.W;
  return (v) => {
    const out = new Float32Array(d);
    for (let k = 0; k < d; k++) {
      const a = v[k];
      if (a === 0) continue;
      for (let j = 0; j < d; j++) out[j] += a * W[k * d + j];
    }
    let n = 0;
    for (let j = 0; j < d; j++) n += out[j] ** 2;
    n = Math.sqrt(n) || 1;
    for (let j = 0; j < d; j++) out[j] /= n;
    return out;
  };
}

/** Seuil conforme : k-ième plus petite similarité, k = ⌊α (n+1)⌋ ; k = 0 → aucun seuil. */
function conformalThreshold(scores, alpha) {
  const s = [...scores].sort((a, b) => a - b);
  const k = Math.floor(alpha * (s.length + 1));
  return k >= 1 ? s[k - 1] : -1;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (x) => Math.round(x * 1000) / 10;

async function main() {
  const pairs = JSON.parse(await readFile(`eval/pairs/${MODEL_KEY}.json`, 'utf8'));
  const head = HEAD ? JSON.parse(await readFile(HEAD, 'utf8')) : null;
  if (head && head.model !== pairs.model) throw new Error(`la tête (${head.model}) ne correspond pas aux paires (${pairs.model})`);
  const project = projector(head);

  const calib = pairs.objects.filter((o) => bucket(o.id) === 6 || bucket(o.id) === 7);
  const test = pairs.objects.filter((o) => bucket(o.id) >= 8);
  const testIn = test.filter((_, i) => i % 2 === 0);
  const testOut = test.filter((_, i) => i % 2 === 1);
  const corpus = [...calib, ...testIn].map((o) => ({ id: o.id, v: project(o.primary) }));
  console.log(`${pairs.objects.length} paires (${pairs.model}${head ? ' + tête apprise' : ''}) · corpus ${corpus.length} · calibration ${calib.length} · test dans la base ${testIn.length} · test hors base ${testOut.length}`);

  const rankAndScores = (o) => {
    const q = project(o.alt);
    const scored = corpus.map((c) => ({ id: c.id, s: cosine(q, c.v) })).sort((a, b) => b.s - a.s);
    const rank = scored.findIndex((x) => x.id === o.id) + 1;
    return { scored, rank, truth: rank ? scored[rank - 1].s : NaN };
  };

  const calibScores = calib.map((o) => rankAndScores(o).truth);
  const testInRuns = testIn.map(rankAndScores);
  const testOutRuns = testOut.map(rankAndScores);

  const recall1 = pct(testInRuns.filter((r) => r.rank === 1).length / testInRuns.length);
  const recall5 = pct(testInRuns.filter((r) => r.rank <= 5).length / testInRuns.length);
  console.log(`recall@1 ${recall1} % · recall@5 ${recall5} % (test dans la base, référence hors calibration)`);

  const rows = [];
  for (const alpha of ALPHAS) {
    const tau = conformalThreshold(calibScores, alpha);
    const sets = testInRuns.map((r) => r.scored.filter((x) => x.s >= tau));
    const covered = testInRuns.filter((r, i) => sets[i].some((x) => x.id === testIn[i].id)).length;
    const sizes = sets.map((s) => s.length);
    const falseReject = sets.filter((s) => s.length === 0).length;
    const outSets = testOutRuns.map((r) => r.scored.filter((x) => x.s >= tau));
    const correctReject = outSets.filter((s) => s.length === 0).length;
    rows.push({
      alpha,
      tau: Math.round(tau * 1000) / 1000,
      guaranteed: pct(1 - alpha),
      coverage: pct(covered / testIn.length),
      meanSetSize: Math.round(mean(sizes) * 10) / 10,
      medianSetSize: median(sizes),
      singletons: pct(sizes.filter((n) => n === 1).length / sizes.length),
      falseRejectRate: pct(falseReject / testIn.length),
      outOfBaseRejectRate: pct(correctReject / testOut.length),
      outOfBaseMeanSetSize: Math.round(mean(outSets.map((s) => s.length)) * 10) / 10
    });
  }

  console.log('\n| α | τ | garanti ≥ | couverture test | taille moy. | médiane | singletons | faux rejets | rejets hors base | taille moy. hors base |');
  console.log('|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) console.log(`| ${r.alpha} | ${r.tau} | ${r.guaranteed} % | ${r.coverage} % | ${r.meanSetSize} | ${r.medianSetSize} | ${r.singletons} % | ${r.falseRejectRate} % | ${r.outOfBaseRejectRate} % | ${r.outOfBaseMeanSetSize} |`);
  console.log('\ncouverture : part des requêtes (objet dans la base) dont l’ensemble contient le bon objet — doit être ≥ garanti\nrejet hors base : part des requêtes d’objets absents dont l’ensemble est vide (« inconnu ») · faux rejets : objets présents mais ensemble vide');

  // Règle de marge pour le rejet : m = s(top-1) − s(top-2). Un objet absent de la base a un top-1 sans
  // avance nette sur le suivant. Seuil m_α = quantile α des marges sur la calibration (faux rejets ≈ α).
  const marginOf = (r) => r.scored[0].s - (r.scored[1]?.s ?? 0);
  const calibMargins = calib.map((o) => marginOf(rankAndScores(o)));
  const marginRows = ALPHAS.map((alpha) => {
    const m = conformalThreshold(calibMargins, alpha);
    const falseReject = testInRuns.filter((r) => marginOf(r) < m).length;
    const correctReject = testOutRuns.filter((r) => marginOf(r) < m).length;
    return { alpha, marginThreshold: Math.round(m * 1000) / 1000, falseRejectRate: pct(falseReject / testIn.length), outOfBaseRejectRate: pct(correctReject / testOut.length) };
  });
  console.log(`\nmarge top-1 − top-2 : médiane ${Math.round(median(testInRuns.map(marginOf)) * 1000) / 1000} (dans la base) contre ${Math.round(median(testOutRuns.map(marginOf)) * 1000) / 1000} (hors base)`);
  console.log('| α | seuil de marge | faux rejets | rejets hors base |');
  console.log('|---:|---:|---:|---:|');
  for (const r of marginRows) console.log(`| ${r.alpha} | ${r.marginThreshold} | ${r.falseRejectRate} % | ${r.outOfBaseRejectRate} % |`);

  const out = `eval/calibration-${MODEL_KEY}${head ? '-head' : ''}.json`;
  await writeFile(out, JSON.stringify({ model: pairs.model, head: HEAD, generatedAt: new Date().toISOString(), corpus: corpus.length, calibration: calib.length, testIn: testIn.length, testOut: testOut.length, recall1, recall5, thresholds: rows, marginRule: marginRows }, null, 2));
  console.log(`écrit ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
