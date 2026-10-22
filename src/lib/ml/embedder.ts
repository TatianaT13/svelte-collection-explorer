import { modelStatus } from './status.svelte';

/**
 * Embedding d'image dans le navigateur avec CLIP (transformers.js, ONNX Runtime Web).
 * Le travail se fait dans un Web Worker (embed.worker.ts) pour ne jamais figer
 * l'interface ; repli sur le fil principal si les workers modules sont indisponibles.
 * Le modèle (~90 Mo quantifié) est téléchargé une fois puis mis en cache. Même modèle
 * que scripts/build-data.mjs.
 */
export const MODEL_ID = 'Xenova/clip-vit-base-patch32';

type Pending = { resolve: (v: Float32Array) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map<number, Pending>();
const files = new Map<string, { loaded: number; total: number }>();

function onProgress(file: string, loaded: number, total: number) {
  files.set(file, { loaded, total });
  let l = 0;
  let t = 0;
  for (const f of files.values()) {
    l += f.loaded;
    t += f.total;
  }
  modelStatus.loading(t ? l / t : 0);
}

function getWorker(): Worker | null {
  if (workerFailed || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./embed.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    workerFailed = true;
    return null;
  }
  modelStatus.loading(0);
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data;
    if (m.type === 'progress') onProgress(m.file ?? '', m.loaded ?? 0, m.total ?? 0);
    else if (m.type === 'ready') modelStatus.ready();
    else if (m.type === 'result') {
      pending.get(m.id)?.resolve(m.vector as Float32Array);
      pending.delete(m.id);
    } else if (m.type === 'error') {
      const err = new Error(m.message);
      if (m.id !== undefined) {
        pending.get(m.id)?.reject(err);
        pending.delete(m.id);
      }
      if (modelStatus.state !== 'ready') modelStatus.error(m.message);
    }
  };
  worker.onerror = (ev) => {
    workerFailed = true;
    const err = new Error(ev.message || 'worker error');
    for (const p of pending.values()) p.reject(err);
    pending.clear();
    worker?.terminate();
    worker = null;
    modelStatus.error(err.message);
  };
  return worker;
}

/** Repli sans worker (anciens navigateurs). */
async function embedInline(file: Blob): Promise<Float32Array> {
  modelStatus.loading(0);
  const { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;
  const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status === 'progress' && p.file) onProgress(p.file, p.loaded ?? 0, p.total ?? 0);
  };
  const processor = await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback });
  const vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'q8', progress_callback });
  modelStatus.ready();
  const image = await RawImage.fromBlob(file);
  const inputs = await processor(image);
  const { image_embeds } = await vision(inputs);
  return new Float32Array(image_embeds.normalize(2, -1).data as Float32Array);
}

/** Vecteur normalisé (512 dimensions) d'une image. */
export function embedImage(file: Blob): Promise<Float32Array> {
  const w = getWorker();
  if (!w) return embedInline(file);
  const id = nextId++;
  return new Promise<Float32Array>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, type: 'embed', blob: file });
  }).catch(async (e) => {
    if (workerFailed) return embedInline(file);
    throw e;
  });
}

/** Lance le chargement du modèle en avance (par exemple dès qu'une image est choisie). */
export function preloadModel(): void {
  const w = getWorker();
  if (w) w.postMessage({ id: nextId++, type: 'load' });
}

/** Similarité cosinus entre deux vecteurs normalisés. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
