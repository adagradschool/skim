/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { clientsClaim } from 'workbox-core'

declare let self: ServiceWorkerGlobalScope

export const SHARE_INBOX_CACHE = 'share-inbox'
export const SHARE_TARGET_PATH = '/share-target'

self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// App shell: network first, fall back to cache
registerRoute(
  ({ url }) => url.origin === self.location.origin && (url.pathname === '/' || url.pathname === '/index.html'),
  new NetworkFirst({ cacheName: 'app-shell' })
)

// Web Share Target: the OS posts the shared file here. Stash it in a cache
// and bounce to the app, which picks it up and imports it.
registerRoute(
  ({ url, request }) => url.origin === self.location.origin && url.pathname === SHARE_TARGET_PATH && request.method === 'POST',
  async ({ event }) => {
    try {
      const form = await (event as FetchEvent).request.formData()
      const files = form.getAll('file').filter((f: FormDataEntryValue): f is File => f instanceof File)
      const cache = await caches.open(SHARE_INBOX_CACHE)
      for (const file of files) {
        const key = `/share-inbox/${Date.now()}-${Math.random().toString(36).slice(2)}`
        await cache.put(
          new Request(key),
          new Response(file, {
            headers: {
              'content-type': file.type || 'application/octet-stream',
              'x-file-name': encodeURIComponent(file.name || 'shared'),
            },
          })
        )
      }
    } catch (err) {
      console.error('[sw] share-target failed', err)
    }
    return Response.redirect('/?shared=1', 303)
  },
  'POST'
)

// SPA navigation fallback (GET only; the share POST above never reaches this)
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api/, new RegExp(`^${SHARE_TARGET_PATH}`)],
  })
)
