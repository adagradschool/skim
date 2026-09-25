import type { IStorage } from './IStorage'
import type { Book, BookAsset, Chapter, Slide, Progress, Bookmark, KVPair } from './types'
import type { SqlBridge, SqlStatement, SqlValue } from './sqlBridge'

export const SQLITE_SCHEMA_VERSION = 1

const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT, modifiedAt INTEGER NOT NULL, sizeBytes INTEGER NOT NULL,
    coverBlob TEXT, coverType TEXT, sourceId TEXT, kind TEXT, sourceUrl TEXT, siteName TEXT, excerpt TEXT)`,
  `CREATE INDEX IF NOT EXISTS books_modified ON books(modifiedAt)`,
  `CREATE TABLE IF NOT EXISTS bookAssets (bookId TEXT NOT NULL, spineIndex INTEGER NOT NULL, href TEXT NOT NULL, text TEXT NOT NULL,
    PRIMARY KEY (bookId, spineIndex))`,
  `CREATE TABLE IF NOT EXISTS chapters (bookId TEXT NOT NULL, chapterIndex INTEGER NOT NULL, title TEXT NOT NULL,
    firstSlideIndex INTEGER NOT NULL, slideCount INTEGER NOT NULL, PRIMARY KEY (bookId, chapterIndex))`,
  `CREATE TABLE IF NOT EXISTS slides (bookId TEXT NOT NULL, slideIndex INTEGER NOT NULL, chapter INTEGER NOT NULL,
    words INTEGER NOT NULL, text TEXT NOT NULL, content TEXT, PRIMARY KEY (bookId, slideIndex))`,
  `CREATE INDEX IF NOT EXISTS slides_chapter ON slides(bookId, chapter)`,
  `CREATE TABLE IF NOT EXISTS progress (bookId TEXT PRIMARY KEY, slideIndex INTEGER NOT NULL, updatedAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS bookmarks (id TEXT PRIMARY KEY, bookId TEXT NOT NULL, slideIndex INTEGER NOT NULL,
    annotation TEXT NOT NULL, snippet TEXT NOT NULL, timestamp INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS bookmarks_book ON bookmarks(bookId, timestamp)`,
  `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
]

const CHUNK = 200

/**
 * SQLite-backed storage. All logic lives here in TypeScript; the bridge only
 * moves SQL and rows. Rows with nested data (slide content, KV values) are
 * stored as JSON text; cover images as base64 with their MIME type.
 */
export class SqliteStorage implements IStorage {
  private ready: Promise<void> | null = null

  constructor(private readonly db: SqlBridge) {}

  private async init(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        await this.db.batch(SCHEMA.map((sql) => ({ sql })))
        await this.db.run(`INSERT OR IGNORE INTO meta (key, value) VALUES ('schemaVersion', ?)`, [String(SQLITE_SCHEMA_VERSION)])
      })()
    }
    return this.ready
  }

  // ---- Books

  async saveBook(book: Book): Promise<void> {
    await this.init()
    await this.db.run(...(await bookInsert(book)))
  }

  async getBook(id: string): Promise<Book | undefined> {
    await this.init()
    const rows = await this.db.query<BookRow>(`SELECT * FROM books WHERE id = ?`, [id])
    return rows[0] ? rowToBook(rows[0]) : undefined
  }

  async getAllBooks(): Promise<Book[]> {
    await this.init()
    const rows = await this.db.query<BookRow>(`SELECT * FROM books ORDER BY modifiedAt DESC`)
    return rows.map(rowToBook)
  }

  async deleteBook(id: string): Promise<void> {
    await this.init()
    await this.db.batch([
      { sql: `DELETE FROM books WHERE id = ?`, params: [id] },
      { sql: `DELETE FROM bookAssets WHERE bookId = ?`, params: [id] },
      { sql: `DELETE FROM chapters WHERE bookId = ?`, params: [id] },
      { sql: `DELETE FROM slides WHERE bookId = ?`, params: [id] },
      { sql: `DELETE FROM progress WHERE bookId = ?`, params: [id] },
      { sql: `DELETE FROM bookmarks WHERE bookId = ?`, params: [id] },
    ])
  }

  // ---- Book assets

  async saveBookAsset(asset: BookAsset): Promise<void> {
    await this.saveBookAssets([asset])
  }

  async saveBookAssets(assets: BookAsset[]): Promise<void> {
    await this.init()
    await this.batched(
      assets.map((a) => ({
        sql: `INSERT OR REPLACE INTO bookAssets (bookId, spineIndex, href, text) VALUES (?, ?, ?, ?)`,
        params: [a.bookId, a.spineIndex, a.href, a.text],
      }))
    )
  }

  async getBookAsset(bookId: string, spineIndex: number): Promise<BookAsset | undefined> {
    await this.init()
    const rows = await this.db.query<BookAsset>(`SELECT bookId, spineIndex, href, text FROM bookAssets WHERE bookId = ? AND spineIndex = ?`, [bookId, spineIndex])
    return rows[0]
  }

  async getBookAssets(bookId: string): Promise<BookAsset[]> {
    await this.init()
    return this.db.query<BookAsset>(`SELECT bookId, spineIndex, href, text FROM bookAssets WHERE bookId = ? ORDER BY spineIndex`, [bookId])
  }

  // ---- Chapters

  async saveChapter(chapter: Chapter): Promise<void> {
    await this.saveChapters([chapter])
  }

  async saveChapters(chapters: Chapter[]): Promise<void> {
    await this.init()
    await this.batched(
      chapters.map((c) => ({
        sql: `INSERT OR REPLACE INTO chapters (bookId, chapterIndex, title, firstSlideIndex, slideCount) VALUES (?, ?, ?, ?, ?)`,
        params: [c.bookId, c.chapterIndex, c.title, c.firstSlideIndex, c.slideCount],
      }))
    )
  }

  async getChapter(bookId: string, chapterIndex: number): Promise<Chapter | undefined> {
    await this.init()
    const rows = await this.db.query<Chapter>(`SELECT * FROM chapters WHERE bookId = ? AND chapterIndex = ?`, [bookId, chapterIndex])
    return rows[0]
  }

  async getAllChapters(bookId: string): Promise<Chapter[]> {
    await this.init()
    return this.db.query<Chapter>(`SELECT * FROM chapters WHERE bookId = ? ORDER BY chapterIndex`, [bookId])
  }

  async countChapters(bookId: string): Promise<number> {
    await this.init()
    const rows = await this.db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM chapters WHERE bookId = ?`, [bookId])
    return Number(rows[0]?.n ?? 0)
  }

  // ---- Slides

  async saveSlide(slide: Slide): Promise<void> {
    await this.saveSlides([slide])
  }

  async saveSlides(slides: Slide[]): Promise<void> {
    await this.init()
    await this.batched(slides.map(slideInsert))
  }

  async saveImportedBundle({
    book,
    slides,
    initialSlideIndex = 0,
    timestamp = Date.now(),
    signal,
  }: {
    book: Book
    slides: Slide[]
    initialSlideIndex?: number
    timestamp?: number
    signal?: AbortSignal
  }): Promise<void> {
    await this.init()
    if (signal?.aborted) throw new DOMException('Import cancelled', 'AbortError')
    const statements: SqlStatement[] = [statementOf(await bookInsert(book)), ...slides.map(slideInsert)]
    statements.push({
      sql: `INSERT OR REPLACE INTO progress (bookId, slideIndex, updatedAt) VALUES (?, ?, ?)`,
      params: [book.id, initialSlideIndex, timestamp],
    })
    await this.db.batch(statements)
  }

  async getSlide(bookId: string, slideIndex: number): Promise<Slide | undefined> {
    await this.init()
    const rows = await this.db.query<SlideRow>(`SELECT * FROM slides WHERE bookId = ? AND slideIndex = ?`, [bookId, slideIndex])
    return rows[0] ? rowToSlide(rows[0]) : undefined
  }

  async getSlidesByChapter(bookId: string, chapter: number): Promise<Slide[]> {
    await this.init()
    const rows = await this.db.query<SlideRow>(`SELECT * FROM slides WHERE bookId = ? AND chapter = ? ORDER BY slideIndex`, [bookId, chapter])
    return rows.map(rowToSlide)
  }

  async countSlides(bookId: string): Promise<number> {
    await this.init()
    const rows = await this.db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM slides WHERE bookId = ?`, [bookId])
    return Number(rows[0]?.n ?? 0)
  }

  async getAllSlides(bookId: string): Promise<Slide[]> {
    await this.init()
    const rows = await this.db.query<SlideRow>(`SELECT * FROM slides WHERE bookId = ? ORDER BY slideIndex`, [bookId])
    return rows.map(rowToSlide)
  }

  // ---- Progress

  async getProgress(bookId: string): Promise<Progress | undefined> {
    await this.init()
    const rows = await this.db.query<Progress>(`SELECT * FROM progress WHERE bookId = ?`, [bookId])
    return rows[0]
  }

  async setProgress(bookId: string, slideIndex: number): Promise<void> {
    await this.init()
    await this.db.run(`INSERT OR REPLACE INTO progress (bookId, slideIndex, updatedAt) VALUES (?, ?, ?)`, [bookId, slideIndex, Date.now()])
  }

  async deleteProgress(bookId: string): Promise<void> {
    await this.init()
    await this.db.run(`DELETE FROM progress WHERE bookId = ?`, [bookId])
  }

  // ---- Bookmarks

  async createBookmark(bookmark: Omit<Bookmark, 'id' | 'timestamp'>): Promise<string> {
    await this.init()
    const timestamp = Date.now()
    const id = `${bookmark.bookId}-${bookmark.slideIndex}-${timestamp}`
    await this.db.run(`INSERT OR REPLACE INTO bookmarks (id, bookId, slideIndex, annotation, snippet, timestamp) VALUES (?, ?, ?, ?, ?, ?)`, [
      id,
      bookmark.bookId,
      bookmark.slideIndex,
      bookmark.annotation,
      bookmark.snippet,
      timestamp,
    ])
    return id
  }

  async getBookmark(id: string): Promise<Bookmark | undefined> {
    await this.init()
    const rows = await this.db.query<Bookmark>(`SELECT * FROM bookmarks WHERE id = ?`, [id])
    return rows[0]
  }

  async getAllBookmarks(bookId: string): Promise<Bookmark[]> {
    await this.init()
    // Most recent first, matching the IndexedDB implementation.
    return this.db.query<Bookmark>(`SELECT * FROM bookmarks WHERE bookId = ? ORDER BY timestamp DESC`, [bookId])
  }

  async deleteBookmark(id: string): Promise<void> {
    await this.init()
    await this.db.run(`DELETE FROM bookmarks WHERE id = ?`, [id])
  }

  // ---- KV

  async getKV(key: string): Promise<any> {
    await this.init()
    const rows = await this.db.query<{ value: string }>(`SELECT value FROM kv WHERE key = ?`, [key])
    return rows[0] ? JSON.parse(rows[0].value) : undefined
  }

  async setKV(key: string, value: any): Promise<void> {
    await this.init()
    await this.db.run(`INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)`, [key, JSON.stringify(value ?? null)])
  }

  async deleteKV(key: string): Promise<void> {
    await this.init()
    await this.db.run(`DELETE FROM kv WHERE key = ?`, [key])
  }

  async getAllKV(): Promise<KVPair[]> {
    await this.init()
    const rows = await this.db.query<{ key: string; value: string }>(`SELECT key, value FROM kv`)
    return rows.map((r) => ({ key: r.key, value: JSON.parse(r.value) }))
  }

  // ---- Utility

  async clear(): Promise<void> {
    await this.init()
    await this.db.batch(['books', 'bookAssets', 'chapters', 'slides', 'progress', 'bookmarks', 'kv'].map((t) => ({ sql: `DELETE FROM ${t}` })))
  }

  async getStorageEstimate(): Promise<StorageEstimate | undefined> {
    await this.init()
    const rows = await this.db.query<{ n: number }>(`SELECT page_count * page_size AS n FROM pragma_page_count(), pragma_page_size()`)
    const usage = Number(rows[0]?.n ?? 0)
    return { usage, quota: undefined } as StorageEstimate
  }

  /** Large inserts go in transaction-sized chunks so a single bridge call stays small. */
  private async batched(statements: SqlStatement[]): Promise<void> {
    for (let i = 0; i < statements.length; i += CHUNK) {
      await this.db.batch(statements.slice(i, i + CHUNK))
    }
  }
}

// ---- Row mapping

interface BookRow {
  id: string
  title: string
  author: string | null
  modifiedAt: number
  sizeBytes: number
  coverBlob: string | null
  coverType: string | null
  sourceId: string | null
  kind: string | null
  sourceUrl: string | null
  siteName: string | null
  excerpt: string | null
}

interface SlideRow {
  bookId: string
  slideIndex: number
  chapter: number
  words: number
  text: string
  content: string | null
}

function statementOf([sql, params]: [string, SqlValue[]]): SqlStatement {
  return { sql, params }
}

async function bookInsert(book: Book): Promise<[string, SqlValue[]]> {
  const cover = book.coverBlob ? await blobToBase64(book.coverBlob) : null
  return [
    `INSERT OR REPLACE INTO books (id, title, author, modifiedAt, sizeBytes, coverBlob, coverType, sourceId, kind, sourceUrl, siteName, excerpt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      book.id,
      book.title || 'Untitled',
      book.author ?? null,
      book.modifiedAt,
      book.sizeBytes,
      cover,
      book.coverBlob?.type ?? null,
      book.sourceId ?? null,
      book.kind ?? null,
      book.sourceUrl ?? null,
      book.siteName ?? null,
      book.excerpt ?? null,
    ],
  ]
}

function rowToBook(r: BookRow): Book {
  const book: Book = { id: r.id, title: r.title, modifiedAt: Number(r.modifiedAt), sizeBytes: Number(r.sizeBytes) }
  if (r.author) book.author = r.author
  if (r.coverBlob) book.coverBlob = base64ToBlob(r.coverBlob, r.coverType || 'image/jpeg')
  if (r.sourceId) book.sourceId = r.sourceId
  if (r.kind === 'book' || r.kind === 'article') book.kind = r.kind
  if (r.sourceUrl) book.sourceUrl = r.sourceUrl
  if (r.siteName) book.siteName = r.siteName
  if (r.excerpt) book.excerpt = r.excerpt
  return book
}

function slideInsert(s: Slide): SqlStatement {
  return {
    sql: `INSERT OR REPLACE INTO slides (bookId, slideIndex, chapter, words, text, content) VALUES (?, ?, ?, ?, ?, ?)`,
    params: [s.bookId, s.slideIndex, s.chapter, s.words, s.text, s.content ? JSON.stringify(s.content) : null],
  }
}

function rowToSlide(r: SlideRow): Slide {
  const slide: Slide = { bookId: r.bookId, slideIndex: Number(r.slideIndex), chapter: Number(r.chapter), words: Number(r.words), text: r.text }
  if (r.content) slide.content = JSON.parse(r.content)
  return slide
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < buf.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)))
  }
  return btoa(binary)
}

export function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}
