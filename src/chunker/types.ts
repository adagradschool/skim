export interface ChapterInput {
  chapter: number
  text: string
}

export interface Slide {
  bookId: string
  slideIndex: number
  chapter: number
  text: string
  words: number
}

export interface ChunkResult {
  slides: Slide[]
  totalSlides: number
  totalWords: number
  averageWordsPerSlide: number
}
