/**
 * Builds public/catalog/standard-ebooks.json from standardebooks.org.
 *
 * Standard Ebooks' OPDS feed is patron-only, so this walks the public HTML
 * listing (sorted by popularity) and then each book page for the blurb, word
 * count, and subjects. It is polite: two requests in flight, a short pause
 * between them. The full run takes roughly ten minutes; the output is
 * committed so the app never needs to do this at runtime.
 *
 *   bun scripts/build-catalog.ts            # full catalog
 *   bun scripts/build-catalog.ts --limit 20 # quick check
 */

const ORIGIN = 'https://standardebooks.org'
const PER_PAGE = 48
const CONCURRENCY = 2
const PAUSE_MS = 250
const UA = 'skim-catalog-builder (+https://github.com/adagradschool/skim)'
const OUT = new URL('../public/catalog/standard-ebooks.json', import.meta.url)

const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity

export interface CatalogBook {
  /** Standard Ebooks identifier, e.g. "h-g-wells/the-time-machine" */
  id: string
  title: string
  author: string
  /** Translator(s), when the work was not written in English */
  translator?: string
  /** One-line teaser from Standard Ebooks */
  blurb: string
  /** Absolute URL of the compatible EPUB (with the direct-download parameter) */
  epub: string
  /** Absolute URL of the 1x cover jpg; the 2x variant is cover@2x.jpg beside it */
  cover: string
  words: number
  /** Estimated reading time at ~275 wpm */
  minutes: number
  /** Flesch reading ease, higher is easier */
  ease?: number
  tags: string[]
  /** 0-based position in Standard Ebooks' popularity sort */
  rank: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function get(path: string, attempt = 0): Promise<string> {
  const res = await fetch(`${ORIGIN}${path}`, { headers: { 'user-agent': UA, accept: 'application/xhtml+xml,text/html' } })
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 4) throw new Error(`HTTP ${res.status} for ${path}`)
    await sleep(2000 * (attempt + 1))
    return get(path, attempt + 1)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`)
  return res.text()
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim()

const strip = (html: string) => decode(html.replace(/<[^>]+>/g, ''))

interface ListingItem {
  id: string
  title: string
  author: string
  cover: string
}

function parseListing(html: string): ListingItem[] {
  const items: ListingItem[] = []
  const re = /<li typeof="schema:Book" about="\/ebooks\/([^"]+)">([\s\S]*?)<\/li>\s*(?=<li typeof="schema:Book"|<\/ol>)/g
  for (const m of html.matchAll(re)) {
    const id = m[1]!
    const body = m[2]!
    const title = strip(body.match(/<span property="schema:name">([\s\S]*?)<\/span>/)?.[1] ?? '')
    // Authors are one or more <p class="author"> blocks; join them.
    const authors = [...body.matchAll(/<p class="author"[^>]*>([\s\S]*?)<\/p>/g)].map((a) => strip(a[1]!)).filter(Boolean)
    const jpg2x = body.match(/src="(\/images\/covers\/[^"]+\/cover@2x\.jpg)"/)?.[1] ?? ''
    if (!title || !jpg2x) continue
    // Anonymous works carry no author block on the listing.
    items.push({ id, title, author: authors.join(', ') || 'Anonymous', cover: ORIGIN + jpg2x.replace('cover@2x.jpg', 'cover.jpg') })
  }
  return items
}

interface BookDetails {
  blurb: string
  translator?: string
  epub: string
  words: number
  ease?: number
  tags: string[]
}

function parseBook(html: string, id: string): BookDetails {
  const blurb = decode(html.match(/<meta property="schema:abstract" content="([^"]*)"/)?.[1] ?? '')
  const words = Number(html.match(/<meta property="schema:wordCount" content="(\d+)"/)?.[1] ?? 0)
  const easeText = html.match(/reading ease of ([\d.]+)/)?.[1]
  const ease = easeText ? Number(easeText) : undefined
  const tags = [...html.matchAll(/href="\/subjects\/([a-z-]+)"/g)].map((m) => m[1]!)
  const translators = [...html.matchAll(/<div property="schema:translator"[^>]*>\s*<meta property="schema:name" content="([^"]+)"/g)].map((m) => decode(m[1]!))
  const translator = translators.length ? translators.join(', ') : undefined
  // The plain .epub, not the kepub or _advanced variants.
  const hrefs = [...html.matchAll(/href="(\/ebooks\/[^"]+\/downloads\/[^"]+\.epub)"/g)].map((m) => m[1]!)
  const plain = hrefs.find((h) => !h.endsWith('.kepub.epub') && !h.endsWith('_advanced.epub'))
  if (!plain) throw new Error(`no epub link on ${id}`)
  return { blurb, translator, epub: `${ORIGIN}${plain}?source=download`, words, ease, tags: [...new Set(tags)] }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!, i)
      await sleep(PAUSE_MS)
    }
  })
  await Promise.all(workers)
  return out
}

async function main() {
  const listing: ListingItem[] = []
  for (let page = 1; ; page++) {
    const html = await get(`/ebooks?sort=popularity&view=grid&per-page=${PER_PAGE}&page=${page}`)
    const items = parseListing(html)
    listing.push(...items)
    process.stderr.write(`listing page ${page}: ${items.length} books (${listing.length} total)\n`)
    if (items.length < PER_PAGE || listing.length >= LIMIT) break
    await sleep(PAUSE_MS)
  }
  const wanted = listing.slice(0, Math.min(LIMIT, listing.length))

  let done = 0
  const books = await mapLimit(wanted, CONCURRENCY, async (item, rank): Promise<CatalogBook | null> => {
    try {
      const html = await get(`/ebooks/${item.id}`)
      const d = parseBook(html, item.id)
      done++
      if (done % 50 === 0) process.stderr.write(`books ${done}/${wanted.length}\n`)
      return {
        id: item.id,
        title: item.title,
        author: item.author,
        ...(d.translator ? { translator: d.translator } : {}),
        blurb: d.blurb,
        epub: d.epub,
        cover: item.cover,
        words: d.words,
        minutes: Math.max(1, Math.round(d.words / 275)),
        ease: d.ease,
        tags: d.tags,
        rank,
      }
    } catch (err) {
      process.stderr.write(`skip ${item.id}: ${err instanceof Error ? err.message : err}\n`)
      return null
    }
  })

  const clean = books.filter((b): b is CatalogBook => b !== null)
  const payload = {
    source: 'Standard Ebooks',
    sourceUrl: ORIGIN,
    license: 'CC0 1.0 (Standard Ebooks); texts are US public domain',
    generatedAt: new Date().toISOString(),
    count: clean.length,
    books: clean,
  }
  await Bun.write(OUT, JSON.stringify(payload))
  process.stderr.write(`wrote ${clean.length} books to ${OUT.pathname}\n`)
}

await main()
