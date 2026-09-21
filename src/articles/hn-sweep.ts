/**
 * Real-world sweep: run every Hacker News front-page link through the same
 * fetch + extraction path the app uses. Run with: bun src/articles/hn-sweep.ts
 * Not a unit test; prints a table and a summary.
 */
import { JSDOM } from 'jsdom'
import { fetchPage } from '../../api/_lib/fetchPage.mjs'

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://example.com/' })
const w = dom.window as unknown as Record<string, unknown>
const g = globalThis as unknown as Record<string, unknown>
for (const k of ['window', 'document', 'DOMParser', 'Node', 'Element', 'HTMLElement', 'NodeFilter', 'HTMLTemplateElement', 'DocumentFragment', 'Text', 'Comment']) {
  g[k] = k === 'window' ? dom.window : w[k]
}
const { extractArticleFromHtml, rewriteForReadability } = await import('./extract')

interface Row {
  hnTitle: string
  url: string
  status: 'ok' | 'fetch-error' | 'extract-error'
  detail: string
  words?: number
  chapters?: number
  title?: string
  site?: string
  ms: number
}

const LIMIT = Number(process.argv[2] ?? 30)
const ids = (await (await fetch('https://hacker-news.firebaseio.com/v0/topstories.json')).json()) as number[]
const items = (
  await Promise.all(ids.slice(0, LIMIT).map(async (id) => (await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)).json()))
) as Array<{ title: string; url?: string; id: number }>

const rows: Row[] = []
const queue = [...items]
async function worker() {
  while (queue.length) {
    const item = queue.shift()!
    const url = rewriteForReadability(item.url ?? `https://news.ycombinator.com/item?id=${item.id}`)
    const t0 = Date.now()
    const page = await fetchPage(url)
    if (page.status === 200 && page.pdf) {
      rows.push({ hnTitle: item.title, url, status: 'ok', detail: 'pdf', words: page.pdf.length, chapters: 0, title: `[PDF] ${item.title}`, site: new URL(url).hostname, ms: Date.now() - t0 })
      continue
    }
    if (page.status !== 200) {
      rows.push({ hnTitle: item.title, url, status: 'fetch-error', detail: `${page.status} ${page.body.error}`, ms: Date.now() - t0 })
      continue
    }
    try {
      const a = extractArticleFromHtml(page.body.html, page.body.finalUrl)
      rows.push({
        hnTitle: item.title,
        url,
        status: 'ok',
        detail: '',
        words: a.words,
        chapters: a.chapters.length,
        title: a.title,
        site: a.siteName,
        ms: Date.now() - t0,
      })
    } catch (err) {
      rows.push({ hnTitle: item.title, url, status: 'extract-error', detail: err instanceof Error ? err.message : String(err), ms: Date.now() - t0 })
    }
  }
}
await Promise.all([worker(), worker(), worker(), worker()])

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
for (const r of rows) {
  const host = new URL(r.url).hostname.replace(/^www\./, '')
  if (r.status === 'ok') {
    console.log(`OK    ${cut(host, 26).padEnd(26)} ${String(r.words).padStart(6)}w ${String(r.chapters).padStart(2)}ch ${String(r.ms).padStart(5)}ms  ${cut(r.title!, 60)}`)
  } else {
    console.log(`${r.status === 'fetch-error' ? 'FETCH' : 'EXTR '} ${cut(host, 26).padEnd(26)} ${''.padStart(19)} ${cut(r.detail, 70)}  [${cut(r.hnTitle, 40)}]`)
  }
}
const ok = rows.filter((r) => r.status === 'ok').length
console.log(`\n${ok}/${rows.length} extracted · fetch errors ${rows.filter((r) => r.status === 'fetch-error').length} · extract errors ${rows.filter((r) => r.status === 'extract-error').length}`)
