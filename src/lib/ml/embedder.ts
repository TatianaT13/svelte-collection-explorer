import { modelStatus } from './status.svelte';

/**
 * Embedding d'image dans le navigateur avec CLIP (transformers.js, ONNX Runtime Web).
 * Le modèle (~90 Mo quantifié) est téléchargé une fois depuis le Hub Hugging Face
 * puis mis en cache par le navigateur. Même modèle que scripts/build-data.mjs.
 */
export const MODEL_ID = 'Xenova/clip-vit-base-patch32';

type Transformers = typeof import('@huggingface/transformers');
type Loaded = {
  processor: Awaited<ReturnType<Transformers['AutoProcessor']['from_pretrained']>>;
  vision: Awaited<ReturnType<Transformers['CLIPVisionModelWithProjection']['from_pretrained']>>;
  RawImage: Transformers['RawImage'];
};

let loaded: Promise<Loaded> | null = null;

interface ProgressEvent {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
}

export function loadModel(): Promise<Loaded> {
  loaded ??= (async () => {
    modelStatus.loading(0);
    const { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } = await import('@huggingface/transformers');
    env.allowLocalModels = false;

    const files = new Map<string, { loaded: number; total: number }>();
    const progress_callback = (p: ProgressEvent) => {
      if (p.status !== 'progress' || !p.file) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
      let l = 0;
      let t = 0;
      for (const f of files.values()) {
        l += f.loaded;
        t += f.total;
      }
      modelStatus.loading(t ? l / t : 0);
    };

    const processor = await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback });
    const vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'q8', progress_callback });
    modelStatus.ready();
    return { processor, vision, RawImage };
  })().catch((e: unknown) => {
    loaded = null;
    modelStatus.error(e instanceof Error ? e.message : String(e));
    throw e;
  });
  return loaded;
}

/** Vecteur normalisé (512 dimensions) d'une image. */
export async function embedImage(file: Blob): Promise<Float32Array> {
  const { processor, vision, RawImage } = await loadModel();
  const image = await RawImage.fromBlob(file);
  const inputs = await processor(image);
  const { image_embeds } = await vision(inputs);
  const normalized = image_embeds.normalize(2, -1);
  return new Float32Array(normalized.data as Float32Array);
}

/** Similarité cosinus entre deux vecteurs normalisés. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
