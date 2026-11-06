/**
 * Expérience : affinage par métrique sans GPU. Une projection linéaire W (d × d) apprise sur les embeddings
 * gelés d'un modèle, avec une perte contrastive InfoNCE symétrique sur des paires (principale, vue alternative) ;
 * les autres objets du lot servent de négatifs. W part de l'identité et y est rappelée (régularisation).
 * Résultat retenu (README § 16) : recall inchangé, marge +63 %, ensembles conformes quatre fois plus petits.
 *
 *   node experiments/train-head.mjs                              # eval/pairs/dinov2-small.json → eval/heads/dinov2-small.json
 *   node experiments/train-head.mjs --model clip --epochs 40 --temp 0.05 --lambda 0.1
 *
 * Partition par objet (scripts/lib/metrics.mjs) : 0–5 entraînement, 6–7 calibration, 8–9 test.
 * La tête s'applique avec `scripts/evaluate.mjs --head` et `scripts/calibrate.mjs --head`.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { argValue as arg, isTrain } from '../scripts/lib/metrics.mjs';

const MODEL_KEY = arg('--model', 'dinov2-small');
const EPOCHS = Number(arg('--epochs', 30));
const BATCH = Number(arg('--batch', 64));
const TEMP = Number(arg('--temp', 0.07));
const LAMBDA = Number(arg('--lambda', 0.05)); // rappel vers l'identité
const LR = Number(arg('--lr', 0.002));

function normalizeRows(M, n, d) {
  const out = new Float32Array(n * d);
  const norms = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < d; k++) s += M[i * d + k] ** 2;
    norms[i] = Math.sqrt(s) || 1;
    for (let k = 0; k < d; k++) out[i * d + k] = M[i * d + k] / norms[i];
  }
  return { Z: out, norms };
}

/** C = A (n×d) · W (d×d) */
function matmul(A, W, n, d) {
  const C = new Float32Array(n * d);
  for (let i = 0; i < n; i++) {
    const row = i * d;
    for (let k = 0; k < d; k++) {
      const a = A[row + k];
      if (a === 0) continue;
      const wrow = k * d;
      for (let j = 0; j < d; j++) C[row + j] += a * W[wrow + j];
    }
  }
  return C;
}

/** Gradient d'une perte InfoNCE symétrique sur un lot : { loss, dW }. Vérifié par différences finies. */
export function batchGrad(P, A, W, B, d, temp = TEMP, lambda = LAMBDA) {
  const U = matmul(P, W, B, d);
  const V = matmul(A, W, B, d);
  const { Z: Zp, norms: np } = normalizeRows(U, B, d);
  const { Z: Za, norms: na } = normalizeRows(V, B, d);

  // S[i][j] = za_i · zp_j / T
  const S = new Float32Array(B * B);
  for (let i = 0; i < B; i++) for (let j = 0; j < B; j++) {
    let s = 0;
    for (let k = 0; k < d; k++) s += Za[i * d + k] * Zp[j * d + k];
    S[i * B + j] = s / temp;
  }
  // softmax par ligne (vue → principale) et par colonne (principale → vue)
  const G = new Float32Array(B * B);
  let loss = 0;
  for (let i = 0; i < B; i++) {
    let m = -Infinity;
    for (let j = 0; j < B; j++) m = Math.max(m, S[i * B + j]);
    let z = 0;
    for (let j = 0; j < B; j++) z += Math.exp(S[i * B + j] - m);
    for (let j = 0; j < B; j++) G[i * B + j] += (Math.exp(S[i * B + j] - m) / z - (i === j ? 1 : 0)) / (2 * B);
    loss += (m + Math.log(z) - S[i * B + i]) / (2 * B);
  }
  for (let j = 0; j < B; j++) {
    let m = -Infinity;
    for (let i = 0; i < B; i++) m = Math.max(m, S[i * B + j]);
    let z = 0;
    for (let i = 0; i < B; i++) z += Math.exp(S[i * B + j] - m);
    for (let i = 0; i < B; i++) G[i * B + j] += (Math.exp(S[i * B + j] - m) / z - (i === j ? 1 : 0)) / (2 * B);
    loss += (m + Math.log(z) - S[j * B + j]) / (2 * B);
  }
  // dL/dZa = G·Zp / T ; dL/dZp = Gᵀ·Za / T
  const dZa = new Float32Array(B * d);
  const dZp = new Float32Array(B * d);
  for (let i = 0; i < B; i++) for (let j = 0; j < B; j++) {
    const g = G[i * B + j] / temp;
    if (g === 0) continue;
    for (let k = 0; k < d; k++) {
      dZa[i * d + k] += g * Zp[j * d + k];
      dZp[j * d + k] += g * Za[i * d + k];
    }
  }
  // rétropropagation de la normalisation : dL/du = (dL/dz − z (z·dL/dz)) / ‖u‖
  const dU = new Float32Array(B * d);
  const dV = new Float32Array(B * d);
  for (let i = 0; i < B; i++) {
    let dotP = 0;
    let dotA = 0;
    for (let k = 0; k < d; k++) {
      dotP += Zp[i * d + k] * dZp[i * d + k];
      dotA += Za[i * d + k] * dZa[i * d + k];
    }
    for (let k = 0; k < d; k++) {
      dU[i * d + k] = (dZp[i * d + k] - Zp[i * d + k] * dotP) / np[i];
      dV[i * d + k] = (dZa[i * d + k] - Za[i * d + k] * dotA) / na[i];
    }
  }
  // dL/dW = Pᵀ dU + Aᵀ dV + 2λ (W − I)
  const dW = new Float32Array(d * d);
  for (let i = 0; i < B; i++) for (let k = 0; k < d; k++) {
    const p = P[i * d + k];
    const a = A[i * d + k];
    if (p === 0 && a === 0) continue;
    for (let j = 0; j < d; j++) dW[k * d + j] += p * dU[i * d + j] + a * dV[i * d + j];
  }
  let reg = 0;
  for (let k = 0; k < d; k++) for (let j = 0; j < d; j++) {
    const diff = W[k * d + j] - (k === j ? 1 : 0);
    dW[k * d + j] += 2 * lambda * diff;
    reg += lambda * diff * diff;
  }
  return { loss: loss + reg, dW };
}

async function main() {
  const pairs = JSON.parse(await readFile(`eval/pairs/${MODEL_KEY}.json`, 'utf8'));
  const d = pairs.dim;
  const train = pairs.objects.filter((o) => isTrain(o.id));
  console.log(`${pairs.objects.length} paires (${pairs.model}, d=${d}) : ${train.length} entraînement, ${pairs.objects.length - train.length} réservées à la calibration et au test`);
  if (train.length < BATCH) throw new Error(`trop peu de paires d'entraînement (${train.length}) pour un lot de ${BATCH}`);

  const W = new Float32Array(d * d);
  for (let k = 0; k < d; k++) W[k * d + k] = 1;
  const m = new Float32Array(d * d);
  const v = new Float32Array(d * d);
  let step = 0;
  const b1 = 0.9;
  const b2 = 0.999;

  for (let epoch = 1; epoch <= EPOCHS; epoch++) {
    const order = train.map((_, i) => i).sort(() => Math.random() - 0.5);
    let total = 0;
    let batches = 0;
    for (let s = 0; s + BATCH <= order.length; s += BATCH) {
      const P = new Float32Array(BATCH * d);
      const A = new Float32Array(BATCH * d);
      for (let i = 0; i < BATCH; i++) {
        P.set(train[order[s + i]].primary, i * d);
        A.set(train[order[s + i]].alt, i * d);
      }
      const { loss, dW } = batchGrad(P, A, W, BATCH, d);
      step++;
      for (let i = 0; i < W.length; i++) {
        m[i] = b1 * m[i] + (1 - b1) * dW[i];
        v[i] = b2 * v[i] + (1 - b2) * dW[i] * dW[i];
        W[i] -= (LR * (m[i] / (1 - b1 ** step))) / (Math.sqrt(v[i] / (1 - b2 ** step)) + 1e-8);
      }
      total += loss;
      batches++;
    }
    process.stdout.write(`\répoque ${epoch}/${EPOCHS} · perte ${(total / batches).toFixed(4)}   `);
  }
  console.log();

  await mkdir('eval/heads', { recursive: true });
  const out = `eval/heads/${MODEL_KEY}.json`;
  await writeFile(out, JSON.stringify({ model: pairs.model, dim: d, trainedOn: train.length, epochs: EPOCHS, temp: TEMP, lambda: LAMBDA, generatedAt: new Date().toISOString(), W: [...W].map((x) => Math.round(x * 1e5) / 1e5) }));
  console.log(`écrit ${out}`);
}

if (process.argv[1]?.endsWith('train-head.mjs')) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
