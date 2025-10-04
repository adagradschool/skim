export interface ChapterText {
  index: number
  title: string
  text: string
  href: string
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
