const MAX_WORDS_PER_SLIDE = 60
const TARGET_SENTENCES_PER_SLIDE = 2

export class ChunkerService {
  /**
   * Chunk text into slides: 2 sentences or 50 words max per slide
   * @param text - Full chapter text
   * @returns Array of slide texts
   */
  chunkText(text: string): string[] {
    // Handle empty or whitespace-only text
    if (!text || text.trim().length === 0) {
      return []
    }

    const sentences = this.splitIntoSentences(text)
    return this.groupSentencesIntoSlides(sentences)
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
   * Group sentences into slides: 2 sentences per slide, max 50 words
   * @param sentences - Array of sentences
   * @returns Array of slide texts
   */
  private groupSentencesIntoSlides(sentences: string[]): string[] {
    const slides: string[] = []
    let currentSlide: string[] = []
    let currentWordCount = 0

    for (const sentence of sentences) {
      const sentenceWords = this.countWords(sentence)

      // If single sentence exceeds max words, split it
      if (sentenceWords > MAX_WORDS_PER_SLIDE) {
        // Save current slide if not empty
        if (currentSlide.length > 0) {
          slides.push(currentSlide.join(' '))
          currentSlide = []
          currentWordCount = 0
        }

        // Split long sentence and add chunks as individual slides
        const chunks = this.splitLongSentence(sentence, MAX_WORDS_PER_SLIDE)
        for (const chunk of chunks) {
          slides.push(chunk)
        }
        continue
      }

      // Check if adding this sentence would exceed max words
      if (currentWordCount + sentenceWords > MAX_WORDS_PER_SLIDE) {
        // Save current slide and start new one
        if (currentSlide.length > 0) {
          slides.push(currentSlide.join(' '))
        }
        currentSlide = [sentence]
        currentWordCount = sentenceWords
      } else {
        // Add sentence to current slide
        currentSlide.push(sentence)
        currentWordCount += sentenceWords

        // If we've reached target sentence count, save the slide
        if (currentSlide.length >= TARGET_SENTENCES_PER_SLIDE) {
          slides.push(currentSlide.join(' '))
          currentSlide = []
          currentWordCount = 0
        }
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
