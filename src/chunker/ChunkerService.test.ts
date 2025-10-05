import { describe, expect, test } from 'bun:test'
import { ChunkerService } from './ChunkerService'
import type { ChunkConfig } from './types'

describe('ChunkerService', () => {
  const chunker = new ChunkerService()

  describe('chunkText', () => {
    test('chunks text at sentence boundaries', () => {
      const text = 'First sentence. Second sentence. Third sentence.'
      const config: ChunkConfig = { maxWords: 4 }

      const result = chunker.chunkText(text, config)

      expect(result).toEqual([
        'First sentence. Second sentence.',
        'Third sentence.',
      ])
    })

    test('respects maxWords limit', () => {
      const text = 'One two three four five six seven eight nine ten.'
      const config: ChunkConfig = { maxWords: 5 }

      const result = chunker.chunkText(text, config)

      // Should split into 2 slides: [One two three four five] [six seven eight nine ten.]
      expect(result).toHaveLength(2)
      expect(result[0].split(/\s+/).length).toBeLessThanOrEqual(5)
    })

    test('handles multiple sentences in one slide', () => {
      const text = 'Short. Also short. Still short.'
      const config: ChunkConfig = { maxWords: 10 }

      const result = chunker.chunkText(text, config)

      expect(result).toEqual(['Short. Also short. Still short.'])
    })

    test('splits long sentences across slides', () => {
      const text = 'This is a very long sentence with many many words that exceeds the maximum word limit.'
      const config: ChunkConfig = { maxWords: 5 }

      const result = chunker.chunkText(text, config)

      expect(result.length).toBeGreaterThan(1)
      // Each slide should have roughly maxWords
      result.forEach((slide) => {
        const wordCount = slide.split(/\s+/).length
        expect(wordCount).toBeLessThanOrEqual(6) // Allow small overflow for splitting
      })
    })

    test('handles text with no sentence boundaries', () => {
      const text = 'This is text without any punctuation at all'
      const config: ChunkConfig = { maxWords: 5 }

      const result = chunker.chunkText(text, config)

      expect(result.length).toBeGreaterThan(0)
    })

    test('handles empty text', () => {
      const text = ''
      const config: ChunkConfig = { maxWords: 50 }

      const result = chunker.chunkText(text, config)

      expect(result).toEqual([])
    })

    test('handles text with only whitespace', () => {
      const text = '   \n\n  \t  '
      const config: ChunkConfig = { maxWords: 50 }

      const result = chunker.chunkText(text, config)

      expect(result).toEqual([])
    })

    test('handles different punctuation marks', () => {
      const text = 'Question? Exclamation! Statement.'
      const config: ChunkConfig = { maxWords: 2 }

      const result = chunker.chunkText(text, config)

      expect(result).toEqual([
        'Question? Exclamation!',
        'Statement.',
      ])
    })

    test('handles paragraphs with multiple sentences', () => {
      const text = `First paragraph sentence one. First paragraph sentence two.

Second paragraph sentence one. Second paragraph sentence two.`
      const config: ChunkConfig = { maxWords: 10 }

      const result = chunker.chunkText(text, config)

      expect(result.length).toBeGreaterThan(0)
      // Should preserve sentence boundaries
      result.forEach((slide) => {
        expect(slide.trim().length).toBeGreaterThan(0)
      })
    })

    test('uses DEFAULT_CHUNK_CONFIG when no config provided', () => {
      const text = 'This is a test sentence with some words.'

      const result = chunker.chunkText(text)

      expect(result).toHaveLength(1) // Should fit in default 50 words
    })

    test('handles very small maxWords', () => {
      const text = 'One. Two. Three.'
      const config: ChunkConfig = { maxWords: 1 }

      const result = chunker.chunkText(text, config)

      expect(result).toEqual(['One.', 'Two.', 'Three.'])
    })

    test('handles very large maxWords', () => {
      const text = 'Short text.'
      const config: ChunkConfig = { maxWords: 1000 }

      const result = chunker.chunkText(text, config)

      expect(result).toEqual(['Short text.'])
    })

    test('preserves sentence punctuation', () => {
      const text = 'Hello! How are you? I am fine.'
      const config: ChunkConfig = { maxWords: 5 }

      const result = chunker.chunkText(text, config)

      result.forEach((slide) => {
        // Each slide should contain proper punctuation
        expect(slide).toMatch(/[.!?]/)
      })
    })

    test('handles consecutive punctuation', () => {
      const text = 'What?! Really?! No way!'
      const config: ChunkConfig = { maxWords: 3 }

      const result = chunker.chunkText(text, config)

      expect(result.length).toBeGreaterThan(0)
    })

    test('handles real-world book text', () => {
      const text = `It was the best of times, it was the worst of times. It was the age of wisdom, it was the age of foolishness. It was the epoch of belief, it was the epoch of incredulity.`
      const config: ChunkConfig = { maxWords: 20 }

      const result = chunker.chunkText(text, config)

      expect(result.length).toBeGreaterThan(1)
      result.forEach((slide) => {
        const wordCount = slide.split(/\s+/).length
        // Should be close to maxWords
        expect(wordCount).toBeLessThanOrEqual(25)
      })
    })

    test('handles ellipsis in text', () => {
      const text = 'Well... maybe. Not sure... really.'
      const config: ChunkConfig = { maxWords: 5 }

      const result = chunker.chunkText(text, config)

      expect(result.length).toBeGreaterThan(0)
    })

    test('handles quoted text', () => {
      const text = '"Hello," she said. "How are you?"'
      const config: ChunkConfig = { maxWords: 5 }

      const result = chunker.chunkText(text, config)

      expect(result.length).toBeGreaterThan(0)
    })

    test('sentence-aware: prefers sentence boundary over word count', () => {
      // Three short sentences that together exceed maxWords
      const text = 'One two three four five. Six seven eight. Nine ten.'
      const config: ChunkConfig = { maxWords: 6 }

      const result = chunker.chunkText(text, config)

      // First sentence (5 words) < 6, so it's added
      // Second sentence (3 words): 5+3=8 > 6, so start new slide
      // Third sentence (2 words): 3+2=5 < 6, so add to current slide
      expect(result).toHaveLength(2)
      expect(result[0]).toBe('One two three four five.')
      expect(result[1]).toBe('Six seven eight. Nine ten.')
    })

    test('deterministic output for same input', () => {
      const text = 'Deterministic sentence. Another sentence. Final one.'
      const config: ChunkConfig = { maxWords: 5 }

      const result1 = chunker.chunkText(text, config)
      const result2 = chunker.chunkText(text, config)

      expect(result1).toEqual(result2)
    })
  })
})
