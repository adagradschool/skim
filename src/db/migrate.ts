import type { IStorage } from './IStorage'

export interface MigrationReport {
  migrated: boolean
  books: number
  slides: number
  reason?: string
}

const MARKER = 'migratedFromIndexedDb'

/**
 * One-time copy from the WebView's IndexedDB (evictable) into SQLite (not).
 *
 * Runs on the native app only. It copies when SQLite holds no books and
 * IndexedDB does, and records a marker in SQLite so it never runs twice.
 * IndexedDB is left untouched: if anything goes wrong the old data is still
 * there, and the WebView may evict it on its own schedule anyway.
 */
export async function migrateIndexedDbToSqlite(
  source: IStorage,
  target: IStorage,
  onProgress?: (done: number, total: number, title: string) => void
): Promise<MigrationReport> {
  if (await target.getKV(MARKER)) return { migrated: false, books: 0, slides: 0, reason: 'already migrated' }

  let sourceBooks
  try {
    sourceBooks = await source.getAllBooks()
  } catch (err) {
    return { migrated: false, books: 0, slides: 0, reason: `source unreadable: ${err instanceof Error ? err.message : String(err)}` }
  }

  // Resumable: copy only books the target doesn't have yet, so a crash or
  // one bad record never leaves the library half-moved and then skipped.
  let copied = 0
  let slideTotal = 0
  const failed: string[] = []
  for (let i = 0; i < sourceBooks.length; i++) {
    const book = sourceBooks[i]!
    onProgress?.(i, sourceBooks.length, book.title || 'Untitled')
    try {
      if (await target.getBook(book.id)) continue
      const [slides, chapters, progress, bookmarks, assets] = await Promise.all([
        source.getAllSlides(book.id),
        source.getAllChapters(book.id),
        source.getProgress(book.id),
        source.getAllBookmarks(book.id),
        source.getBookAssets(book.id),
      ])
      await target.saveImportedBundle({
        book: { ...book, title: book.title || 'Untitled' },
        slides,
        initialSlideIndex: progress?.slideIndex ?? 0,
        timestamp: progress?.updatedAt ?? book.modifiedAt,
      })
      if (chapters.length) await target.saveChapters(chapters)
      if (assets.length) await target.saveBookAssets(assets)
      for (const bm of [...bookmarks].reverse()) {
        await target.createBookmark({ bookId: bm.bookId, slideIndex: bm.slideIndex, annotation: bm.annotation, snippet: bm.snippet })
      }
      copied++
      slideTotal += slides.length
    } catch (err) {
      console.error('Migration: skipping book', book.id, err)
      failed.push(book.id)
    }
  }

  // Settings, score, profile: copy keys the target doesn't already have.
  for (const kv of await source.getAllKV()) {
    if ((await target.getKV(kv.key)) === undefined) await target.setKV(kv.key, kv.value)
  }

  if (failed.length === 0) {
    await target.setKV(MARKER, { at: Date.now(), books: sourceBooks.length, slides: slideTotal })
  }
  onProgress?.(sourceBooks.length, sourceBooks.length, '')
  return {
    migrated: copied > 0,
    books: copied,
    slides: slideTotal,
    reason: failed.length ? `${failed.length} book(s) could not be copied; will retry next launch` : sourceBooks.length === 0 ? 'source empty' : undefined,
  }
}
