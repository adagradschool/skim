import { isNativeApp } from '@/platform'

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
const RELEASES_API = 'https://api.github.com/repos/adagradschool/skim/releases/latest'
export const RELEASES_PAGE = 'https://github.com/adagradschool/skim/releases/latest'

export interface ReleaseInfo {
  version: string
  name: string
  publishedAt: string
  apkUrl?: string
  pageUrl: string
  isNewer: boolean
}

export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

export async function fetchLatestRelease(): Promise<ReleaseInfo> {
  const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`)
  const data = (await res.json()) as {
    tag_name: string
    name?: string
    published_at: string
    html_url: string
    assets?: Array<{ name: string; browser_download_url: string }>
  }
  const version = data.tag_name.replace(/^v/, '')
  const apk = data.assets?.find((a) => a.name.endsWith('.apk'))
  return {
    version,
    name: data.name || data.tag_name,
    publishedAt: data.published_at,
    apkUrl: apk?.browser_download_url,
    pageUrl: data.html_url,
    isNewer: compareVersions(version, APP_VERSION) > 0,
  }
}

/** Web only: ask the service worker for a new build and reload when it has one. */
export async function refreshWebApp(): Promise<'updated' | 'current' | 'unsupported'> {
  if (isNativeApp || !('serviceWorker' in navigator)) return 'unsupported'
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return 'unsupported'
  await reg.update()
  if (reg.waiting) {
    reg.waiting.postMessage({ type: 'SKIP_WAITING' })
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
      setTimeout(resolve, 3000)
    })
    window.location.reload()
    return 'updated'
  }
  return 'current'
}
