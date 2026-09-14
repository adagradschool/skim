import type { Block } from '@/chunker/types'

export interface ChapterText {
  index: number
  title: string
  text: string
  href: string
  /** Structured content (headings, paragraphs, emphasis). Absent for plain-text formats. */
  blocks?: Block[]
}

export interface ParseResult {
  chapters: ChapterText[]
  meta: {
    title?: string
    author?: string
    coverBlob?: Blob
  }
  parseTimeMs: number
  totalWords: number
}

export interface ParseProgress {
  stage: 'loading' | 'extracting' | 'normalizing' | 'complete'
  current: number
  total: number
  message: string
}
