import type { ChunkConfig } from './types'
import { DEFAULT_CHUNK_CONFIG } from './types'

export class ChunkerService {
  /**
   * Chunk text into slides on-the-fly with sentence-aware boundaries
   * @param text - Full chapter text
   * @param config - Chunking configuration
   * @returns Array of slide texts
   */
  chunkText(text: string, config: ChunkConfig = DEFAULT_CHUNK_CONFIG): string[] {
    // Handle empty or whitespace-only text
    if (!text || text.trim().length === 0) {
      return []
    }

    const sentences = this.splitIntoSentences(text)
    return this.groupSentencesIntoSlides(sentences, config)
  }

  /**
   * Split text into sentences using simple regex
   * Handles: . ! ? with proper spacing
   * Can be swapped for more sophisticated NLP later
   * @param text - Text to split
   * @returns Array of sentences
   */
  private splitIntoSentences(text: string): string[] {
    // Split on sentence boundaries: . ! ? followed by space or end
    // Keep the punctuation with the sentence
    const sentenceRegex = /[^.!?]+[.!?]+(?:\s+|$)/g
    const matches = text.match(sentenceRegex)

    if (!matches) {
      // No sentence boundaries found, return whole text as one sentence
      return [text.trim()]
    }

    return matches
      .map(s => s.trim())
      .filter(s => s.length > 0)
  }

  /**
   * Group sentences into slides based on word count
   * Priority: Sentence boundaries > Word count target
   * @param sentences - Array of sentences
   * @param config - Chunking configuration
   * @returns Array of slide texts
   */
  private groupSentencesIntoSlides(sentences: string[], config: ChunkConfig): string[] {
    const slides: string[] = []
    let currentSlide: string[] = []
    let currentWordCount = 0

    for (const sentence of sentences) {
      const sentenceWords = this.countWords(sentence)

      // If adding this sentence exceeds limit
      if (currentWordCount + sentenceWords > config.maxWords) {
        // If we have content, save current slide
        if (currentSlide.length > 0) {
          slides.push(currentSlide.join(' '))
          currentSlide = []
          currentWordCount = 0
        }

        // If single sentence is too long, split it at word boundaries
        if (sentenceWords > config.maxWords) {
          const chunks = this.splitLongSentence(sentence, config.maxWords)
          // Add all chunks except the last one as complete slides
          for (let i = 0; i < chunks.length - 1; i++) {
            slides.push(chunks[i])
          }
          // Start new slide with the last chunk
          const lastChunk = chunks[chunks.length - 1]
          currentSlide = [lastChunk]
          currentWordCount = this.countWords(lastChunk)
        } else {
          // Add full sentence to new slide
          currentSlide.push(sentence)
          currentWordCount = sentenceWords
        }
      } else {
        // Sentence fits, add it
        currentSlide.push(sentence)
        currentWordCount += sentenceWords
      }
    }

    // Flush remaining content
    if (currentSlide.length > 0) {
      slides.push(currentSlide.join(' '))
    }

    return slides
  }

  /**
   * Split a long sentence into chunks at word boundaries
   * @param sentence - Sentence to split
   * @param maxWords - Maximum words per chunk
   * @returns Array of text chunks
   */
  private splitLongSentence(sentence: string, maxWords: number): string[] {
    const words = this.tokenizeWords(sentence)
    const chunks: string[] = []

    for (let i = 0; i < words.length; i += maxWords) {
      const chunk = words.slice(i, i + maxWords)
      chunks.push(chunk.join(' '))
    }

    return chunks
  }

  /**
   * Count words in text
   * @param text - Text to count
   * @returns Number of words
   */
  private countWords(text: string): number {
    return this.tokenizeWords(text).length
  }

  /**
   * Unicode-aware word tokenization
   * Splits on whitespace and handles punctuation correctly
   * @param text - Text to tokenize
   * @returns Array of words
   */
  private tokenizeWords(text: string): string[] {
    return text
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0)
  }
}

// Singleton instance
export const chunkerService = new ChunkerService()
