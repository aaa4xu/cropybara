/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { base, build, files, prerendered, version } from '$service-worker';
import { SERVICE_WORKER_SKIP_WAITING_MESSAGE } from '../lib/ServiceWorkerMessages';
import { WebShareTarget } from '../lib/WebShareTarget';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Create a unique cache name for this deployment
const CACHE = `cache-${version}`;
const APP_SHELL = `${base}/`;
const BUNDLE_REFERENCE_PATTERN = /["'`]((?:\.\.\/workers\/|\.\/chunks\/)[^"'`]+\.js)["'`]/g;

const ASSETS = [
  APP_SHELL,
  ...build, // the app itself
  ...files, // everything in `static`
  ...prerendered, // prerendered routes and endpoints
].filter((asset, index, assets) => assets.indexOf(asset) === index);

function isJavaScript(pathname: string): boolean {
  return pathname.endsWith('.js');
}

function isNavigationRequest(request: Request): boolean {
  return request.mode === 'navigate' || (request.headers.get('accept') ?? '').includes('text/html');
}

function resolveSameOriginPath(pathname: string, sourcePathname: string): string | null {
  const url = new URL(pathname, new URL(sourcePathname, sw.location.origin));

  return url.origin === sw.location.origin ? url.pathname : null;
}

async function findBundledWorkerReferences(cache: Cache, pathname: string): Promise<string[]> {
  const response = await cache.match(pathname);

  if (!response) {
    return [];
  }

  const source = await response.clone().text();
  const references = new Set<string>();

  for (const match of source.matchAll(BUNDLE_REFERENCE_PATTERN)) {
    const reference = resolveSameOriginPath(match[1], pathname);

    if (reference) {
      references.add(reference);
    }
  }

  return [...references];
}

async function addDiscoveredWorkerBundlesToCache(cache: Cache) {
  const queued = ASSETS.filter(isJavaScript);
  const seen = new Set(ASSETS);

  while (queued.length > 0) {
    const pathname = queued.shift();

    if (!pathname) {
      continue;
    }

    const references = await findBundledWorkerReferences(cache, pathname);

    for (const reference of references) {
      if (seen.has(reference)) {
        continue;
      }

      seen.add(reference);

      const response = await fetch(reference);

      if (!response.ok) {
        throw new Error(`Failed to cache worker bundle ${reference}: ${response.status}`);
      }

      await cache.put(reference, response.clone());

      if (isJavaScript(reference)) {
        queued.push(reference);
      }
    }
  }
}

sw.addEventListener('install', (event) => {
  // Create a new cache and add all files to it
  async function addFilesToCache() {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    await addDiscoveredWorkerBundlesToCache(cache);
  }

  event.waitUntil(addFilesToCache());
});

sw.addEventListener('activate', (event) => {
  // Remove previous cached data from disk
  async function deleteOldCaches() {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
  }

  event.waitUntil(deleteOldCaches());
});

sw.addEventListener('message', (event) => {
  const message = event.data as { type?: unknown } | null;

  if (message?.type === SERVICE_WORKER_SKIP_WAITING_MESSAGE) {
    event.waitUntil(sw.skipWaiting());
  }
});

sw.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'POST' && url.pathname.endsWith('/share_target')) {
    event.respondWith(
      (async () => {
        const formData = await event.request.formData();
        // Delete previous data if it wasn't processed for some reason
        await caches.delete(WebShareTarget.CacheName);

        const images = formData.getAll('image');
        const mediaCache = await caches.open(WebShareTarget.CacheName);

        for (let i = 0; i < images.length; i++) {
          const image = images[i];
          if (typeof image === 'string') continue;
          await mediaCache.put(
            i.toString(),
            new Response(image, {
              headers: {
                [WebShareTarget.TypeHeader]: image.type,
                [WebShareTarget.FilenameHeader]: image.name,
              },
            }),
          );
        }

        return Response.redirect('./?source=share-target', 303);
      })(),
    );
  }

  // ignore POST requests etc
  if (event.request.method !== 'GET') return;

  async function respond() {
    const cache = await caches.open(CACHE);

    // `build`/`files` can always be served from the cache
    if (ASSETS.includes(url.pathname)) {
      const response = await cache.match(url.pathname);

      if (response) {
        return response;
      }
    }

    // for everything else, try the network first, but
    // fall back to the cache if we're offline
    try {
      const response = await fetch(event.request);

      // if we're offline, fetch can return a value that is not a Response
      // instead of throwing - and we can't pass this non-Response to respondWith
      if (!(response instanceof Response)) {
        // noinspection ExceptionCaughtLocallyJS
        throw new Error('invalid response from fetch');
      }

      if (response.status === 200) {
        cache.put(event.request, response.clone());
      }

      return response;
    } catch (err) {
      const response = await cache.match(event.request);

      if (response) {
        return response;
      }

      if (isNavigationRequest(event.request)) {
        const fallback = await cache.match(APP_SHELL);

        if (fallback) {
          return fallback;
        }
      }

      // if there's no cache, then just error out
      // as there is nothing we can do to respond to this request
      throw err;
    }
  }

  event.respondWith(respond());
});
