import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { isNativeApp } from '@/platform'

/**
 * Files handed to Skim from outside: the Android share sheet / "Open with"
 * in the native app, or the Web Share Target in the installed PWA.
 */

export const LIBRARY_CHANGED_EVENT = 'skim:library-changed'
const SHARE_INBOX_CACHE = 'share-inbox'

interface PendingFile {
  path: string | null
  name?: string
  mimeType?: string
}

interface ShareReceiverPlugin {
  getPendingFile(): Promise<PendingFile>
  addListener(event: 'fileShared', cb: () => void): Promise<PluginListenerHandle>
}

const ShareReceiver = registerPlugin<ShareReceiverPlugin>('ShareReceiver')

const ACCEPTED = /\.(epub|pdf)$/i

export function isAcceptedFile(file: File): boolean {
  return ACCEPTED.test(file.name) || file.type === 'application/epub+zip' || file.type === 'application/pdf'
}

/** Drain every file waiting to be imported. Safe to call repeatedly. */
export async function takeSharedFiles(): Promise<File[]> {
  return isNativeApp ? takeNative() : takeWeb()
}

/** Fires when a new file arrives while the app is already open (native only). */
export function onSharedFile(cb: () => void): () => void {
  if (!isNativeApp) return () => {}
  let handle: PluginListenerHandle | null = null
  ShareReceiver.addListener('fileShared', cb).then((h) => (handle = h)).catch(() => {})
  return () => {
    handle?.remove()
  }
}

async function takeNative(): Promise<File[]> {
  const files: File[] = []
  // The plugin hands over one file per call; loop until empty.
  for (let i = 0; i < 10; i++) {
    // Errors (unreadable URI, no permission) propagate so the app can show them.
    const pending: PendingFile = await ShareReceiver.getPendingFile()
    if (!pending.path) break
    const res = await fetch(Capacitor.convertFileSrc(pending.path))
    if (!res.ok) continue
    const blob = await res.blob()
    const name = pending.name || pending.path.split('/').pop() || 'shared.epub'
    files.push(new File([blob], name, { type: pending.mimeType || blob.type }))
  }
  return files
}

async function takeWeb(): Promise<File[]> {
  if (typeof caches === 'undefined') return []
  const files: File[] = []
  try {
    const cache = await caches.open(SHARE_INBOX_CACHE)
    for (const req of await cache.keys()) {
      const res = await cache.match(req)
      if (res) {
        const blob = await res.blob()
        const name = decodeURIComponent(res.headers.get('x-file-name') || 'shared')
        files.push(new File([blob], name, { type: res.headers.get('content-type') || blob.type }))
      }
      await cache.delete(req)
    }
  } catch (err) {
    console.error('share inbox read failed', err)
  }
  return files
}

export function notifyLibraryChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(LIBRARY_CHANGED_EVENT))
}
