import { describe, it, expect, beforeEach } from 'vitest'
import { StorageMock } from './StorageMock'
import type { Book, BookAsset, Slide } from './types'

describe('StorageMock', () => {
  let storage: StorageMock

  beforeEach(() => {
    storage = new StorageMock()
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

    it('should return undefined for non-existent book', async () => {
      const retrieved = await storage.getBook('non-existent')
      expect(retrieved).toBeUndefined()
    })

    it('should get all books sorted by modifiedAt', async () => {
      const book1: Book = {
        id: 'book-1',
        title: 'Book 1',
        modifiedAt: 1000,
        sizeBytes: 1024,
      }
      const book2: Book = {
        id: 'book-2',
        title: 'Book 2',
        modifiedAt: 2000,
        sizeBytes: 1024,
      }

      await storage.saveBook(book1)
      await storage.saveBook(book2)

      const books = await storage.getAllBooks()
      expect(books).toHaveLength(2)
      expect(books[0]?.id).toBe('book-2') // Most recent first
      expect(books[1]?.id).toBe('book-1')
    })

    it('should delete a book and its related data', async () => {
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
        text: 'Chapter 1 text',
      })
      await storage.setProgress('book-1', 10)

      await storage.deleteBook('book-1')

      expect(await storage.getBook('book-1')).toBeUndefined()
      expect(await storage.getBookAssets('book-1')).toHaveLength(0)
      expect(await storage.getProgress('book-1')).toBeUndefined()
    })
  })

  describe('BookAssets', () => {
    it('should save and retrieve a book asset', async () => {
      const asset: BookAsset = {
        bookId: 'book-1',
        spineIndex: 0,
        href: 'chapter1.html',
        text: 'Chapter 1 text',
      }

      await storage.saveBookAsset(asset)
      const retrieved = await storage.getBookAsset('book-1', 0)

      expect(retrieved).toEqual(asset)
    })

    it('should save multiple assets at once', async () => {
      const assets: BookAsset[] = [
        {
          bookId: 'book-1',
          spineIndex: 0,
          href: 'chapter1.html',
          text: 'Chapter 1',
        },
        {
          bookId: 'book-1',
          spineIndex: 1,
          href: 'chapter2.html',
          text: 'Chapter 2',
        },
      ]

      await storage.saveBookAssets(assets)
      const retrieved = await storage.getBookAssets('book-1')

      expect(retrieved).toHaveLength(2)
      expect(retrieved[0]?.spineIndex).toBe(0)
      expect(retrieved[1]?.spineIndex).toBe(1)
    })

    it('should get assets sorted by spine index', async () => {
      const asset2: BookAsset = {
        bookId: 'book-1',
        spineIndex: 2,
        href: 'chapter3.html',
        text: 'Chapter 3',
      }
      const asset1: BookAsset = {
        bookId: 'book-1',
        spineIndex: 1,
        href: 'chapter2.html',
        text: 'Chapter 2',
      }

      await storage.saveBookAsset(asset2)
      await storage.saveBookAsset(asset1)

      const assets = await storage.getBookAssets('book-1')
      expect(assets[0]?.spineIndex).toBe(1)
      expect(assets[1]?.spineIndex).toBe(2)
    })
  })

  describe('Slides', () => {
    it('should save and retrieve a slide', async () => {
      const slide: Slide = {
        bookId: 'book-1',
        slideIndex: 0,
        chapter: 1,
        words: 50,
        text: 'This is a test slide with approximately fifty words...',
      }

      await storage.saveSlide(slide)
      const retrieved = await storage.getSlide('book-1', 0)

      expect(retrieved).toEqual(slide)
    })

    it('should save multiple slides at once', async () => {
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
          words: 48,
          text: 'Slide 2',
        },
      ]

      await storage.saveSlides(slides)
      const count = await storage.countSlides('book-1')

      expect(count).toBe(2)
    })

    it('should get slides by chapter', async () => {
      const slides: Slide[] = [
        {
          bookId: 'book-1',
          slideIndex: 0,
          chapter: 1,
          words: 50,
          text: 'Chapter 1, Slide 1',
        },
        {
          bookId: 'book-1',
          slideIndex: 1,
          chapter: 1,
          words: 50,
          text: 'Chapter 1, Slide 2',
        },
        {
          bookId: 'book-1',
          slideIndex: 2,
          chapter: 2,
          words: 50,
          text: 'Chapter 2, Slide 1',
        },
      ]

      await storage.saveSlides(slides)
      const chapter1Slides = await storage.getSlidesByChapter('book-1', 1)

      expect(chapter1Slides).toHaveLength(2)
      expect(chapter1Slides[0]?.chapter).toBe(1)
      expect(chapter1Slides[1]?.chapter).toBe(1)
    })

    it('should count slides for a book', async () => {
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
      const count = await storage.countSlides('book-1')

      expect(count).toBe(2)
    })

    it('should get all slides sorted by index', async () => {
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
      const allSlides = await storage.getAllSlides('book-1')

      expect(allSlides[0]?.slideIndex).toBe(0)
      expect(allSlides[1]?.slideIndex).toBe(1)
      expect(allSlides[2]?.slideIndex).toBe(2)
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

    it('should update existing progress', async () => {
      await storage.setProgress('book-1', 10)
      await storage.setProgress('book-1', 20)
      const progress = await storage.getProgress('book-1')

      expect(progress?.slideIndex).toBe(20)
    })

    it('should delete progress', async () => {
      await storage.setProgress('book-1', 10)
      await storage.deleteProgress('book-1')
      const progress = await storage.getProgress('book-1')

      expect(progress).toBeUndefined()
    })
  })

  describe('KV Store', () => {
    it('should save and retrieve key-value pairs', async () => {
      await storage.setKV('autoAdvanceSeconds', 9)
      const value = await storage.getKV('autoAdvanceSeconds')

      expect(value).toBe(9)
    })

    it('should handle complex values', async () => {
      const settings = {
        theme: 'dark',
        fontSize: 18,
        enabled: true,
      }

      await storage.setKV('settings', settings)
      const retrieved = await storage.getKV('settings')

      expect(retrieved).toEqual(settings)
    })

    it('should get all KV pairs', async () => {
      await storage.setKV('key1', 'value1')
      await storage.setKV('key2', 'value2')

      const all = await storage.getAllKV()
      expect(all).toHaveLength(2)
    })

    it('should delete a key', async () => {
      await storage.setKV('key1', 'value1')
      await storage.deleteKV('key1')
      const value = await storage.getKV('key1')

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

    it('should provide storage estimate', async () => {
      const estimate = await storage.getStorageEstimate()
      expect(estimate).toBeDefined()
      expect(estimate?.quota).toBeGreaterThan(0)
    })

    it('should reset internal state', () => {
      storage.reset()
      const state = storage.getInternalState()

      expect(state.books).toHaveLength(0)
      expect(state.slides).toHaveLength(0)
      expect(state.progress).toHaveLength(0)
    })
  })

  describe('Data isolation', () => {
    it('should not affect original objects after mutation', async () => {
      const book: Book = {
        id: 'book-1',
        title: 'Original Title',
        modifiedAt: Date.now(),
        sizeBytes: 1024,
      }

      await storage.saveBook(book)

      // Mutate the original
      book.title = 'Modified Title'

      const retrieved = await storage.getBook('book-1')
      expect(retrieved?.title).toBe('Original Title')
    })

    it('should return independent copies on retrieval', async () => {
      const book: Book = {
        id: 'book-1',
        title: 'Test',
        modifiedAt: Date.now(),
        sizeBytes: 1024,
      }

      await storage.saveBook(book)

      const retrieved1 = await storage.getBook('book-1')
      const retrieved2 = await storage.getBook('book-1')

      if (retrieved1) retrieved1.title = 'Modified 1'
      if (retrieved2) retrieved2.title = 'Modified 2'

      expect(retrieved1?.title).toBe('Modified 1')
      expect(retrieved2?.title).toBe('Modified 2')

      const original = await storage.getBook('book-1')
      expect(original?.title).toBe('Test')
    })
  })
})
