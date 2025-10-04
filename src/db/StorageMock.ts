import type { Book, BookAsset, Slide, Progress, KVPair } from './types'

/**
 * Mock storage service for unit tests
 * Implements the same interface as StorageService but uses in-memory storage
 */
export class StorageMock {
  private books: Map<string, Book> = new Map()
  private bookAssets: Map<string, BookAsset> = new Map()
  private slides: Map<string, Slide> = new Map()
  private progress: Map<string, Progress> = new Map()
  private kv: Map<string, any> = new Map()

  // Books
  async saveBook(book: Book): Promise<void> {
    this.books.set(book.id, { ...book })
  }

  async getBook(id: string): Promise<Book | undefined> {
    const book = this.books.get(id)
    return book ? { ...book } : undefined
  }

  async getAllBooks(): Promise<Book[]> {
    return Array.from(this.books.values())
      .sort((a, b) => b.modifiedAt - a.modifiedAt)
      .map((book) => ({ ...book }))
  }

  async deleteBook(id: string): Promise<void> {
    this.books.delete(id)

    // Delete related data
    for (const [key, asset] of this.bookAssets.entries()) {
      if (asset.bookId === id) {
        this.bookAssets.delete(key)
      }
    }

    for (const [key, slide] of this.slides.entries()) {
      if (slide.bookId === id) {
        this.slides.delete(key)
      }
    }

    this.progress.delete(id)
  }

  // BookAssets
  async saveBookAsset(asset: BookAsset): Promise<void> {
    const key = `${asset.bookId}-${asset.spineIndex}`
    this.bookAssets.set(key, { ...asset })
  }

  async saveBookAssets(assets: BookAsset[]): Promise<void> {
    for (const asset of assets) {
      await this.saveBookAsset(asset)
    }
  }

  async getBookAsset(bookId: string, spineIndex: number): Promise<BookAsset | undefined> {
    const key = `${bookId}-${spineIndex}`
    const asset = this.bookAssets.get(key)
    return asset ? { ...asset } : undefined
  }

  async getBookAssets(bookId: string): Promise<BookAsset[]> {
    return Array.from(this.bookAssets.values())
      .filter((asset) => asset.bookId === bookId)
      .sort((a, b) => a.spineIndex - b.spineIndex)
      .map((asset) => ({ ...asset }))
  }

  // Slides
  async saveSlide(slide: Slide): Promise<void> {
    const key = `${slide.bookId}-${slide.slideIndex}`
    this.slides.set(key, { ...slide })
  }

  async saveSlides(slides: Slide[]): Promise<void> {
    for (const slide of slides) {
      await this.saveSlide(slide)
    }
  }

  async getSlide(bookId: string, slideIndex: number): Promise<Slide | undefined> {
    const key = `${bookId}-${slideIndex}`
    const slide = this.slides.get(key)
    return slide ? { ...slide } : undefined
  }

  async getSlidesByChapter(bookId: string, chapter: number): Promise<Slide[]> {
    return Array.from(this.slides.values())
      .filter((slide) => slide.bookId === bookId && slide.chapter === chapter)
      .sort((a, b) => a.slideIndex - b.slideIndex)
      .map((slide) => ({ ...slide }))
  }

  async countSlides(bookId: string): Promise<number> {
    return Array.from(this.slides.values()).filter((slide) => slide.bookId === bookId).length
  }

  async getAllSlides(bookId: string): Promise<Slide[]> {
    return Array.from(this.slides.values())
      .filter((slide) => slide.bookId === bookId)
      .sort((a, b) => a.slideIndex - b.slideIndex)
      .map((slide) => ({ ...slide }))
  }

  // Progress
  async getProgress(bookId: string): Promise<Progress | undefined> {
    const progress = this.progress.get(bookId)
    return progress ? { ...progress } : undefined
  }

  async setProgress(bookId: string, slideIndex: number): Promise<void> {
    this.progress.set(bookId, {
      bookId,
      slideIndex,
      updatedAt: Date.now(),
    })
  }

  async deleteProgress(bookId: string): Promise<void> {
    this.progress.delete(bookId)
  }

  // KV Store
  async getKV(key: string): Promise<any> {
    return this.kv.get(key)
  }

  async setKV(key: string, value: any): Promise<void> {
    this.kv.set(key, value)
  }

  async deleteKV(key: string): Promise<void> {
    this.kv.delete(key)
  }

  async getAllKV(): Promise<KVPair[]> {
    return Array.from(this.kv.entries()).map(([key, value]) => ({ key, value }))
  }

  // Utility methods
  async clear(): Promise<void> {
    this.books.clear()
    this.bookAssets.clear()
    this.slides.clear()
    this.progress.clear()
    this.kv.clear()
  }

  async getStorageEstimate(): Promise<StorageEstimate | undefined> {
    // Mock implementation
    return {
      usage: 0,
      quota: 100000000, // 100MB mock quota
    }
  }

  // Test helper methods
  reset(): void {
    this.books.clear()
    this.bookAssets.clear()
    this.slides.clear()
    this.progress.clear()
    this.kv.clear()
  }

  getInternalState() {
    return {
      books: Array.from(this.books.entries()),
      bookAssets: Array.from(this.bookAssets.entries()),
      slides: Array.from(this.slides.entries()),
      progress: Array.from(this.progress.entries()),
      kv: Array.from(this.kv.entries()),
    }
  }
}
