import { beforeEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { SqliteStorage } from './SqliteStorage'
import type { SqlBridge, SqlStatement, SqlValue } from './sqlBridge'
import type { Book, Slide } from './types'

/** Test bridge over bun's SQLite: same contract the Android plugin implements. */
function bunBridge(): SqlBridge {
  const db = new Database(':memory:')
  const bind = (p: SqlValue[] = []) => p.map((v) => (v === undefined ? null : v)) as (string | number | null)[]
  return {
    async run(sql, params) {
      db.run(sql, bind(params))
    },
    async batch(statements: SqlStatement[]) {
      const tx = db.transaction((stmts: SqlStatement[]) => {
        for (const s of stmts) db.run(s.sql, bind(s.params))
      })
      tx(statements)
    },
    async query<T>(sql: string, params?: SqlValue[]) {
      return db.query(sql).all(...bind(params)) as T[]
    },
  }
}

const book = (id: string, extra: Partial<Book> = {}): Book => ({ id, title: `Book ${id}`, modifiedAt: 1000 + Number(id.replace(/\D/g, '')) , sizeBytes: 10, ...extra })
const slide = (bookId: string, i: number, chapter = 0): Slide => ({
  bookId,
  slideIndex: i,
  chapter,
  words: 3,
  text: `slide ${i}`,
  content: { text: `slide ${i}`, blocks: [{ type: 'paragraph', runs: [{ text: `slide ${i}`, i: i % 2 === 0 }] }] },
})

describe('SqliteStorage', () => {
  let s: SqliteStorage
  beforeEach(() => {
    s = new SqliteStorage(bunBridge())
  })

  test('books round-trip including optional fields and cover blob', async () => {
    const cover = new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/png' })
    await s.saveBook(book('b1', { author: 'A', kind: 'article', sourceUrl: 'https://x/y', siteName: 'X', excerpt: 'e', sourceId: 'url:https://x/y', coverBlob: cover }))
    await s.saveBook(book('b2'))
    const got = await s.getBook('b1')
    expect(got).toMatchObject({ id: 'b1', author: 'A', kind: 'article', sourceUrl: 'https://x/y', siteName: 'X', excerpt: 'e' })
    expect(got!.coverBlob!.type).toBe('image/png')
    expect(new Uint8Array(await got!.coverBlob!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 250]))
    const plain = await s.getBook('b2')
    expect(plain!.author).toBeUndefined()
    expect(plain!.kind).toBeUndefined()
    expect('coverBlob' in plain!).toBe(false)
    // newest first
    expect((await s.getAllBooks()).map((b) => b.id)).toEqual(['b2', 'b1'])
  })

  test('import bundle writes book, slides and progress atomically; slides keep structure', async () => {
    const slides = Array.from({ length: 450 }, (_, i) => slide('b1', i, Math.floor(i / 100)))
    await s.saveImportedBundle({ book: book('b1'), slides, initialSlideIndex: 0 })
    expect(await s.countSlides('b1')).toBe(450)
    const got = await s.getSlide('b1', 7)
    expect(got!.content!.blocks[0]!.runs[0]!.i).toBeFalsy()
    expect((await s.getSlide('b1', 8))!.content!.blocks[0]!.runs[0]!.i).toBe(true)
    expect((await s.getSlidesByChapter('b1', 2)).map((x) => x.slideIndex)).toEqual(Array.from({ length: 100 }, (_, i) => 200 + i))
    expect((await s.getAllSlides('b1')).length).toBe(450)
    expect((await s.getProgress('b1'))!.slideIndex).toBe(0)
  })

  test('chapters, progress, bookmarks (newest first) and per-book delete', async () => {
    await s.saveBook(book('b1'))
    await s.saveChapters([
      { bookId: 'b1', chapterIndex: 0, title: 'One', firstSlideIndex: 0, slideCount: 2 },
      { bookId: 'b1', chapterIndex: 1, title: 'Two', firstSlideIndex: 2, slideCount: 1 },
    ])
    await s.saveSlides([slide('b1', 0), slide('b1', 1), slide('b1', 2, 1)])
    await s.setProgress('b1', 2)
    const id1 = await s.createBookmark({ bookId: 'b1', slideIndex: 0, annotation: 'a', snippet: 's' })
    await new Promise((r) => setTimeout(r, 2))
    const id2 = await s.createBookmark({ bookId: 'b1', slideIndex: 1, annotation: '', snippet: 's' })
    expect((await s.getAllChapters('b1')).map((c) => c.title)).toEqual(['One', 'Two'])
    expect(await s.countChapters('b1')).toBe(2)
    expect((await s.getProgress('b1'))!.slideIndex).toBe(2)
    expect((await s.getAllBookmarks('b1')).map((b) => b.id)).toEqual([id2, id1])
    await s.deleteBookmark(id1)
    expect((await s.getAllBookmarks('b1')).length).toBe(1)

    await s.saveBook(book('b2'))
    await s.saveSlides([slide('b2', 0)])
    await s.deleteBook('b1')
    expect(await s.getBook('b1')).toBeUndefined()
    expect(await s.countSlides('b1')).toBe(0)
    expect(await s.countChapters('b1')).toBe(0)
    expect(await s.getProgress('b1')).toBeUndefined()
    expect((await s.getAllBookmarks('b1')).length).toBe(0)
    expect(await s.countSlides('b2')).toBe(1)
  })

  test('kv stores arbitrary JSON and clear() empties everything', async () => {
    await s.setKV('flag', true)
    await s.setKV('obj', { a: [1, 2, { b: 'c' }] })
    await s.setKV('nothing', null)
    expect(await s.getKV('flag')).toBe(true)
    expect(await s.getKV('obj')).toEqual({ a: [1, 2, { b: 'c' }] })
    expect(await s.getKV('nothing')).toBeNull()
    expect(await s.getKV('missing')).toBeUndefined()
    expect((await s.getAllKV()).map((k) => k.key).sort()).toEqual(['flag', 'nothing', 'obj'])
    await s.deleteKV('flag')
    expect(await s.getKV('flag')).toBeUndefined()

    await s.saveBook(book('b1'))
    await s.clear()
    expect((await s.getAllBooks()).length).toBe(0)
    expect((await s.getAllKV()).length).toBe(0)
  })

  test('storage estimate reports bytes used', async () => {
    await s.saveSlides(Array.from({ length: 50 }, (_, i) => slide('b1', i)))
    const est = await s.getStorageEstimate()
    expect(est!.usage).toBeGreaterThan(0)
  })
})
