/**
 * Server-side page fetch for the web app (browsers can't read other sites
 * cross-origin). Used by the Vercel function in api/fetch.js and by the Vite
 * dev/preview server so the same code runs everywhere.
 *
 * GET /api/fetch?url=https://example.com/post
 * -> { url, finalUrl, contentType, html }
 */

const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 15000
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36 Skim/1.0'

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[::1\]|\[fc|\[fd|\[fe80)/i

export function validateUrl(raw) {
  let u
  try {
    u = new URL(raw)
  } catch {
    return { error: 'Not a valid URL' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: 'Only http and https links can be saved' }
  if (PRIVATE_HOST.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) return { error: 'That address is not reachable from here' }
  return { url: u }
}

export async function fetchPage(rawUrl) {
  const v = validateUrl(rawUrl)
  if (v.error) return { status: 400, body: { error: v.error } }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(v.url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'accept-language': 'en-US,en;q=0.8',
      },
    })
    const contentType = res.headers.get('content-type') || ''
    if (!res.ok) return { status: 502, body: { error: `The site answered ${res.status}` } }
    const isPdf = /application\/pdf/i.test(contentType) || /\.pdf($|[?#])/i.test(res.url || rawUrl)
    if (!isPdf && !/text\/html|application\/xhtml/i.test(contentType)) {
      return { status: 415, body: { error: 'That link is not a web page', contentType } }
    }
    const reader = res.body?.getReader()
    if (!reader) return { status: 502, body: { error: 'Empty response' } }
    const chunks = []
    let received = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > MAX_BYTES) {
        await reader.cancel()
        return { status: 413, body: { error: 'That page is too large to save' } }
      }
      chunks.push(value)
    }
    const bytes = Buffer.concat(chunks.map((c) => Buffer.from(c)))
    if (isPdf) {
      return { status: 200, pdf: bytes, body: { url: rawUrl, finalUrl: res.url || rawUrl, contentType: 'application/pdf' } }
    }
    const html = decodeHtml(bytes, contentType)
    return { status: 200, body: { url: rawUrl, finalUrl: res.url || rawUrl, contentType, html } }
  } catch (err) {
    const aborted = err && err.name === 'AbortError'
    return { status: 504, body: { error: aborted ? 'The site took too long to respond' : `Could not reach the site: ${err?.message || err}` } }
  } finally {
    clearTimeout(timer)
  }
}

function decodeHtml(buf, contentType) {
  const m = /charset=([\w-]+)/i.exec(contentType)
  let charset = m ? m[1].toLowerCase() : null
  if (!charset) {
    const head = buf.subarray(0, 4096).toString('latin1')
    const meta = /<meta[^>]+charset=["']?\s*([\w-]+)/i.exec(head)
    if (meta) charset = meta[1].toLowerCase()
  }
  try {
    return new TextDecoder(charset || 'utf-8').decode(buf)
  } catch {
    return buf.toString('utf8')
  }
}

/** Node/Vercel-style (req, res) handler. */
export async function handleFetchPage(req, res) {
  const origin = 'http://localhost'
  const url = new URL(req.url || '/', origin).searchParams.get('url') || ''
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-methods', 'GET, OPTIONS')
  res.setHeader('cache-control', 'no-store')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  const { status, body, pdf } = await fetchPage(url)
  res.statusCode = status
  if (pdf) {
    // Binary passthrough: the app imports it with the regular PDF pipeline.
    res.setHeader('content-type', 'application/pdf')
    res.setHeader('x-final-url', encodeURI(body.finalUrl))
    res.end(pdf)
    return
  }
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}
