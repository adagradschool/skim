import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'

const DB_NAME = 'skim-db'
const DB_VERSION = 1

// Define the database schema
export interface SkimDB extends DBSchema {
  books: {
    key: string
    value: {
      id: string
      title: string
      author?: string
      modifiedAt: number
      sizeBytes: number
      coverBlob?: Blob
    }
    indexes: { 'by-modified': number }
  }
  bookAssets: {
    key: [string, number] // [bookId, spineIndex]
    value: {
      bookId: string
      spineIndex: number
      href: string
      text: string
    }
    indexes: { 'by-book': string }
  }
  slides: {
    key: [string, number] // [bookId, slideIndex]
    value: {
      bookId: string
      slideIndex: number
      chapter: number
      words: number
      text: string
    }
    indexes: { 'by-book': string; 'by-chapter': [string, number] }
  }
  progress: {
    key: string // bookId
    value: {
      bookId: string
      slideIndex: number
      updatedAt: number
    }
  }
  kv: {
    key: string
    value: {
      key: string
      value: any
    }
  }
}

let dbPromise: Promise<IDBPDatabase<SkimDB>> | null = null

/**
 * Initialize and return the database connection
 */
export async function getDB(): Promise<IDBPDatabase<SkimDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SkimDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        // Version 1: Initial schema
        if (oldVersion < 1) {
          // Books store
          const booksStore = db.createObjectStore('books', { keyPath: 'id' })
          booksStore.createIndex('by-modified', 'modifiedAt')

          // BookAssets store
          const assetsStore = db.createObjectStore('bookAssets', {
            keyPath: ['bookId', 'spineIndex'],
          })
          assetsStore.createIndex('by-book', 'bookId')

          // Slides store
          const slidesStore = db.createObjectStore('slides', {
            keyPath: ['bookId', 'slideIndex'],
          })
          slidesStore.createIndex('by-book', 'bookId')
          slidesStore.createIndex('by-chapter', ['bookId', 'chapter'])

          // Progress store
          db.createObjectStore('progress', { keyPath: 'bookId' })

          // KV store
          db.createObjectStore('kv', { keyPath: 'key' })
        }

        // Future migrations go here
        // if (oldVersion < 2) { ... }
      },
      blocked() {
        console.warn('Database upgrade blocked by another connection')
      },
      blocking() {
        console.warn('This connection is blocking a database upgrade')
      },
      terminated() {
        console.error('Database connection terminated unexpectedly')
        dbPromise = null
      },
    })
  }

  return dbPromise
}

/**
 * Close the database connection
 */
export async function closeDB(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise
    db.close()
    dbPromise = null
  }
}

/**
 * Delete the entire database (useful for testing)
 */
export async function deleteDB(): Promise<void> {
  await closeDB()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      console.warn('Database deletion blocked')
    }
  })
}
