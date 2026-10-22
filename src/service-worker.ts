/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

/**
 * Service worker : l'application, le jeu de données et les vignettes sont mis en
 * cache à l'installation, pour fonctionner sans réseau (postes frontières, sous-sols).
 * Le modèle de reconnaissance est mis en cache par transformers.js lui-même.
 * Les images grand format du musée restent en réseau seul (repli sur la vignette).
 */
import { build, files, version, base } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `app-${version}`;
// Pas de fichiers cachés (.nojekyll…) : un seul 404 ferait échouer l'installation du cache.
const ASSETS = [...build, ...files.filter((f) => !f.split('/').some((seg) => seg.startsWith('.')))];

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => sw.skipWaiting())
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim())
  );
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return; // musée, Hub Hugging Face, CDN : réseau seul

  // Navigation : réseau d'abord, sinon la page d'accueil en cache (application monopage).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match(request)) ?? (await cache.match(`${base}/`)) ?? (await cache.match(`${base}/index.html`)) ?? Response.error();
      })
    );
    return;
  }

  // Ressources : cache d'abord, puis réseau avec mise en cache opportuniste.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok && (ASSETS.includes(url.pathname) || url.pathname.startsWith(`${base}/data/`))) cache.put(request, res.clone());
      return res;
    })
  );
});
