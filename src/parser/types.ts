export interface ChapterText {
  chapter: number
  title: string
  text: string
  href: string
}

export interface ParseResult {
  chapters: ChapterText[]
  metadata: {
    title?: string
    author?: string
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
