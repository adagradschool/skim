import { getDB } from './db'
import type { Book, BookAsset, Slide, Progress, KVPair } from './types'

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
    const tx = db.transaction(['books', 'bookAssets', 'slides', 'progress'], 'readwrite')

    // Delete book and all related data
    await Promise.all([
      tx.objectStore('books').delete(id),
      this.deleteBookAssets(id, tx),
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

  // Slides
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

  async setProgress(bookId: string, slideIndex: number): Promise<void> {
    const db = await getDB()
    await db.put('progress', {
      bookId,
      slideIndex,
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
    const tx = db.transaction(['books', 'bookAssets', 'slides', 'progress', 'kv'], 'readwrite')

    await Promise.all([
      tx.objectStore('books').clear(),
      tx.objectStore('bookAssets').clear(),
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
