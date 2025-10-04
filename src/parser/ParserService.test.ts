import { describe, it, expect, beforeAll } from 'vitest'
import { ParserService } from './ParserService'
import { createTestEpub } from './test-helpers'
import type { ParseProgress } from './types'

describe('ParserService', () => {
  let parser: ParserService

  beforeAll(() => {
    parser = new ParserService()
  })

  describe('Basic parsing', () => {
    it('should parse a simple EPUB with one chapter', async () => {
      const epub = await createTestEpub([
        {
          title: 'Chapter 1',
          content: '<p>This is a test paragraph with exactly ten words here now.</p>',
        },
      ])

      const result = await parser.parse(epub)

      expect(result.chapters).toHaveLength(1)
      expect(result.chapters[0]?.title).toBe('Chapter 1')
      expect(result.chapters[0]?.text).toContain('This is a test paragraph')
      expect(result.metadata.title).toBe('Test Book')
      expect(result.metadata.author).toBe('Test Author')
      expect(result.parseTimeMs).toBeGreaterThan(0)
      expect(result.totalWords).toBeGreaterThan(0)
    })

    it('should parse EPUB with multiple chapters', async () => {
      const epub = await createTestEpub([
        {
          title: 'Chapter 1',
          content: '<p>First chapter content.</p>',
        },
        {
          title: 'Chapter 2',
          content: '<p>Second chapter content.</p>',
        },
        {
          title: 'Chapter 3',
          content: '<p>Third chapter content.</p>',
        },
      ])

      const result = await parser.parse(epub)

      expect(result.chapters).toHaveLength(3)
      expect(result.chapters[0]?.title).toBe('Chapter 1')
      expect(result.chapters[1]?.title).toBe('Chapter 2')
      expect(result.chapters[2]?.title).toBe('Chapter 3')
    })

    it('should preserve chapter order', async () => {
      const epub = await createTestEpub([
        { title: 'Preface', content: '<p>Preface text.</p>' },
        { title: 'Chapter 1', content: '<p>Chapter one.</p>' },
        { title: 'Chapter 2', content: '<p>Chapter two.</p>' },
        { title: 'Epilogue', content: '<p>Epilogue text.</p>' },
      ])

      const result = await parser.parse(epub)

      expect(result.chapters).toHaveLength(4)
      expect(result.chapters[0]?.chapter).toBe(0)
      expect(result.chapters[1]?.chapter).toBe(1)
      expect(result.chapters[2]?.chapter).toBe(2)
      expect(result.chapters[3]?.chapter).toBe(3)
    })
  })

  describe('Text extraction', () => {
    it('should extract text from paragraphs', async () => {
      const epub = await createTestEpub([
        {
          title: 'Test',
          content: '<p>First paragraph.</p><p>Second paragraph.</p>',
        },
      ])

      const result = await parser.parse(epub)
      const text = result.chapters[0]?.text || ''

      expect(text).toContain('First paragraph')
      expect(text).toContain('Second paragraph')
    })

    it('should preserve paragraph breaks', async () => {
      const epub = await createTestEpub([
        {
          title: 'Test',
          content: '<p>Paragraph one.</p><p>Paragraph two.</p><p>Paragraph three.</p>',
        },
      ])

      const result = await parser.parse(epub)
      const text = result.chapters[0]?.text || ''

      // Should have double newlines between paragraphs
      expect(text).toMatch(/Paragraph one\.\s*\n\s*\n\s*Paragraph two\./)
      expect(text).toMatch(/Paragraph two\.\s*\n\s*\n\s*Paragraph three\./)
    })

    it('should remove HTML tags', async () => {
      const epub = await createTestEpub([
        {
          title: 'Test',
          content: '<p>Text with <strong>bold</strong> and <em>italic</em> formatting.</p>',
        },
      ])

      const result = await parser.parse(epub)
      const text = result.chapters[0]?.text || ''

      expect(text).not.toContain('<strong>')
      expect(text).not.toContain('<em>')
      expect(text).toContain('Text with bold and italic formatting')
    })

    it('should remove scripts and styles', async () => {
      const epub = await createTestEpub([
        {
          title: 'Test',
          content: `
            <script>alert('test')</script>
            <style>body { color: red; }</style>
            <p>Visible text.</p>
          `,
        },
      ])

      const result = await parser.parse(epub)
      const text = result.chapters[0]?.text || ''

      expect(text).not.toContain('alert')
      expect(text).not.toContain('color: red')
      expect(text).toContain('Visible text')
    })

    it('should handle headings', async () => {
      const epub = await createTestEpub([
        {
          title: 'Test',
          content: '<h2>Section Title</h2><p>Section content.</p>',
        },
      ])

      const result = await parser.parse(epub)
      const text = result.chapters[0]?.text || ''

      expect(text).toContain('Section Title')
      expect(text).toContain('Section content')
    })

    it('should handle lists', async () => {
      const epub = await createTestEpub([
        {
          title: 'Test',
          content: '<ul><li>Item one</li><li>Item two</li><li>Item three</li></ul>',
        },
      ])

      const result = await parser.parse(epub)
      const text = result.chapters[0]?.text || ''

      expect(text).toContain('Item one')
      expect(text).toContain('Item two')
      expect(text).toContain('Item three')
    })

    it('should handle blockquotes', async () => {
      const epub = await createTestEpub([
        {
          title: 'Test',
          content: '<blockquote><p>This is a quote.</p></blockquote>',
        },
      ])

      const result = await parser.parse(epub)
      const text = result.chapters[0]?.text || ''

      expect(text).toContain('This is a quote')
    })
  })

  describe('Text normalization', () => {
    it('should collapse multiple spaces', async () => {
      const epub = await createTestEpub([
        {
          title: 'Test',
          content: '<p>Text  with    multiple     spaces.</p>',
        },
      ])

      const result = await parser.parse(epub)
      const text = result.chapters[0]?.text || ''

      expect(text).not.toMatch(/  +/)
      expect(text).toContain('Text with multiple spaces')
    })

    it('should remove zero-width characters', async () => {
      const epub = await createTestEpub([
        {
          title: 'Test',
          content: '<p>Text\u200Bwith\u200Czero\u200Dwidth\uFEFFchars.</p>',
        },
      ])

      const result = await parser.parse(epub)
      const text = result.chapters[0]?.text || ''

      expect(text).not.toContain('\u200B')
      expect(text).not.toContain('\u200C')
      expect(text).not.toContain('\u200D')
      expect(text).not.toContain('\uFEFF')
    })

    it('should trim whitespace from lines', async () => {
      const epub = await createTestEpub([
        {
          title: 'Test',
          content: '<p>  Indented text.  </p>',
        },
      ])

      const result = await parser.parse(epub)
      const text = result.chapters[0]?.text || ''

      expect(text).toBe('Indented text.')
    })

    it('should collapse excessive newlines', async () => {
      const epub = await createTestEpub([
        {
          title: 'Test',
          content: '<p>First.</p><br/><br/><br/><p>Second.</p>',
        },
      ])

      const result = await parser.parse(epub)
      const text = result.chapters[0]?.text || ''

      // Should not have more than 2 consecutive newlines
      expect(text).not.toMatch(/\n{3,}/)
    })
  })

  describe('Metadata extraction', () => {
    it('should extract title and author', async () => {
      const epub = await createTestEpub([
        {
          title: 'Chapter 1',
          content: '<p>Content.</p>',
        },
      ])

      const result = await parser.parse(epub)

      expect(result.metadata.title).toBe('Test Book')
      expect(result.metadata.author).toBe('Test Author')
    })
  })

  describe('Word counting', () => {
    it('should count words correctly', async () => {
      const epub = await createTestEpub([
        {
          title: 'Test',
          content: '<p>One two three four five six seven eight nine ten.</p>',
        },
      ])

      const result = await parser.parse(epub)

      expect(result.totalWords).toBe(10)
    })

    it('should count words across multiple chapters', async () => {
      const epub = await createTestEpub([
        {
          title: 'Chapter 1',
          content: '<p>Five words in chapter one.</p>',
        },
        {
          title: 'Chapter 2',
          content: '<p>Six words in chapter two here.</p>',
        },
      ])

      const result = await parser.parse(epub)

      // 5 + 6 = 11 words total
      expect(result.totalWords).toBe(11)
    })

    it('should handle Unicode text in word counting', async () => {
      const epub = await createTestEpub([
        {
          title: 'Test',
          content: '<p>Hello世界test文字here.</p>',
        },
      ])

      const result = await parser.parse(epub)

      expect(result.totalWords).toBeGreaterThan(0)
    })
  })

  describe('Performance metrics', () => {
    it('should measure parse time', async () => {
      const epub = await createTestEpub([
        {
          title: 'Test',
          content: '<p>Content.</p>',
        },
      ])

      const result = await parser.parse(epub)

      expect(result.parseTimeMs).toBeGreaterThan(0)
      expect(result.parseTimeMs).toBeLessThan(5000) // Should be fast for small file
    })
  })

  describe('Progress callbacks', () => {
    it('should call progress callback during parsing', async () => {
      const epub = await createTestEpub([
        {
          title: 'Chapter 1',
          content: '<p>Content 1.</p>',
        },
        {
          title: 'Chapter 2',
          content: '<p>Content 2.</p>',
        },
      ])

      const progressUpdates: ParseProgress[] = []

      await parser.parse(epub, (progress) => {
        progressUpdates.push(progress)
      })

      expect(progressUpdates.length).toBeGreaterThan(0)
      expect(progressUpdates.some((p) => p.stage === 'loading')).toBe(true)
      expect(progressUpdates.some((p) => p.stage === 'extracting')).toBe(true)
      expect(progressUpdates.some((p) => p.stage === 'normalizing')).toBe(true)
      expect(progressUpdates.some((p) => p.stage === 'complete')).toBe(true)
    })
  })

  describe('Error handling', () => {
    it('should throw error for invalid EPUB', async () => {
      const invalidData = new ArrayBuffer(100)

      await expect(parser.parse(invalidData)).rejects.toThrow()
    })

    it('should handle empty EPUB gracefully', async () => {
      const epub = await createTestEpub([])

      const result = await parser.parse(epub)

      expect(result.chapters).toHaveLength(0)
      expect(result.totalWords).toBe(0)
    })
  })

  describe('Real-world fixtures', () => {
    it('should parse Alice in Wonderland fixture', async () => {
      // Load the fixture from the file system
      const response = await fetch('/src/parser/fixtures/alice.epub')
      if (!response.ok) {
        console.log('Skipping alice.epub test - fixture not available in test environment')
        return
      }

      const data = await response.arrayBuffer()
      const result = await parser.parse(data)

      expect(result.chapters.length).toBeGreaterThan(0)
      expect(result.totalWords).toBeGreaterThan(1000)
      expect(result.parseTimeMs).toBeLessThan(3000) // Should parse in under 3s
      expect(result.metadata.title).toBeDefined()
    }, 10000) // 10 second timeout for real file

    it('should parse Cyropaedia fixture', async () => {
      // Load the fixture from the file system
      const response = await fetch('/data/Cyropaedia by Xenophon.epub')
      if (!response.ok) {
        console.log('Skipping Cyropaedia test - fixture not available in test environment')
        return
      }

      const data = await response.arrayBuffer()
      const result = await parser.parse(data)

      expect(result.chapters.length).toBeGreaterThan(0)
      expect(result.totalWords).toBeGreaterThan(5000)
      expect(result.parseTimeMs).toBeLessThan(3000) // Should parse in under 3s
      expect(result.metadata.title).toBeDefined()
    }, 10000) // 10 second timeout for real file
  })

  describe('Deterministic output', () => {
    it('should produce consistent output for same input', async () => {
      const epub = await createTestEpub([
        {
          title: 'Test',
          content: '<p>Deterministic content.</p>',
        },
      ])

      const result1 = await parser.parse(epub)
      const result2 = await parser.parse(epub)

      expect(result1.chapters[0]?.text).toBe(result2.chapters[0]?.text)
      expect(result1.totalWords).toBe(result2.totalWords)
    })

    it('should have stable line breaks across runs', async () => {
      const epub = await createTestEpub([
        {
          title: 'Test',
          content: '<p>First paragraph.</p><p>Second paragraph.</p><p>Third paragraph.</p>',
        },
      ])

      const result1 = await parser.parse(epub)
      const result2 = await parser.parse(epub)

      const text1 = result1.chapters[0]?.text || ''
      const text2 = result2.chapters[0]?.text || ''

      // Count newlines
      const newlines1 = (text1.match(/\n/g) || []).length
      const newlines2 = (text2.match(/\n/g) || []).length

      expect(newlines1).toBe(newlines2)
      expect(text1).toBe(text2)
    })
  })
})
