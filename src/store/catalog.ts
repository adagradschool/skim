import type { ImportOptions } from '@/importer/ImportService'
import { storageService } from '@/db/StorageService'

/**
 * The Store's catalog: a static manifest of Standard Ebooks titles built by
 * scripts/build-catalog.ts. Files are fetched straight from standardebooks.org
 * at import time (their downloads send CORS headers), so the app hosts only
 * metadata.
 */

export interface CatalogBook {
  /** Standard Ebooks identifier, e.g. "h-g-wells/the-time-machine" */
  id: string
  title: string
  author: string
  /** Translator(s), for works not originally in English. */
  translator?: string
  blurb: string
  epub: string
  /** 1x cover jpg; see cover2x() */
  cover: string
  words: number
  minutes: number
  ease?: number
  tags: string[]
  rank: number
}

export interface Catalog {
  source: string
  sourceUrl: string
  license: string
  generatedAt: string
  count: number
  books: CatalogBook[]
}

export const CATALOG_URL = '/catalog/standard-ebooks.json'
export const CATALOG_SOURCE_PREFIX = 'standardebooks:'

/** Subjects shown as filter chips, in display order. Anything else is reachable through search. */
export const CATALOG_TAGS: Array<{ id: string; label: string }> = [
  { id: 'fiction', label: 'Fiction' },
  { id: 'nonfiction', label: 'Non-fiction' },
  { id: 'shorts', label: 'Short stories' },
  { id: 'mystery', label: 'Mystery' },
  { id: 'science-fiction', label: 'Sci-fi' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'horror', label: 'Horror' },
  { id: 'philosophy', label: 'Philosophy' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'drama', label: 'Drama' },
  { id: 'poetry', label: 'Poetry' },
  { id: 'childrens', label: 'Children’s' },
  { id: 'memoir', label: 'Memoir' },
  { id: 'biography', label: 'Biography' },
  { id: 'travel', label: 'Travel' },
  { id: 'spirituality', label: 'Spirituality' },
  { id: 'satire', label: 'Satire' },
]

/**
 * Famous, mostly short titles shown first so a newcomer recognises something
 * within a second. Everything else follows in Standard Ebooks' popularity order.
 */
export const FIRST_PICK_IDS: string[] = [
  'lewis-carroll/alices-adventures-in-wonderland/john-tenniel',
  'robert-louis-stevenson/the-strange-case-of-dr-jekyll-and-mr-hyde',
  'h-g-wells/the-time-machine',
  'arthur-conan-doyle/a-study-in-scarlet',
  'charles-dickens/a-christmas-carol',
  'sun-tzu/the-art-of-war/lionel-giles',
  'marcus-aurelius/meditations/george-long',
  'f-scott-fitzgerald/the-great-gatsby',
  'jack-london/the-call-of-the-wild',
  'jane-austen/pride-and-prejudice',
  'mary-shelley/frankenstein',
  'bram-stoker/dracula',
  'oscar-wilde/the-picture-of-dorian-gray',
  'arthur-conan-doyle/the-adventures-of-sherlock-holmes',
  'homer/the-odyssey/william-cullen-bryant',
  'niccolo-machiavelli/the-prince/w-k-marriott',
  'emily-bronte/wuthering-heights',
  'herman-melville/moby-dick',
]

export function cover2x(book: CatalogBook): string {
  return book.cover.replace(/cover\.jpg$/, 'cover@2x.jpg')
}

/** First picks in their curated order, then the rest by rank. Ids that are missing from the catalog are skipped. */
export function orderFeatured(books: CatalogBook[], pickIds: string[] = FIRST_PICK_IDS): CatalogBook[] {
  const byId = new Map(books.map((b) => [b.id, b]))
  const picks = pickIds.map((id) => byId.get(id)).filter((b): b is CatalogBook => !!b)
  const picked = new Set(picks.map((b) => b.id))
  const rest = [...books].filter((b) => !picked.has(b.id)).sort((a, z) => a.rank - z.rank)
  return [...picks, ...rest]
}

let cached: Promise<Catalog> | null = null

export function loadCatalog(): Promise<Catalog> {
  if (!cached) {
    cached = fetch(CATALOG_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Catalog unavailable (HTTP ${res.status})`)
        return res.json() as Promise<Catalog>
      })
      .catch((err) => {
        cached = null
        throw err
      })
  }
  return cached
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Title/author search plus optional subject filter. Results keep popularity order. */
export function filterCatalog(books: CatalogBook[], query: string, tag: string | null): CatalogBook[] {
  const terms = fold(query).split(/\s+/).filter(Boolean)
  return books.filter((b) => {
    if (tag && !b.tags.includes(tag)) return false
    if (terms.length === 0) return true
    const hay = fold(`${b.title} ${b.author}`)
    return terms.every((t) => hay.includes(t))
  })
}

export function sourceIdFor(book: CatalogBook): string {
  return `${CATALOG_SOURCE_PREFIX}${book.id}`
}

/** Source ids of catalog books already in the library. */
export async function libraryCatalogIds(): Promise<Set<string>> {
  const books = await storageService.getAllBooks()
  return new Set(books.map((b) => b.sourceId).filter((s): s is string => !!s && s.startsWith(CATALOG_SOURCE_PREFIX)))
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

export interface CatalogImportOptions extends Omit<ImportOptions, 'sourceId'> {
  /** Called while the EPUB is downloading; bytes are unknown when the host omits Content-Length. */
  onDownload?: (loadedBytes: number, totalBytes: number | null) => void
}

/** Download a catalog book from Standard Ebooks and import it. Resolves to the new book id. */
export async function importCatalogBook(book: CatalogBook, options: CatalogImportOptions = {}): Promise<string> {
  const { onDownload, signal, onProgress } = options
  const res = await fetch(book.epub, { signal })
  if (res.status === 429) {
    throw new Error('Standard Ebooks is limiting downloads from your connection right now. Try again in a few minutes.')
  }
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`)

  let blob: Blob
  const total = Number(res.headers.get('content-length')) || null
  if (onDownload && res.body) {
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.byteLength
      onDownload(loaded, total)
    }
    blob = new Blob(chunks as BlobPart[], { type: 'application/epub+zip' })
  } else {
    blob = await res.blob()
  }

  const fileName = `${book.id.split('/').pop() ?? 'book'}.epub`
  const file = new File([blob], fileName, { type: 'application/epub+zip' })
  // Lazy: the importer drags in the PDF parser, which is heavy and browser-only.
  const { importService } = await import('@/importer/ImportService')
  return importService.import(file, { signal, onProgress, sourceId: sourceIdFor(book) })
}
