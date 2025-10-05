// Type definitions for database entities

export interface Book {
  id: string
  title: string
  author?: string
  modifiedAt: number
  sizeBytes: number
  coverBlob?: Blob
}

export interface BookAsset {
  bookId: string
  spineIndex: number
  href: string
  text: string
}

export interface Chapter {
  bookId: string
  chapterIndex: number
  title: string
  text: string      // Full chapter text (NOT pre-chunked)
  words: number     // Total word count for this chapter
}

// Deprecated: Kept for reference, will be removed after migration
export interface Slide {
  bookId: string
  slideIndex: number
  chapter: number
  words: number
  text: string
}

export interface Progress {
  bookId: string
  chapterIndex: number      // Which chapter
  wordOffset: number        // Word position within chapter (0-indexed)
  updatedAt: number
}

export interface KVPair {
  key: string
  value: any
}
