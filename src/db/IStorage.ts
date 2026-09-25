import type { Book, BookAsset, Chapter, Slide, Progress, Bookmark, KVPair } from './types'

/**
 * The storage contract every backend implements.
 * - IndexedDbStorage: the website (Chromium quota-managed storage).
 * - SqliteStorage: the Android app (SQLite in the app's private files,
 *   which the WebView's quota manager can never evict).
 */
export interface IStorage {
  saveBook(book: Book): Promise<void>
  getBook(id: string): Promise<Book | undefined>
  getAllBooks(): Promise<Book[]>
  deleteBook(id: string): Promise<void>

  saveBookAsset(asset: BookAsset): Promise<void>
  saveBookAssets(assets: BookAsset[]): Promise<void>
  getBookAsset(bookId: string, spineIndex: number): Promise<BookAsset | undefined>
  getBookAssets(bookId: string): Promise<BookAsset[]>

  saveChapter(chapter: Chapter): Promise<void>
  saveChapters(chapters: Chapter[]): Promise<void>
  getChapter(bookId: string, chapterIndex: number): Promise<Chapter | undefined>
  getAllChapters(bookId: string): Promise<Chapter[]>
  countChapters(bookId: string): Promise<number>

  saveSlide(slide: Slide): Promise<void>
  saveSlides(slides: Slide[]): Promise<void>
  saveImportedBundle(args: { book: Book; slides: Slide[]; initialSlideIndex?: number; timestamp?: number; signal?: AbortSignal }): Promise<void>
  getSlide(bookId: string, slideIndex: number): Promise<Slide | undefined>
  getSlidesByChapter(bookId: string, chapter: number): Promise<Slide[]>
  countSlides(bookId: string): Promise<number>
  getAllSlides(bookId: string): Promise<Slide[]>

  getProgress(bookId: string): Promise<Progress | undefined>
  setProgress(bookId: string, slideIndex: number): Promise<void>
  deleteProgress(bookId: string): Promise<void>

  createBookmark(bookmark: Omit<Bookmark, 'id' | 'timestamp'>): Promise<string>
  getBookmark(id: string): Promise<Bookmark | undefined>
  getAllBookmarks(bookId: string): Promise<Bookmark[]>
  deleteBookmark(id: string): Promise<void>

  getKV(key: string): Promise<any>
  setKV(key: string, value: any): Promise<void>
  deleteKV(key: string): Promise<void>
  getAllKV(): Promise<KVPair[]>

  clear(): Promise<void>
  getStorageEstimate(): Promise<StorageEstimate | undefined>
}
