// Must import before any IndexedDB code
import 'fake-indexeddb/auto'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDB, deleteDB, closeDB } from './db'
import type { Book, Slide } from './types'

describe('IndexedDB Schema', () => {
  beforeEach(async () => {
    await deleteDB()
  })

  afterEach(async () => {
    await closeDB()
    await deleteDB()
  })

  it('should create database with correct version', async () => {
    const db = await getDB()
    expect(db.name).toBe('skim-db')
    expect(db.version).toBe(1)
  })

  it('should create all required object stores', async () => {
    const db = await getDB()
    const storeNames = Array.from(db.objectStoreNames)

    expect(storeNames).toContain('books')
    expect(storeNames).toContain('bookAssets')
    expect(storeNames).toContain('slides')
    expect(storeNames).toContain('progress')
    expect(storeNames).toContain('kv')
  })

  it('should create indexes on books store', async () => {
    const db = await getDB()
    const tx = db.transaction('books', 'readonly')
    const store = tx.objectStore('books')

    const indexNames = Array.from(store.indexNames)
    expect(indexNames).toContain('by-modified')
  })

  it('should create indexes on bookAssets store', async () => {
    const db = await getDB()
    const tx = db.transaction('bookAssets', 'readonly')
    const store = tx.objectStore('bookAssets')

    const indexNames = Array.from(store.indexNames)
    expect(indexNames).toContain('by-book')
  })

  it('should create indexes on slides store', async () => {
    const db = await getDB()
    const tx = db.transaction('slides', 'readonly')
    const store = tx.objectStore('slides')

    const indexNames = Array.from(store.indexNames)
    expect(indexNames).toContain('by-book')
    expect(indexNames).toContain('by-chapter')
  })

  it('should support basic CRUD operations on books', async () => {
    const db = await getDB()

    const book: Book = {
      id: 'test-book-1',
      title: 'Test Book',
      author: 'Test Author',
      modifiedAt: Date.now(),
      sizeBytes: 1024,
    }

    // Create
    await db.put('books', book)

    // Read
    const retrieved = await db.get('books', 'test-book-1')
    expect(retrieved).toEqual(book)

    // Update
    book.title = 'Updated Title'
    await db.put('books', book)
    const updated = await db.get('books', 'test-book-1')
    expect(updated?.title).toBe('Updated Title')

    // Delete
    await db.delete('books', 'test-book-1')
    const deleted = await db.get('books', 'test-book-1')
    expect(deleted).toBeUndefined()
  })

  it('should support composite keys for slides', async () => {
    const db = await getDB()

    const slide: Slide = {
      bookId: 'book-1',
      slideIndex: 0,
      chapter: 1,
      words: 50,
      text: 'Test slide text',
    }

    await db.put('slides', slide)
    const retrieved = await db.get('slides', ['book-1', 0])

    expect(retrieved).toEqual(slide)
  })

  it('should query by index', async () => {
    const db = await getDB()

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
      sizeBytes: 2048,
    }

    await db.put('books', book1)
    await db.put('books', book2)

    const books = await db.getAllFromIndex('books', 'by-modified')
    expect(books).toHaveLength(2)
  })

  it('should handle transactions correctly', async () => {
    const db = await getDB()

    const tx = db.transaction(['books', 'progress'], 'readwrite')

    const book: Book = {
      id: 'book-1',
      title: 'Test',
      modifiedAt: Date.now(),
      sizeBytes: 1024,
    }

    await tx.objectStore('books').put(book)
    await tx.objectStore('progress').put({
      bookId: 'book-1',
      slideIndex: 0,
      updatedAt: Date.now(),
    })

    await tx.done

    const retrievedBook = await db.get('books', 'book-1')
    const retrievedProgress = await db.get('progress', 'book-1')

    expect(retrievedBook).toBeDefined()
    expect(retrievedProgress).toBeDefined()
  })

  it('should support clearing a store', async () => {
    const db = await getDB()

    const book: Book = {
      id: 'book-1',
      title: 'Test',
      modifiedAt: Date.now(),
      sizeBytes: 1024,
    }

    await db.put('books', book)
    expect(await db.count('books')).toBe(1)

    await db.clear('books')
    expect(await db.count('books')).toBe(0)
  })

  it('should support countFromIndex', async () => {
    const db = await getDB()

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
        text: 'Slide 3',
      },
    ]

    const tx = db.transaction('slides', 'readwrite')
    for (const slide of slides) {
      await tx.store.put(slide)
    }
    await tx.done

    const count = await db.countFromIndex('slides', 'by-book', 'book-1')
    expect(count).toBe(2)
  })

  it('should be reusable after close', async () => {
    let db = await getDB()
    expect(db.version).toBe(1)

    await closeDB()

    db = await getDB()
    expect(db.version).toBe(1)
  })

  describe('Schema Upgrades', () => {
    it('should handle database deletion and recreation', async () => {
      // Create initial database
      let db = await getDB()
      const book: Book = {
        id: 'book-1',
        title: 'Test',
        modifiedAt: Date.now(),
        sizeBytes: 1024,
      }
      await db.put('books', book)

      // Delete database
      await closeDB()
      await deleteDB()

      // Recreate database
      db = await getDB()
      expect(db.version).toBe(1)

      // Verify data is gone
      const retrieved = await db.get('books', 'book-1')
      expect(retrieved).toBeUndefined()
    })

    it('should maintain data integrity across transactions', async () => {
      const db = await getDB()

      const slides: Slide[] = Array.from({ length: 100 }, (_, i) => ({
        bookId: 'book-1',
        slideIndex: i,
        chapter: Math.floor(i / 10) + 1,
        words: 50,
        text: `Slide ${i}`,
      }))

      // Insert in chunks
      const CHUNK_SIZE = 10
      for (let i = 0; i < slides.length; i += CHUNK_SIZE) {
        const chunk = slides.slice(i, i + CHUNK_SIZE)
        const tx = db.transaction('slides', 'readwrite')
        await Promise.all(chunk.map((slide) => tx.store.put(slide)))
        await tx.done
      }

      // Verify all slides were inserted
      const count = await db.countFromIndex('slides', 'by-book', 'book-1')
      expect(count).toBe(100)

      // Verify chapter index works
      const chapter1Slides = await db.getAllFromIndex('slides', 'by-chapter', ['book-1', 1])
      expect(chapter1Slides).toHaveLength(10)
    })
  })

  describe('Error Handling', () => {
    it('should handle duplicate key insertions', async () => {
      const db = await getDB()

      const book: Book = {
        id: 'book-1',
        title: 'Original',
        modifiedAt: Date.now(),
        sizeBytes: 1024,
      }

      await db.put('books', book)

      // Putting with same key should overwrite
      book.title = 'Updated'
      await db.put('books', book)

      const retrieved = await db.get('books', 'book-1')
      expect(retrieved?.title).toBe('Updated')
    })

    it('should handle transaction abort on error', async () => {
      const db = await getDB()

      try {
        const tx = db.transaction('books', 'readwrite')

        const book: Book = {
          id: 'book-1',
          title: 'Test',
          modifiedAt: Date.now(),
          sizeBytes: 1024,
        }

        await tx.store.put(book)

        // Manually abort the transaction
        tx.abort()

        await tx.done
      } catch (error) {
        // Transaction was aborted
        expect(error).toBeDefined()
      }

      // Verify data was not saved
      const retrieved = await db.get('books', 'book-1')
      expect(retrieved).toBeUndefined()
    })
  })
})
