/** Petites fonctions partagées par les scripts de mesure : similarité, statistiques, partition, corpus. */
import { readFile } from 'node:fs/promises';

/** Valeur d'un argument nommé (`--nom valeur`), ou la valeur par défaut s'il est absent. */
export function argValue(name, dflt) {
  const i = process.argv.indexOf(name);
  return i === -1 || i + 1 >= process.argv.length ? dflt : process.argv[i + 1];
}

export function cosine(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
}

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
export const pct = (x) => Math.round(x * 1000) / 10;
export const round3 = (x) => Math.round(x * 1000) / 1000;

/** Partition stable par identifiant : 0–5 entraînement, 6–7 calibration, 8–9 test. Même règle partout. */
export function bucket(id) {
  let h = 5381;
  for (const c of String(id)) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 10;
}
export const isTrain = (id) => bucket(id) <= 5;
export const isCalibration = (id) => bucket(id) === 6 || bucket(id) === 7;
export const isTest = (id) => bucket(id) >= 8;

/** Seuil conforme : k-ième plus petite valeur, k = ⌊α (n+1)⌋ ; k = 0 → aucun seuil. */
export function conformalThreshold(scores, alpha) {
  const s = [...scores].sort((a, b) => a - b);
  const k = Math.floor(alpha * (s.length + 1));
  return k >= 1 ? s[k - 1] : -1;
}

/** v ↦ normalize(v W), pour une tête apprise par experiments/train-head.mjs ; sans tête, identité. */
export function projector(head) {
  if (!head) return (v) => v;
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

/** Corpus de démo : métadonnées (items.json) et vecteurs (embeddings.bin, Float32 n × dim, même ordre). */
export async function loadCorpus() {
  const dataset = JSON.parse(await readFile('static/data/items.json', 'utf8'));
  const buf = await readFile('static/data/embeddings.bin');
  const all = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const { dim } = dataset;
  const vectors = dataset.items.map((_, i) => all.subarray(i * dim, (i + 1) * dim));
  return { ...dataset, vectors };
}
