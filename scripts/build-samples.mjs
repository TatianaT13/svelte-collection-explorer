/**
 * Images d'exemple pour « Essayer avec une image » : vues alternatives (dos, détail, autre
 * angle) d'objets du jeu de données, fournies par le Met (additionalImages). Une vue
 * différente du même objet donne une similarité élevée mais pas parfaite : bon cas de démo.
 *
 *   node scripts/build-samples.mjs
 * Produit static/data/samples/<id>-alt.jpg et static/data/samples.json
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { RawImage } from '@huggingface/transformers';

const API = 'https://collectionapi.metmuseum.org/public/collection/v1';
const MAX = 6;
const PX = 1024;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const items = JSON.parse(await readFile('static/data/items.json', 'utf8')).items;
await mkdir('static/data/samples', { recursive: true });
const samples = [];
for (const it of items) {
  if (samples.length >= MAX) break;
  await sleep(120);
  let o;
  try {
    o = await (await fetch(`${API}/objects/${it.id}`)).json();
  } catch {
    continue;
  }
  const alt = (o.additionalImages ?? []).find((u) => u && u !== o.primaryImage);
  if (!alt) continue;
  // Variété : pas deux fois la même catégorie
  if (samples.some((s) => s.category === it.metadata.category)) continue;
  try {
    const img = await RawImage.read(alt);
    const scale = Math.min(1, PX / Math.max(img.width, img.height));
    const out = scale < 1 ? await img.resize(Math.round(img.width * scale), Math.round(img.height * scale)) : img;
    await out.save(`static/data/samples/${it.id}-alt.jpg`);
    samples.push({ file: `data/samples/${it.id}-alt.jpg`, objectId: it.id, title: it.title, category: it.metadata.category, origin: it.metadata.origin, source: alt });
    process.stdout.write(`\r${samples.length} exemples… `);
  } catch (e) {
    console.warn('\nimage illisible', it.id, e.message);
  }
}
console.log();
await writeFile('static/data/samples.json', JSON.stringify({ note: 'Vues alternatives d’objets du jeu de données (Met, CC0)', samples }, null, 2));
console.log(`écrit static/data/samples.json (${samples.length} exemples)`);
