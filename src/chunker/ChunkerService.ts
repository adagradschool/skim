export const DEFAULT_MAX_CHARS_PER_SLIDE = 300

export class ChunkerService {
  private readonly maxChars: number

  constructor(maxChars: number = DEFAULT_MAX_CHARS_PER_SLIDE) {
    if (!Number.isFinite(maxChars) || maxChars < 1) {
      throw new Error('maxChars must be a positive number')
    }
    this.maxChars = Math.floor(maxChars)
  }

  /**
   * Character-budget chunking.
   *
   * - Whole sentences are packed into a slide while the slide stays within
   *   the character budget (length of the joined text, spaces included).
   * - A sentence that does not fit in the remaining space starts a new slide.
   * - A sentence longer than the budget on its own is split at word
   *   boundaries; it fills whatever room the current slide has left, and the
   *   remainder flows on, so later sentences can still join the tail piece.
   * - A single word longer than the budget is hard-split.
   * - No slide ever exceeds the budget and no text is lost.
   *
   * @param text - Full chapter text
   * @returns Array of slide texts
   */
  chunkText(text: string): string[] {
    if (!text || text.trim().length === 0) {
      return []
    }

    const slides: string[] = []
    let buffer = ''

    const flush = () => {
      if (buffer.length > 0) {
        slides.push(buffer)
        buffer = ''
      }
    }

    const append = (piece: string) => {
      buffer = buffer.length === 0 ? piece : `${buffer} ${piece}`
    }

    const fits = (piece: string) =>
      buffer.length === 0 ? piece.length <= this.maxChars : buffer.length + 1 + piece.length <= this.maxChars

    for (const sentence of this.splitIntoSentences(text)) {
      if (fits(sentence)) {
        append(sentence)
        continue
      }

      if (sentence.length <= this.maxChars) {
        // Fits on a fresh slide: keep the sentence whole.
        flush()
        append(sentence)
        continue
      }

      // Longer than a whole slide: flow word by word.
      for (const word of this.tokenizeWords(sentence)) {
        if (fits(word)) {
          append(word)
          continue
        }
        flush()
        if (word.length <= this.maxChars) {
          append(word)
          continue
        }
        // Single oversize token: hard split.
        const pieces = this.hardSplit(word)
        for (let i = 0; i < pieces.length - 1; i++) {
          slides.push(pieces[i]!)
        }
        append(pieces[pieces.length - 1]!)
      }
    }

    flush()
    return slides
  }

  /**
   * Split text into sentences using simple regex
   * Handles: . ! ? with proper spacing
   * Can be swapped for more sophisticated NLP later
   */
  private splitIntoSentences(text: string): string[] {
    const sentenceRegex = /[^.!?]+[.!?]+(?:\s+|$)/g
    const matches = text.match(sentenceRegex)

    if (!matches) {
      return [this.normalizeWhitespace(text)]
    }

    const sentences = matches.map((s) => this.normalizeWhitespace(s)).filter((s) => s.length > 0)

    // Text after the last terminator (no closing punctuation) is still content.
    const consumed = matches.join('')
    const tail = this.normalizeWhitespace(text.slice(text.indexOf(consumed) + consumed.length))
    if (tail.length > 0) {
      sentences.push(tail)
    }

    return sentences
  }

  private normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim()
  }

  private tokenizeWords(text: string): string[] {
    return text.split(/\s+/).filter((w) => w.length > 0)
  }

  private hardSplit(word: string): string[] {
    const pieces: string[] = []
    for (let i = 0; i < word.length; i += this.maxChars) {
      pieces.push(word.slice(i, i + this.maxChars))
    }
    return pieces
  }
}

// Singleton instance
export const chunkerService = new ChunkerService()
