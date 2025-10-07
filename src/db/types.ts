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
  firstSlideIndex: number  // Index of first slide in this chapter
  slideCount: number       // Number of slides in this chapter
}

export interface Slide {
  bookId: string
  slideIndex: number
  chapter: number
  words: number
  text: string
}

export interface Progress {
  bookId: string
  slideIndex: number   // Current slide position in the book
  updatedAt: number
}

export interface KVPair {
  key: string
  value: any
}
