import { describe, it, expect, beforeEach } from 'vitest'
import { ChunkerService } from './ChunkerService'
import type { ChapterInput } from './types'

describe('ChunkerService', () => {
  let chunker: ChunkerService

  beforeEach(() => {
    chunker = new ChunkerService()
  })

  describe('Basic chunking', () => {
    it('should chunk a simple chapter into slides', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: 'This is a test paragraph with exactly ten words here now and more.',
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides).toHaveLength(1)
      expect(result.slides[0]?.chapter).toBe(0)
      expect(result.slides[0]?.words).toBe(13)
      expect(result.totalSlides).toBe(1)
      expect(result.totalWords).toBe(13)
    })

    it('should create multiple slides for long text', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: Array(100).fill('word').join(' '),
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides.length).toBeGreaterThan(1)
      expect(result.totalWords).toBe(100)
    })

    it('should preserve chapter numbers', () => {
      const chapters: ChapterInput[] = [
        { chapter: 0, text: 'Chapter zero content here.' },
        { chapter: 1, text: 'Chapter one content here.' },
        { chapter: 2, text: 'Chapter two content here.' },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides[0]?.chapter).toBe(0)
      expect(result.slides[1]?.chapter).toBe(1)
      expect(result.slides[2]?.chapter).toBe(2)
    })

    it('should assign sequential slide indices', () => {
      const chapters: ChapterInput[] = [
        { chapter: 0, text: 'First chapter.' },
        { chapter: 1, text: 'Second chapter.' },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides[0]?.slideIndex).toBe(0)
      expect(result.slides[1]?.slideIndex).toBe(1)
    })

    it('should include bookId in all slides', () => {
      const chapters: ChapterInput[] = [
        { chapter: 0, text: 'Test content.' },
      ]

      const result = chunker.split('book-123', chapters, 50)

      expect(result.slides[0]?.bookId).toBe('book-123')
    })
  })

  describe('Paragraph awareness', () => {
    it('should preserve paragraph breaks', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: 'First paragraph with some words.\n\nSecond paragraph with more words.',
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides[0]?.text).toContain('\n\n')
    })

    it('should prefer breaking at paragraph boundaries', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: Array(30).fill('word').join(' ') + '\n\n' + Array(30).fill('word').join(' '),
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides.length).toBeGreaterThan(1)
      // Each slide should be close to 30 words (paragraph boundary)
      expect(result.slides[0]?.words).toBeLessThanOrEqual(55)
    })

    it('should handle multiple paragraphs in one slide', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: 'Short para one.\n\nShort para two.\n\nShort para three.',
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides).toHaveLength(1)
      expect(result.slides[0]?.text).toContain('\n\n')
    })
  })

  describe('Long paragraph handling', () => {
    it('should hard-wrap long paragraphs at target word count', () => {
      const longParagraph = Array(150).fill('word').join(' ')
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: longParagraph,
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides.length).toBeGreaterThanOrEqual(3)
      // Most slides should be at or near target
      const wordsPerSlide = result.slides.map((s) => s.words)
      expect(wordsPerSlide[0]).toBe(50)
      expect(wordsPerSlide[1]).toBe(50)
    })

    it('should handle last slide being short', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: Array(75).fill('word').join(' '),
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides).toHaveLength(2)
      expect(result.slides[0]?.words).toBe(50)
      expect(result.slides[1]?.words).toBe(25) // Short last slide
    })
  })

  describe('Target word count', () => {
    it('should respect custom target word count', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: Array(100).fill('word').join(' '),
        },
      ]

      const result = chunker.split('book-1', chapters, 30)

      // Should create more slides with smaller target
      expect(result.slides.length).toBeGreaterThanOrEqual(3)
      expect(result.slides[0]?.words).toBeLessThanOrEqual(35)
    })

    it('should default to 50 words', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: Array(100).fill('word').join(' '),
        },
      ]

      const result = chunker.split('book-1', chapters)

      expect(result.slides.length).toBeGreaterThanOrEqual(2)
      expect(result.slides[0]?.words).toBeLessThanOrEqual(55)
    })

    it('should allow ±5 word flexibility', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: Array(53).fill('word').join(' ') + '\n\n' + 'Extra paragraph.',
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      // Should fit both in one slide (53 + 2 = 55, within range)
      expect(result.slides).toHaveLength(1)
      expect(result.slides[0]?.words).toBe(55)
    })
  })

  describe('Word tokenization', () => {
    it('should handle Unicode text', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: 'Hello 世界 test 文字 here and more words.',
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides).toHaveLength(1)
      expect(result.totalWords).toBeGreaterThan(0)
    })

    it('should handle hyphens', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: 'This is a well-known fact about twenty-first century technology.',
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides).toHaveLength(1)
      expect(result.totalWords).toBe(9) // Hyphens count as single words
    })

    it('should handle punctuation', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: 'Hello, world! How are you? I am fine, thanks.',
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides).toHaveLength(1)
      expect(result.totalWords).toBe(9)
    })

    it('should handle apostrophes', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: "It's a beautiful day. We're going to the park.",
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides).toHaveLength(1)
      expect(result.totalWords).toBe(9)
    })

    it('should handle quotes', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: '"Hello," she said. "How are you today?" he replied.',
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides).toHaveLength(1)
      expect(result.totalWords).toBe(9)
    })

    it('should handle ellipsis', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: 'Well... I think... maybe we should go.',
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides).toHaveLength(1)
      expect(result.totalWords).toBe(7)
    })

    it('should collapse multiple spaces', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: 'This  has    multiple     spaces between words.',
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides).toHaveLength(1)
      expect(result.totalWords).toBe(6)
    })
  })

  describe('Edge cases', () => {
    it('should handle empty chapters', () => {
      const chapters: ChapterInput[] = [
        { chapter: 0, text: '' },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides).toHaveLength(0)
      expect(result.totalWords).toBe(0)
    })

    it('should handle chapters with only whitespace', () => {
      const chapters: ChapterInput[] = [
        { chapter: 0, text: '   \n\n   ' },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides).toHaveLength(0)
      expect(result.totalWords).toBe(0)
    })

    it('should handle very short chapters', () => {
      const chapters: ChapterInput[] = [
        { chapter: 0, text: 'One.' },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides).toHaveLength(1)
      expect(result.slides[0]?.words).toBe(1)
    })

    it('should handle multiple empty paragraphs', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: 'First.\n\n\n\n\n\nSecond.',
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides).toHaveLength(1)
      expect(result.slides[0]?.text).toContain('\n\n')
    })

    it('should not create empty slides', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: Array(100).fill('word').join(' '),
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      for (const slide of result.slides) {
        expect(slide.text.trim().length).toBeGreaterThan(0)
        expect(slide.words).toBeGreaterThan(0)
      }
    })

    it('should not create duplicate slides', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: Array(100)
            .fill(0)
            .map((_, i) => `word${i}`)
            .join(' '),
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      const texts = result.slides.map((s) => s.text)
      const uniqueTexts = new Set(texts)
      expect(uniqueTexts.size).toBe(texts.length)
    })
  })

  describe('Statistics', () => {
    it('should calculate correct total words', () => {
      const chapters: ChapterInput[] = [
        { chapter: 0, text: Array(50).fill('word').join(' ') },
        { chapter: 1, text: Array(30).fill('word').join(' ') },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.totalWords).toBe(80)
    })

    it('should calculate average words per slide', () => {
      const chapters: ChapterInput[] = [
        { chapter: 0, text: Array(100).fill('word').join(' ') },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.averageWordsPerSlide).toBeGreaterThan(0)
      expect(result.averageWordsPerSlide).toBeLessThanOrEqual(50)
    })

    it('should handle zero slides gracefully', () => {
      const chapters: ChapterInput[] = []

      const result = chunker.split('book-1', chapters, 50)

      expect(result.totalSlides).toBe(0)
      expect(result.totalWords).toBe(0)
      expect(result.averageWordsPerSlide).toBe(0)
    })
  })

  describe('Deterministic output', () => {
    it('should produce consistent output for same input', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: 'Deterministic content with multiple words here.',
        },
      ]

      const result1 = chunker.split('book-1', chapters, 50)
      const result2 = chunker.split('book-1', chapters, 50)

      expect(result1.slides.length).toBe(result2.slides.length)
      expect(result1.slides[0]?.text).toBe(result2.slides[0]?.text)
      expect(result1.totalWords).toBe(result2.totalWords)
    })
  })

  describe('Real-world scenarios', () => {
    it('should handle footnotes and brackets', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: 'This is a sentence[1] with a footnote. See reference[2] here.',
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides).toHaveLength(1)
      expect(result.totalWords).toBeGreaterThan(0)
    })

    it('should handle long quotes', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: '"This is a very long quote that goes on and on and on and on and has many words in it," said the author.',
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides).toHaveLength(1)
      expect(result.slides[0]?.text).toContain('"')
    })

    it('should handle numbers and dates', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: 'On January 1, 2024, at 3:00 PM, there were 1,234 people present.',
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides).toHaveLength(1)
      expect(result.totalWords).toBeGreaterThan(0)
    })

    it('should handle mixed content types', () => {
      const chapters: ChapterInput[] = [
        {
          chapter: 0,
          text: 'Paragraph one.\n\nParagraph two.\n\n' + Array(60).fill('word').join(' '),
        },
      ]

      const result = chunker.split('book-1', chapters, 50)

      expect(result.slides.length).toBeGreaterThan(1)
      expect(result.totalWords).toBeGreaterThan(60)
    })
  })
})
