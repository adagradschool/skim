import { CapacitorHttp } from '@capacitor/core'
import { isNativeApp } from '@/platform'

export type FetchedPage = { kind: 'html'; html: string; finalUrl: string } | { kind: 'pdf'; blob: Blob; finalUrl: string }

const PDF_URL = /\.pdf($|[?#])/i

const PROXY_PATH = '/api/fetch'
const TIMEOUT_MS = 20000

/**
 * Get a page's HTML. The native app fetches directly (no CORS in native
 * HTTP); the website goes through our small proxy function. Native falls
 * back to the proxy if the direct request fails.
 */
export async function fetchPageHtml(url: string): Promise<FetchedPage> {
  if (isNativeApp) {
    try {
      const wantsPdf = PDF_URL.test(url)
      const res = await CapacitorHttp.get({
        url,
        connectTimeout: TIMEOUT_MS,
        readTimeout: TIMEOUT_MS,
        responseType: wantsPdf ? 'blob' : 'text',
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36 Skim/1.0',
        },
      })
      const ct = String(res.headers?.['content-type'] ?? res.headers?.['Content-Type'] ?? '')
      if (res.status >= 200 && res.status < 300 && typeof res.data === 'string' && res.data.length > 0) {
        if (wantsPdf || /application\/pdf/i.test(ct)) {
          // Capacitor returns blobs as base64
          const bin = atob(res.data)
          const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          return { kind: 'pdf', blob: new Blob([bytes], { type: 'application/pdf' }), finalUrl: res.url || url }
        }
        return { kind: 'html', html: res.data, finalUrl: res.url || url }
      }
      throw new Error(`The site answered ${res.status}`)
    } catch (err) {
      console.warn('Native fetch failed, trying proxy', err)
    }
  }

  const proxyBase = isNativeApp ? 'https://justskim.in' : ''
  const res = await fetch(`${proxyBase}${PROXY_PATH}?url=${encodeURIComponent(url)}`)
  if (res.ok && /application\/pdf/i.test(res.headers.get('content-type') || '')) {
    const finalUrl = decodeURI(res.headers.get('x-final-url') || '') || url
    return { kind: 'pdf', blob: await res.blob(), finalUrl }
  }
  const body = (await res.json().catch(() => ({}))) as { html?: string; finalUrl?: string; error?: string }
  if (!res.ok || !body.html) {
    throw new Error(body.error || `Could not fetch that page (${res.status})`)
  }
  return { kind: 'html', html: body.html, finalUrl: body.finalUrl || url }
}
