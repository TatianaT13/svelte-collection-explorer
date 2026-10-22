/**
 * Worker : chargement du modèle CLIP et calcul des embeddings hors du fil principal.
 * Protocole : { id, type: 'load' | 'embed', blob? } → { id, type: 'loaded' | 'result' | 'error', vector?, message? }
 * et des messages { type: 'progress' | 'ready' } sans id pendant le chargement.
 */
/// <reference lib="webworker" />
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const MODEL_ID = 'Xenova/clip-vit-base-patch32';
env.allowLocalModels = false;

type Loaded = {
  processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
  vision: Awaited<ReturnType<typeof CLIPVisionModelWithProjection.from_pretrained>>;
};

let loaded: Promise<Loaded> | null = null;

function load(): Promise<Loaded> {
  loaded ??= (async () => {
    const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === 'progress') ctx.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
    };
    const processor = await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback });
    const vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'q8', progress_callback });
    ctx.postMessage({ type: 'ready' });
    return { processor, vision };
  })().catch((e: unknown) => {
    loaded = null;
    throw e;
  });
  return loaded;
}

ctx.onmessage = async (e: MessageEvent<{ id: number; type: 'load' | 'embed'; blob?: Blob }>) => {
  const { id, type, blob } = e.data;
  try {
    if (type === 'load') {
      await load();
      ctx.postMessage({ id, type: 'loaded' });
      return;
    }
    if (type === 'embed' && blob) {
      const { processor, vision } = await load();
      const image = await RawImage.fromBlob(blob);
      const inputs = await processor(image);
      const { image_embeds } = await vision(inputs);
      const vector = new Float32Array(image_embeds.normalize(2, -1).data as Float32Array);
      ctx.postMessage({ id, type: 'result', vector }, [vector.buffer]);
    }
  } catch (err) {
    ctx.postMessage({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
