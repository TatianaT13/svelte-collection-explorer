/**
 * Modèles d'embedding utilisables par les scripts (Node, transformers.js), derrière une même interface :
 *   load()       → embed(image) : Float32Array normalisé (vecteur global)
 *   loadTokens() → tokens(image) : { global, patches, n, d } (DINO seulement : jetons de patch)
 * Garder cette liste courte : chaque entrée est un modèle qu'on a mesuré et qu'on sait expliquer.
 */
import { AutoModel, AutoProcessor, CLIPVisionModelWithProjection, env } from '@huggingface/transformers';

env.allowLocalModels = false;

async function loadDino() {
  const processor = await AutoProcessor.from_pretrained(this.id);
  const model = await AutoModel.from_pretrained(this.id, { dtype: 'q8' });
  return async (img) => {
    const out = await model(await processor(img));
    return Float32Array.from((out.pooler_output ?? out.last_hidden_state.slice(null, 0)).normalize(2, -1).data);
  };
}

/** DINO, jetons complets : CLS normalisé + N patches normalisés (224 px, patch 14 → N = 256). */
async function loadDinoTokens() {
  const processor = await AutoProcessor.from_pretrained(this.id);
  const model = await AutoModel.from_pretrained(this.id, { dtype: 'q8' });
  return async (img) => {
    const { last_hidden_state } = await model(await processor(img));
    const [, n, d] = last_hidden_state.dims;
    const all = last_hidden_state.data;
    const global = Float32Array.from(last_hidden_state.slice(null, 0).normalize(2, -1).data);
    const patches = new Float32Array((n - 1) * d);
    for (let i = 1; i < n; i++) {
      let s = 0;
      for (let k = 0; k < d; k++) s += all[i * d + k] ** 2;
      s = Math.sqrt(s) || 1;
      for (let k = 0; k < d; k++) patches[(i - 1) * d + k] = all[i * d + k] / s;
    }
    return { global, patches, n: n - 1, d };
  };
}

export const MODELS = {
  /** Le modèle du navigateur et de l'index : tour visuelle seule, int8. */
  clip: {
    id: 'Xenova/clip-vit-base-patch32',
    async load() {
      const processor = await AutoProcessor.from_pretrained(this.id);
      const model = await CLIPVisionModelWithProjection.from_pretrained(this.id, { dtype: 'q8' });
      return async (img) => Float32Array.from((await model(await processor(img))).image_embeds.normalize(2, -1).data);
    }
  },
  /** Auto-supervisé, sans texte : meilleur pour « même objet sous un autre angle » (mesuré § 16 du README). */
  'dinov2-small': { id: 'Xenova/dinov2-small', load: loadDino, loadTokens: loadDinoTokens }
};

export function getModel(key) {
  const def = MODELS[key];
  if (!def) throw new Error(`modèle inconnu : ${key} (choix : ${Object.keys(MODELS).join(', ')})`);
  return def;
}
