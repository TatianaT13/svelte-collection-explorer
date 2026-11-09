/**
 * Worker : chargement du modèle CLIP et calcul des embeddings hors du fil principal.
 * Protocole : { id, type: 'load' | 'embed' | 'loadText' | 'embedText', blob?, text? }
 *          → { id, type: 'loaded' | 'result' | 'error', vector?, message? }
 * et des messages { type: 'progress' | 'ready' } sans id pendant le chargement.
 * La tour image (90 Mo) et la tour texte (64 Mo) se chargent séparément, à la demande : elles projettent dans le
 * même espace, un texte et une image se comparent par le même cosinus.
 */
/// <reference lib="webworker" />
import { AutoProcessor, AutoTokenizer, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';
import { MODEL_ID, MODEL_REVISION } from './model';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
env.allowLocalModels = false;

type Loaded = {
  processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
  vision: Awaited<ReturnType<typeof CLIPVisionModelWithProjection.from_pretrained>>;
};

type LoadedText = {
  tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
  text: Awaited<ReturnType<typeof CLIPTextModelWithProjection.from_pretrained>>;
};

let loaded: Promise<Loaded> | null = null;
let loadedText: Promise<LoadedText> | null = null;

const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
  if (p.status === 'progress') ctx.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
};

function loadText(): Promise<LoadedText> {
  loadedText ??= (async () => {
    const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, { revision: MODEL_REVISION, progress_callback });
    const text = await CLIPTextModelWithProjection.from_pretrained(MODEL_ID, { revision: MODEL_REVISION, dtype: 'q8', progress_callback });
    ctx.postMessage({ type: 'ready' });
    return { tokenizer, text };
  })().catch((e: unknown) => {
    loadedText = null;
    throw e;
  });
  return loadedText;
}

function load(): Promise<Loaded> {
  loaded ??= (async () => {
    const processor = await AutoProcessor.from_pretrained(MODEL_ID, { revision: MODEL_REVISION, progress_callback });
    const vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { revision: MODEL_REVISION, dtype: 'q8', progress_callback });
    ctx.postMessage({ type: 'ready' });
    return { processor, vision };
  })().catch((e: unknown) => {
    loaded = null;
    throw e;
  });
  return loaded;
}

ctx.onmessage = async (e: MessageEvent<{ id: number; type: 'load' | 'embed' | 'loadText' | 'embedText'; blob?: Blob; text?: string }>) => {
  const { id, type, blob, text } = e.data;
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
    if (type === 'loadText') {
      await loadText();
      ctx.postMessage({ id, type: 'loaded' });
      return;
    }
    if (type === 'embedText' && typeof text === 'string') {
      const { tokenizer, text: model } = await loadText();
      const inputs = tokenizer(text, { padding: true, truncation: true });
      const { text_embeds } = await model(inputs);
      const vector = new Float32Array(text_embeds.normalize(2, -1).data as Float32Array);
      ctx.postMessage({ id, type: 'result', vector }, [vector.buffer]);
    }
  } catch (err) {
    ctx.postMessage({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
