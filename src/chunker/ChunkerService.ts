import type { ChapterInput, Slide, ChunkResult } from './types'

export class ChunkerService {
  /**
   * Split chapters into ~50-word slides with paragraph awareness
   * @param bookId - ID of the book being chunked
   * @param chapters - Array of chapter texts
   * @param targetWords - Target words per slide (default 50)
   * @returns ChunkResult with slides and metadata
   */
  split(bookId: string, chapters: ChapterInput[], targetWords = 50): ChunkResult {
    const slides: Slide[] = []
    let slideIndex = 0

    for (const chapter of chapters) {
      // Split chapter into paragraphs (separated by \n\n)
      const paragraphs = chapter.text
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0)

      let currentSlide: string[] = []
      let currentWordCount = 0

      for (const paragraph of paragraphs) {
        const words = this.tokenizeWords(paragraph)
        const paragraphWordCount = words.length

        // If current slide + paragraph fits in target range (45-55 words)
        if (currentWordCount + paragraphWordCount <= targetWords + 5) {
          currentSlide.push(paragraph)
          currentWordCount += paragraphWordCount
        } else if (currentWordCount === 0) {
          // Long paragraph that needs to be split
          const chunks = this.splitLongParagraph(words, targetWords)
          for (const chunk of chunks) {
            const chunkText = chunk.join(' ')
            slides.push({
              bookId,
              slideIndex: slideIndex++,
              chapter: chapter.chapter,
              text: chunkText,
              wordCount: chunk.length,
            })
          }
        } else {
          // Save current slide and start new one with this paragraph
          const slideText = currentSlide.join('\n\n')
          slides.push({
            bookId,
            slideIndex: slideIndex++,
            chapter: chapter.chapter,
            text: slideText,
            wordCount: currentWordCount,
          })

          // Start new slide with current paragraph
          if (paragraphWordCount <= targetWords + 5) {
            currentSlide = [paragraph]
            currentWordCount = paragraphWordCount
          } else {
            // Long paragraph needs splitting
            currentSlide = []
            currentWordCount = 0
            const chunks = this.splitLongParagraph(words, targetWords)
            for (const chunk of chunks) {
              const chunkText = chunk.join(' ')
              slides.push({
                bookId,
                slideIndex: slideIndex++,
                chapter: chapter.chapter,
                text: chunkText,
                wordCount: chunk.length,
              })
            }
          }
        }
      }

      // Save any remaining content as final slide for this chapter
      if (currentSlide.length > 0) {
        const slideText = currentSlide.join('\n\n')
        slides.push({
          bookId,
          slideIndex: slideIndex++,
          chapter: chapter.chapter,
          text: slideText,
          wordCount: currentWordCount,
        })
      }
    }

    // Calculate statistics
    const totalWords = slides.reduce((sum, slide) => sum + slide.wordCount, 0)
    const averageWordsPerSlide = slides.length > 0 ? totalWords / slides.length : 0

    return {
      slides,
      totalSlides: slides.length,
      totalWords,
      averageWordsPerSlide,
    }
  }

  /**
   * Split a long paragraph into chunks at target word count
   * @param words - Array of words from paragraph
   * @param targetWords - Target words per chunk
   * @returns Array of word arrays (chunks)
   */
  private splitLongParagraph(words: string[], targetWords: number): string[][] {
    const chunks: string[][] = []
    let currentChunk: string[] = []

    for (const word of words) {
      currentChunk.push(word)

      if (currentChunk.length >= targetWords) {
        chunks.push(currentChunk)
        currentChunk = []
      }
    }

    // Add remaining words as final chunk (may be short)
    if (currentChunk.length > 0) {
      chunks.push(currentChunk)
    }

    return chunks
  }

  /**
   * Unicode-aware word tokenization
   * Splits on whitespace and handles punctuation correctly
   * @param text - Text to tokenize
   * @returns Array of words
   */
  private tokenizeWords(text: string): string[] {
    // Split on whitespace, filter empty strings
    return text
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0)
  }
}

// Singleton instance
export const chunkerService = new ChunkerService()
