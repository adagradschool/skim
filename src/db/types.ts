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

export interface Slide {
  bookId: string
  slideIndex: number
  chapter: number
  words: number
  text: string
}

export interface Progress {
  bookId: string
  slideIndex: number
  updatedAt: number
}

export interface KVPair {
  key: string
  value: any
}
