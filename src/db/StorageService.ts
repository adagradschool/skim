import { getDB } from './db'
import type { Book, BookAsset, Chapter, Slide, Progress, KVPair } from './types'

/**
 * Storage service for managing all IndexedDB operations
 */
export class StorageService {
  // Books
  async saveBook(book: Book): Promise<void> {
    const db = await getDB()
    await db.put('books', book)
  }

  async getBook(id: string): Promise<Book | undefined> {
    const db = await getDB()
    return db.get('books', id)
  }

  async getAllBooks(): Promise<Book[]> {
    const db = await getDB()
    const books = await db.getAllFromIndex('books', 'by-modified')
    // Return most recent first
    return books.reverse()
  }

  async deleteBook(id: string): Promise<void> {
    const db = await getDB()
    const tx = db.transaction(['books', 'bookAssets', 'chapters', 'slides', 'progress'], 'readwrite')

    // Delete book and all related data
    await Promise.all([
      tx.objectStore('books').delete(id),
      this.deleteBookAssets(id, tx),
      this.deleteChapters(id, tx),
      this.deleteSlides(id, tx),
      tx.objectStore('progress').delete(id),
    ])

    await tx.done
  }

  // BookAssets
  async saveBookAsset(asset: BookAsset): Promise<void> {
    const db = await getDB()
    await db.put('bookAssets', asset)
  }

  async saveBookAssets(assets: BookAsset[]): Promise<void> {
    const db = await getDB()
    const tx = db.transaction('bookAssets', 'readwrite')
    await Promise.all(assets.map((asset) => tx.store.put(asset)))
    await tx.done
  }

  async getBookAsset(bookId: string, spineIndex: number): Promise<BookAsset | undefined> {
    const db = await getDB()
    return db.get('bookAssets', [bookId, spineIndex])
  }

  async getBookAssets(bookId: string): Promise<BookAsset[]> {
    const db = await getDB()
    return db.getAllFromIndex('bookAssets', 'by-book', bookId)
  }

  private async deleteBookAssets(bookId: string, tx?: any): Promise<void> {
    const db = tx ? undefined : await getDB()
    const store = tx ? tx.objectStore('bookAssets') : db!.transaction('bookAssets', 'readwrite').objectStore('bookAssets')

    const assets = await store.index('by-book').getAllKeys(bookId)
    await Promise.all(assets.map((key: any) => store.delete(key)))
  }

  // Chapters
  async saveChapter(chapter: Chapter): Promise<void> {
    const db = await getDB()
    await db.put('chapters', chapter)
  }

  async saveChapters(chapters: Chapter[]): Promise<void> {
    const db = await getDB()
    const tx = db.transaction('chapters', 'readwrite')

    // Batch insert in chunks to avoid blocking
    const CHUNK_SIZE = 100
    for (let i = 0; i < chapters.length; i += CHUNK_SIZE) {
      const chunk = chapters.slice(i, i + CHUNK_SIZE)
      await Promise.all(chunk.map((chapter) => tx.store.put(chapter)))
    }

    await tx.done
  }

  async getChapter(bookId: string, chapterIndex: number): Promise<Chapter | undefined> {
    const db = await getDB()
    return db.get('chapters', [bookId, chapterIndex])
  }

  async getAllChapters(bookId: string): Promise<Chapter[]> {
    const db = await getDB()
    return db.getAllFromIndex('chapters', 'by-book', bookId)
  }

  async countChapters(bookId: string): Promise<number> {
    const db = await getDB()
    return db.countFromIndex('chapters', 'by-book', bookId)
  }

  private async deleteChapters(bookId: string, tx?: any): Promise<void> {
    const db = tx ? undefined : await getDB()
    const store = tx ? tx.objectStore('chapters') : db!.transaction('chapters', 'readwrite').objectStore('chapters')

    const chapters = await store.index('by-book').getAllKeys(bookId)
    await Promise.all(chapters.map((key: any) => store.delete(key)))
  }

  // Slides (deprecated, kept for backward compatibility)
  async saveSlide(slide: Slide): Promise<void> {
    const db = await getDB()
    await db.put('slides', slide)
  }

  async saveSlides(slides: Slide[]): Promise<void> {
    const db = await getDB()
    const tx = db.transaction('slides', 'readwrite')

    // Batch insert in chunks to avoid blocking
    const CHUNK_SIZE = 100
    for (let i = 0; i < slides.length; i += CHUNK_SIZE) {
      const chunk = slides.slice(i, i + CHUNK_SIZE)
      await Promise.all(chunk.map((slide) => tx.store.put(slide)))
    }

    await tx.done
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
    const db = await getDB()
    const tx = db.transaction(['books', 'slides', 'progress'], 'readwrite')
    const booksStore = tx.objectStore('books')
    const slidesStore = tx.objectStore('slides')
    const progressStore = tx.objectStore('progress')

    await booksStore.put(book)

    const CHUNK_SIZE = 100
    for (let i = 0; i < slides.length; i += CHUNK_SIZE) {
      const chunk = slides.slice(i, i + CHUNK_SIZE)
      // Write sequentially to allow cancellation checks between chunks
      for (const slide of chunk) {
        if (signal?.aborted) {
          tx.abort()
          throw new DOMException('Import cancelled', 'AbortError')
        }
        await slidesStore.put(slide)
      }
    }

    await progressStore.put({
      bookId: book.id,
      slideIndex: initialSlideIndex,
      updatedAt: timestamp,
    })

    await tx.done
  }

  async getSlide(bookId: string, slideIndex: number): Promise<Slide | undefined> {
    const db = await getDB()
    return db.get('slides', [bookId, slideIndex])
  }

  async getSlidesByChapter(bookId: string, chapter: number): Promise<Slide[]> {
    const db = await getDB()
    return db.getAllFromIndex('slides', 'by-chapter', [bookId, chapter])
  }

  async countSlides(bookId: string): Promise<number> {
    const db = await getDB()
    return db.countFromIndex('slides', 'by-book', bookId)
  }

  async getAllSlides(bookId: string): Promise<Slide[]> {
    const db = await getDB()
    return db.getAllFromIndex('slides', 'by-book', bookId)
  }

  private async deleteSlides(bookId: string, tx?: any): Promise<void> {
    const db = tx ? undefined : await getDB()
    const store = tx ? tx.objectStore('slides') : db!.transaction('slides', 'readwrite').objectStore('slides')

    const slides = await store.index('by-book').getAllKeys(bookId)
    await Promise.all(slides.map((key: any) => store.delete(key)))
  }

  // Progress
  async getProgress(bookId: string): Promise<Progress | undefined> {
    const db = await getDB()
    return db.get('progress', bookId)
  }

  async setProgress(bookId: string, chapterIndex: number, wordOffset: number): Promise<void> {
    const db = await getDB()
    await db.put('progress', {
      bookId,
      chapterIndex,
      wordOffset,
      updatedAt: Date.now(),
    })
  }

  async deleteProgress(bookId: string): Promise<void> {
    const db = await getDB()
    await db.delete('progress', bookId)
  }

  // KV Store
  async getKV(key: string): Promise<any> {
    const db = await getDB()
    const result = await db.get('kv', key)
    return result?.value
  }

  async setKV(key: string, value: any): Promise<void> {
    const db = await getDB()
    await db.put('kv', { key, value })
  }

  async deleteKV(key: string): Promise<void> {
    const db = await getDB()
    await db.delete('kv', key)
  }

  async getAllKV(): Promise<KVPair[]> {
    const db = await getDB()
    return db.getAll('kv')
  }

  // Utility methods
  async clear(): Promise<void> {
    const db = await getDB()
    const tx = db.transaction(['books', 'bookAssets', 'chapters', 'slides', 'progress', 'kv'], 'readwrite')

    await Promise.all([
      tx.objectStore('books').clear(),
      tx.objectStore('bookAssets').clear(),
      tx.objectStore('chapters').clear(),
      tx.objectStore('slides').clear(),
      tx.objectStore('progress').clear(),
      tx.objectStore('kv').clear(),
    ])

    await tx.done
  }

  async getStorageEstimate(): Promise<StorageEstimate | undefined> {
    if (navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate()
    }
    return undefined
  }
}

// Singleton instance
export const storageService = new StorageService()
