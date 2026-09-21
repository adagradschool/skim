import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { isNativeApp } from '@/platform'
import { extractUrlFromText } from '@/articles/extract'

/**
 * Things handed to Skim from outside: files (EPUB/PDF) and links (web
 * pages), via the Android share sheet / "Open with" in the native app, or
 * the Web Share Target in the installed PWA.
 */

export const LIBRARY_CHANGED_EVENT = 'skim:library-changed'
const SHARE_INBOX_CACHE = 'share-inbox'

export type SharedItem = { kind: 'file'; file: File } | { kind: 'link'; url: string; title?: string }

interface PendingItem {
  path: string | null
  name?: string
  mimeType?: string
  url?: string
  title?: string
}

interface ShareReceiverPlugin {
  getPendingFile(): Promise<PendingItem>
  addListener(event: 'fileShared', cb: () => void): Promise<PluginListenerHandle>
}

const ShareReceiver = registerPlugin<ShareReceiverPlugin>('ShareReceiver')

const ACCEPTED = /\.(epub|pdf)$/i

export function isAcceptedFile(file: File): boolean {
  return ACCEPTED.test(file.name) || file.type === 'application/epub+zip' || file.type === 'application/pdf'
}

/** Drain everything waiting to be imported. Safe to call repeatedly. */
export async function takeSharedItems(): Promise<SharedItem[]> {
  return isNativeApp ? takeNative() : takeWeb()
}

/** Fires when something new arrives while the app is already open (native only). */
export function onSharedItem(cb: () => void): () => void {
  if (!isNativeApp) return () => {}
  let handle: PluginListenerHandle | null = null
  ShareReceiver.addListener('fileShared', cb).then((h) => (handle = h)).catch(() => {})
  return () => {
    handle?.remove()
  }
}

function linkFrom(text: string | undefined, title?: string): SharedItem | null {
  const url = extractUrlFromText(text ?? '')
  return url ? { kind: 'link', url, title: title?.trim() || undefined } : null
}

async function takeNative(): Promise<SharedItem[]> {
  const items: SharedItem[] = []
  // The plugin hands over one item per call; loop until empty.
  for (let i = 0; i < 10; i++) {
    // Errors (unreadable URI, no permission) propagate so the app can show them.
    const pending: PendingItem = await ShareReceiver.getPendingFile()
    if (!pending.path && !pending.url) break
    if (!pending.path) {
      const link = linkFrom(pending.url, pending.title)
      if (link) items.push(link)
      continue
    }
    const res = await fetch(Capacitor.convertFileSrc(pending.path))
    if (!res.ok) continue
    const blob = await res.blob()
    const name = pending.name || pending.path.split('/').pop() || 'shared.epub'
    items.push({ kind: 'file', file: new File([blob], name, { type: pending.mimeType || blob.type }) })
  }
  return items
}

async function takeWeb(): Promise<SharedItem[]> {
  if (typeof caches === 'undefined') return []
  const items: SharedItem[] = []
  try {
    const cache = await caches.open(SHARE_INBOX_CACHE)
    for (const req of await cache.keys()) {
      const res = await cache.match(req)
      if (res) {
        if (res.headers.get('x-kind') === 'link') {
          const data = (await res.json().catch(() => ({}))) as { url?: string; text?: string; title?: string }
          const link = linkFrom(data.url || data.text, data.title) ?? linkFrom(data.text, data.title)
          if (link) items.push(link)
        } else {
          const blob = await res.blob()
          const name = decodeURIComponent(res.headers.get('x-file-name') || 'shared')
          items.push({ kind: 'file', file: new File([blob], name, { type: res.headers.get('content-type') || blob.type }) })
        }
      }
      await cache.delete(req)
    }
  } catch (err) {
    console.error('share inbox read failed', err)
  }
  return items
}

export function notifyLibraryChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(LIBRARY_CHANGED_EVENT))
}
