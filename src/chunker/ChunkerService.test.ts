import { describe, expect, test } from 'bun:test'
import { ChunkerService } from './ChunkerService'

describe('ChunkerService', () => {
  const chunker = new ChunkerService()

  describe('chunkText', () => {
    test('creates slides with 2 sentences when both fit under 50 words', () => {
      const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.'

      const result = chunker.chunkText(text)

      expect(result).toEqual([
        'First sentence. Second sentence.',
        'Third sentence. Fourth sentence.',
      ])
    })

    test('creates slides with 1 sentence if 2 sentences exceed 50 words', () => {
      // Create 2 sentences that together exceed 50 words (26 words each = 52 total)
      const sentence1 = 'This is the first sentence which definitely has exactly twenty six words to ensure it exceeds the fifty word limit when combined together with the next.'
      const sentence2 = 'This is the second sentence which also definitely has exactly twenty six words to ensure it exceeds the fifty word limit when combined with previous.'
      const text = `${sentence1} ${sentence2}`

      const result = chunker.chunkText(text)

      // Each sentence should be its own slide since together they exceed 50 words
      expect(result).toHaveLength(2)
      expect(result[0]).toBe(sentence1)
      expect(result[1]).toBe(sentence2)
    })

    test('splits single sentence if it exceeds 50 words', () => {
      // Create a very long sentence (over 50 words - this one has 60)
      const text = 'This is a genuinely very long sentence that definitely has way more than exactly fifty words in it and therefore absolutely should definitely be split across multiple slides because it clearly exceeds the maximum word limit of exactly fifty words per slide so it absolutely needs to be chunked at word boundaries to fit.'

      const result = chunker.chunkText(text)

      expect(result.length).toBeGreaterThan(1)
      // Each slide should have at most 50 words
      result.forEach((slide) => {
        const wordCount = slide.split(/\s+/).filter(w => w.length > 0).length
        expect(wordCount).toBeLessThanOrEqual(50)
      })
    })

    test('handles text with less than 2 sentences', () => {
      const text = 'Single sentence.'

      const result = chunker.chunkText(text)

      expect(result).toEqual(['Single sentence.'])
    })

    test('handles empty text', () => {
      const text = ''

      const result = chunker.chunkText(text)

      expect(result).toEqual([])
    })

    test('handles text with only whitespace', () => {
      const text = '   \n\n  \t  '

      const result = chunker.chunkText(text)

      expect(result).toEqual([])
    })

    test('handles different punctuation marks', () => {
      const text = 'Question? Exclamation! Statement. Another one.'

      const result = chunker.chunkText(text)

      expect(result).toEqual([
        'Question? Exclamation!',
        'Statement. Another one.',
      ])
    })

    test('handles text with no sentence boundaries', () => {
      const text = 'This is text without any punctuation at all'

      const result = chunker.chunkText(text)

      expect(result).toEqual(['This is text without any punctuation at all'])
    })

    test('handles three short sentences - groups into 2+1', () => {
      const text = 'Short. Also short. Third short.'

      const result = chunker.chunkText(text)

      expect(result).toEqual([
        'Short. Also short.',
        'Third short.',
      ])
    })

    test('handles five short sentences - groups into 2+2+1', () => {
      const text = 'One. Two. Three. Four. Five.'

      const result = chunker.chunkText(text)

      expect(result).toEqual([
        'One. Two.',
        'Three. Four.',
        'Five.',
      ])
    })

    test('preserves sentence punctuation', () => {
      const text = 'Hello! How are you? I am fine. Thanks.'

      const result = chunker.chunkText(text)

      result.forEach((slide) => {
        // Each slide should contain proper punctuation
        expect(slide).toMatch(/[.!?]/)
      })
    })

    test('handles real-world book text', () => {
      const text = `It was the best of times, it was the worst of times. It was the age of wisdom, it was the age of foolishness. It was the epoch of belief, it was the epoch of incredulity.`

      const result = chunker.chunkText(text)

      // Should create 2-sentence chunks
      expect(result.length).toBeGreaterThan(1)
      result.forEach((slide) => {
        const wordCount = slide.split(/\s+/).filter(w => w.length > 0).length
        // Should never exceed 50 words
        expect(wordCount).toBeLessThanOrEqual(50)
      })
    })

    test('handles quoted text', () => {
      // The sentence regex may not handle inline quotes perfectly, just ensure it doesn't break
      const text = '"Hello," she said. "How are you?" he asked. "I am fine," she replied. "Great to hear!" he said.'

      const result = chunker.chunkText(text)

      // Just verify it produces chunks and doesn't crash
      expect(result.length).toBeGreaterThan(0)
      result.forEach((slide) => {
        const wordCount = slide.split(/\s+/).filter(w => w.length > 0).length
        expect(wordCount).toBeLessThanOrEqual(50)
      })
    })

    test('deterministic output for same input', () => {
      const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.'

      const result1 = chunker.chunkText(text)
      const result2 = chunker.chunkText(text)

      expect(result1).toEqual(result2)
    })

    test('handles mixed sentence lengths', () => {
      const shortSentence = 'Short.'
      const mediumSentence = 'This is a medium length sentence with about ten words in it.'
      const text = `${shortSentence} ${mediumSentence} ${shortSentence} ${mediumSentence}`

      const result = chunker.chunkText(text)

      // Should group into 2-sentence chunks where possible
      expect(result.length).toBeGreaterThan(0)
      result.forEach((slide) => {
        const wordCount = slide.split(/\s+/).filter(w => w.length > 0).length
        expect(wordCount).toBeLessThanOrEqual(50)
      })
    })
  })
})
