const MAX_WORDS_PER_SLIDE = 60
const TARGET_SENTENCES_PER_SLIDE = 2

export class ChunkerService {
  /**
   * NEW ALGORITHM: 2 sentences capped at 60 words, spillover to next slide
   * - Add next 2 sentences to buffer
   * - If total > 60 words: take first 60 words, carry remainder to next slide
   * - Fragment counts as 1 "sentence" for the 2-sentence target
   *
   * @param text - Full chapter text
   * @returns Array of slide texts
   */
  chunkText(text: string): string[] {
    // Handle empty or whitespace-only text
    if (!text || text.trim().length === 0) {
      return []
    }

    const sentences = this.splitIntoSentences(text)
    return this.chunkWithCarryover(sentences)
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

    return matches.map((s) => s.trim()).filter((s) => s.length > 0)
  }

  /**
   * Chunk sentences with carry-over logic
   * @param sentences - Array of sentences
   * @returns Array of slide texts
   */
  private chunkWithCarryover(sentences: string[]): string[] {
    const slides: string[] = []
    let carryover: string[] = [] // Words carried over from previous slide
    let sentenceIndex = 0

    while (sentenceIndex < sentences.length || carryover.length > 0) {
      // Start building current slide buffer
      let buffer: string[] = [...carryover]
      let sentencesAdded = carryover.length > 0 ? 1 : 0 // Carryover counts as 1 sentence

      // Add sentences until we reach target (2 sentences)
      while (sentencesAdded < TARGET_SENTENCES_PER_SLIDE && sentenceIndex < sentences.length) {
        const sentenceWords = this.tokenizeWords(sentences[sentenceIndex])
        buffer.push(...sentenceWords)
        sentencesAdded++
        sentenceIndex++
      }

      // No more content
      if (buffer.length === 0) {
        break
      }

      // Check if buffer exceeds max words
      if (buffer.length > MAX_WORDS_PER_SLIDE) {
        // Take first 60 words for this slide
        const slideWords = buffer.slice(0, MAX_WORDS_PER_SLIDE)
        slides.push(slideWords.join(' '))

        // Carry remainder to next slide
        carryover = buffer.slice(MAX_WORDS_PER_SLIDE)
      } else {
        // Buffer fits, emit as slide
        slides.push(buffer.join(' '))
        carryover = []
      }
    }

    return slides
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
