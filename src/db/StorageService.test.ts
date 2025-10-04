// Must import before any IndexedDB code
import 'fake-indexeddb/auto'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StorageService } from './StorageService'
import { deleteDB, closeDB } from './db'
import type { Book, BookAsset, Slide } from './types'

describe('StorageService (Integration)', () => {
  let storage: StorageService

  beforeEach(async () => {
    await deleteDB()
    storage = new StorageService()
  })

  afterEach(async () => {
    await closeDB()
    await deleteDB()
  })

  describe('Books', () => {
    it('should save and retrieve a book', async () => {
      const book: Book = {
        id: 'book-1',
        title: 'Test Book',
        author: 'Test Author',
        modifiedAt: Date.now(),
        sizeBytes: 1024,
      }

      await storage.saveBook(book)
      const retrieved = await storage.getBook('book-1')

      expect(retrieved).toEqual(book)
    })

    it('should get all books sorted by modified date', async () => {
      const book1: Book = {
        id: 'book-1',
        title: 'Older Book',
        modifiedAt: 1000,
        sizeBytes: 1024,
      }
      const book2: Book = {
        id: 'book-2',
        title: 'Newer Book',
        modifiedAt: 2000,
        sizeBytes: 2048,
      }

      await storage.saveBook(book1)
      await storage.saveBook(book2)

      const books = await storage.getAllBooks()
      expect(books).toHaveLength(2)
      // Most recent first
      expect(books[0]?.modifiedAt).toBe(2000)
      expect(books[1]?.modifiedAt).toBe(1000)
    })

    it('should cascade delete related data when deleting a book', async () => {
      const book: Book = {
        id: 'book-1',
        title: 'Test Book',
        modifiedAt: Date.now(),
        sizeBytes: 1024,
      }

      await storage.saveBook(book)
      await storage.saveBookAsset({
        bookId: 'book-1',
        spineIndex: 0,
        href: 'chapter1.html',
        text: 'Text',
      })
      await storage.saveSlide({
        bookId: 'book-1',
        slideIndex: 0,
        chapter: 1,
        words: 50,
        text: 'Slide text',
      })
      await storage.setProgress('book-1', 5)

      await storage.deleteBook('book-1')

      expect(await storage.getBook('book-1')).toBeUndefined()
      expect(await storage.getBookAssets('book-1')).toHaveLength(0)
      expect(await storage.countSlides('book-1')).toBe(0)
      expect(await storage.getProgress('book-1')).toBeUndefined()
    })
  })

  describe('BookAssets', () => {
    it('should save and retrieve single asset', async () => {
      const asset: BookAsset = {
        bookId: 'book-1',
        spineIndex: 0,
        href: 'chapter1.html',
        text: 'Chapter text',
      }

      await storage.saveBookAsset(asset)
      const retrieved = await storage.getBookAsset('book-1', 0)

      expect(retrieved).toEqual(asset)
    })

    it('should batch save assets', async () => {
      const assets: BookAsset[] = Array.from({ length: 10 }, (_, i) => ({
        bookId: 'book-1',
        spineIndex: i,
        href: `chapter${i}.html`,
        text: `Chapter ${i} text`,
      }))

      await storage.saveBookAssets(assets)
      const retrieved = await storage.getBookAssets('book-1')

      expect(retrieved).toHaveLength(10)
      expect(retrieved[0]?.spineIndex).toBe(0)
      expect(retrieved[9]?.spineIndex).toBe(9)
    })

    it('should get assets sorted by spine index', async () => {
      const assets: BookAsset[] = [
        {
          bookId: 'book-1',
          spineIndex: 5,
          href: 'ch5.html',
          text: 'Chapter 5',
        },
        {
          bookId: 'book-1',
          spineIndex: 1,
          href: 'ch1.html',
          text: 'Chapter 1',
        },
        {
          bookId: 'book-1',
          spineIndex: 3,
          href: 'ch3.html',
          text: 'Chapter 3',
        },
      ]

      await storage.saveBookAssets(assets)
      const retrieved = await storage.getBookAssets('book-1')

      expect(retrieved[0]?.spineIndex).toBe(1)
      expect(retrieved[1]?.spineIndex).toBe(3)
      expect(retrieved[2]?.spineIndex).toBe(5)
    })
  })

  describe('Slides', () => {
    it('should save and retrieve a slide', async () => {
      const slide: Slide = {
        bookId: 'book-1',
        slideIndex: 0,
        chapter: 1,
        words: 50,
        text: 'Test slide text',
      }

      await storage.saveSlide(slide)
      const retrieved = await storage.getSlide('book-1', 0)

      expect(retrieved).toEqual(slide)
    })

    it('should batch save slides efficiently', async () => {
      const slides: Slide[] = Array.from({ length: 500 }, (_, i) => ({
        bookId: 'book-1',
        slideIndex: i,
        chapter: Math.floor(i / 50) + 1,
        words: 50,
        text: `Slide ${i} text`,
      }))

      const startTime = Date.now()
      await storage.saveSlides(slides)
      const duration = Date.now() - startTime

      // Should be reasonably fast (< 2 seconds for 500 slides)
      expect(duration).toBeLessThan(2000)

      const count = await storage.countSlides('book-1')
      expect(count).toBe(500)
    })

    it('should get slides by chapter', async () => {
      const slides: Slide[] = [
        {
          bookId: 'book-1',
          slideIndex: 0,
          chapter: 1,
          words: 50,
          text: 'Ch1 Slide 1',
        },
        {
          bookId: 'book-1',
          slideIndex: 1,
          chapter: 1,
          words: 50,
          text: 'Ch1 Slide 2',
        },
        {
          bookId: 'book-1',
          slideIndex: 2,
          chapter: 2,
          words: 50,
          text: 'Ch2 Slide 1',
        },
      ]

      await storage.saveSlides(slides)
      const chapter1 = await storage.getSlidesByChapter('book-1', 1)
      const chapter2 = await storage.getSlidesByChapter('book-1', 2)

      expect(chapter1).toHaveLength(2)
      expect(chapter2).toHaveLength(1)
    })

    it('should count slides correctly', async () => {
      const slides: Slide[] = [
        {
          bookId: 'book-1',
          slideIndex: 0,
          chapter: 1,
          words: 50,
          text: 'Slide 1',
        },
        {
          bookId: 'book-1',
          slideIndex: 1,
          chapter: 1,
          words: 50,
          text: 'Slide 2',
        },
        {
          bookId: 'book-2',
          slideIndex: 0,
          chapter: 1,
          words: 50,
          text: 'Different book',
        },
      ]

      await storage.saveSlides(slides)

      const count1 = await storage.countSlides('book-1')
      const count2 = await storage.countSlides('book-2')

      expect(count1).toBe(2)
      expect(count2).toBe(1)
    })

    it('should get all slides sorted', async () => {
      const slides: Slide[] = [
        {
          bookId: 'book-1',
          slideIndex: 2,
          chapter: 1,
          words: 50,
          text: 'Slide 3',
        },
        {
          bookId: 'book-1',
          slideIndex: 0,
          chapter: 1,
          words: 50,
          text: 'Slide 1',
        },
        {
          bookId: 'book-1',
          slideIndex: 1,
          chapter: 1,
          words: 50,
          text: 'Slide 2',
        },
      ]

      await storage.saveSlides(slides)
      const all = await storage.getAllSlides('book-1')

      expect(all[0]?.slideIndex).toBe(0)
      expect(all[1]?.slideIndex).toBe(1)
      expect(all[2]?.slideIndex).toBe(2)
    })
  })

  describe('Progress', () => {
    it('should save and retrieve progress', async () => {
      await storage.setProgress('book-1', 42)
      const progress = await storage.getProgress('book-1')

      expect(progress?.bookId).toBe('book-1')
      expect(progress?.slideIndex).toBe(42)
      expect(progress?.updatedAt).toBeGreaterThan(0)
    })

    it('should update progress timestamp on each save', async () => {
      await storage.setProgress('book-1', 10)
      const first = await storage.getProgress('book-1')

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10))

      await storage.setProgress('book-1', 20)
      const second = await storage.getProgress('book-1')

      expect(second?.updatedAt).toBeGreaterThan(first!.updatedAt)
      expect(second?.slideIndex).toBe(20)
    })

    it('should delete progress', async () => {
      await storage.setProgress('book-1', 10)
      await storage.deleteProgress('book-1')
      const progress = await storage.getProgress('book-1')

      expect(progress).toBeUndefined()
    })
  })

  describe('KV Store', () => {
    it('should save and retrieve values', async () => {
      await storage.setKV('autoAdvanceSeconds', 9)
      const value = await storage.getKV('autoAdvanceSeconds')

      expect(value).toBe(9)
    })

    it('should handle complex objects', async () => {
      const settings = {
        theme: 'dark',
        fontSize: 18,
        autoAdvance: true,
        duration: 9,
      }

      await storage.setKV('settings', settings)
      const retrieved = await storage.getKV('settings')

      expect(retrieved).toEqual(settings)
    })

    it('should get all KV pairs', async () => {
      await storage.setKV('key1', 'value1')
      await storage.setKV('key2', 'value2')
      await storage.setKV('key3', 'value3')

      const all = await storage.getAllKV()
      expect(all).toHaveLength(3)
    })

    it('should delete a key', async () => {
      await storage.setKV('key1', 'value1')
      await storage.deleteKV('key1')
      const value = await storage.getKV('key1')

      expect(value).toBeUndefined()
    })

    it('should return undefined for non-existent key', async () => {
      const value = await storage.getKV('non-existent')
      expect(value).toBeUndefined()
    })
  })

  describe('Utility methods', () => {
    it('should clear all data', async () => {
      const book: Book = {
        id: 'book-1',
        title: 'Test',
        modifiedAt: Date.now(),
        sizeBytes: 1024,
      }

      await storage.saveBook(book)
      await storage.setProgress('book-1', 10)
      await storage.setKV('key', 'value')

      await storage.clear()

      expect(await storage.getBook('book-1')).toBeUndefined()
      expect(await storage.getProgress('book-1')).toBeUndefined()
      expect(await storage.getKV('key')).toBeUndefined()
    })

    it('should get storage estimate', async () => {
      const estimate = await storage.getStorageEstimate()

      if (estimate) {
        expect(estimate.quota).toBeGreaterThan(0)
        expect(estimate.usage).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('Real-world scenarios', () => {
    it('should handle complete book import workflow', async () => {
      // Save book metadata
      const book: Book = {
        id: 'book-1',
        title: 'Complete Book',
        author: 'Test Author',
        modifiedAt: Date.now(),
        sizeBytes: 5000000,
      }
      await storage.saveBook(book)

      // Save book assets (chapters)
      const assets: BookAsset[] = Array.from({ length: 20 }, (_, i) => ({
        bookId: 'book-1',
        spineIndex: i,
        href: `chapter${i}.html`,
        text: `Chapter ${i} content...`,
      }))
      await storage.saveBookAssets(assets)

      // Save slides (chunked text)
      const slides: Slide[] = Array.from({ length: 300 }, (_, i) => ({
        bookId: 'book-1',
        slideIndex: i,
        chapter: Math.floor(i / 15) + 1,
        words: 50,
        text: `Slide ${i} text...`,
      }))
      await storage.saveSlides(slides)

      // Initialize progress
      await storage.setProgress('book-1', 0)

      // Verify everything was saved
      expect(await storage.getBook('book-1')).toBeDefined()
      expect(await storage.getBookAssets('book-1')).toHaveLength(20)
      expect(await storage.countSlides('book-1')).toBe(300)
      expect(await storage.getProgress('book-1')).toBeDefined()
    })

    it('should handle reading session with progress updates', async () => {
      const slides: Slide[] = Array.from({ length: 50 }, (_, i) => ({
        bookId: 'book-1',
        slideIndex: i,
        chapter: 1,
        words: 50,
        text: `Slide ${i}`,
      }))
      await storage.saveSlides(slides)

      // Simulate reading progression
      for (let i = 0; i < 10; i++) {
        await storage.setProgress('book-1', i)
      }

      const finalProgress = await storage.getProgress('book-1')
      expect(finalProgress?.slideIndex).toBe(9)
    })

    it('should handle multiple books simultaneously', async () => {
      const books: Book[] = [
        {
          id: 'book-1',
          title: 'Book 1',
          modifiedAt: Date.now(),
          sizeBytes: 1024,
        },
        {
          id: 'book-2',
          title: 'Book 2',
          modifiedAt: Date.now(),
          sizeBytes: 2048,
        },
      ]

      for (const book of books) {
        await storage.saveBook(book)
        await storage.saveSlides([
          {
            bookId: book.id,
            slideIndex: 0,
            chapter: 1,
            words: 50,
            text: 'Slide',
          },
        ])
        await storage.setProgress(book.id, 0)
      }

      expect(await storage.getAllBooks()).toHaveLength(2)
      expect(await storage.countSlides('book-1')).toBe(1)
      expect(await storage.countSlides('book-2')).toBe(1)
    })
  })
})
