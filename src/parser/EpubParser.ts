import ePub, { Book } from 'epubjs'
import DOMPurify from 'dompurify'
import type { ChapterText, ParseResult, ParseProgress } from './types'
import type { IFormatParser } from './IFormatParser'

/**
 * EpubParser - Extract and normalize text from EPUB files
 *
 * Uses epub.js for EPUB parsing and DOMPurify for safe HTML processing.
 * Extracts visible text while preserving chapter boundaries and paragraph breaks.
 */
export class EpubParser implements IFormatParser {
  getSupportedExtensions(): string[] {
    return ['.epub']
  }

  getSupportedMimeTypes(): string[] {
    return ['application/epub+zip']
  }

  getFormatName(): string {
    return 'EPUB'
  }

  /**
   * Parse an EPUB file from an ArrayBuffer
   *
   * @param data - EPUB file as ArrayBuffer
   * @param onProgress - Optional callback for progress updates
   * @returns ParseResult with chapters, metadata, and performance metrics
   */
  async parse(
    data: ArrayBuffer,
    onProgress?: (progress: ParseProgress) => void
  ): Promise<ParseResult> {
    const startTime = performance.now()

    try {
      // Stage 1: Load EPUB
      onProgress?.({
        stage: 'loading',
        current: 0,
        total: 100,
        message: 'Loading EPUB file...',
      })

      const book = await this.loadEpub(data)

      // Extract metadata (title, author, optional cover)
      const meta = await this.extractMetadata(book)

      // Stage 2: Extract chapters
      onProgress?.({
        stage: 'extracting',
        current: 0,
        total: 100,
        message: 'Extracting chapters...',
      })

      const chapters = await this.extractChapters(book, (current, total) => {
        onProgress?.({
          stage: 'extracting',
          current,
          total,
          message: `Extracting chapter ${current} of ${total}...`,
        })
      })

      // Stage 3: Normalize text
      onProgress?.({
        stage: 'normalizing',
        current: 0,
        total: chapters.length,
        message: 'Normalizing text...',
      })

      const normalizedChapters = chapters.map((chapter, idx) => {
        onProgress?.({
          stage: 'normalizing',
          current: idx + 1,
          total: chapters.length,
          message: `Normalizing chapter ${idx + 1} of ${chapters.length}...`,
        })
        return {
          ...chapter,
          text: this.normalizeText(chapter.text),
        }
      })

      // Calculate total words
      const totalWords = normalizedChapters.reduce(
        (sum, ch) => sum + this.countWords(ch.text),
        0
      )

      const parseTimeMs = performance.now() - startTime

      onProgress?.({
        stage: 'complete',
        current: 100,
        total: 100,
        message: 'Parsing complete',
      })

      return {
        chapters: normalizedChapters,
        meta,
        parseTimeMs,
        totalWords,
      }
    } catch (error) {
      throw new Error(
        `Failed to parse EPUB: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Load EPUB from ArrayBuffer using epub.js
   */
  private async loadEpub(data: ArrayBuffer): Promise<Book> {
    const book = ePub(data)
    await book.ready
    return book
  }

  /**
   * Extract metadata from EPUB
   */
  private async extractMetadata(
    book: Book
  ): Promise<{ title?: string; author?: string; coverBlob?: Blob }> {
    await book.loaded.metadata

    const metadata = book.packaging.metadata

    let coverBlob: Blob | undefined
    try {
      coverBlob = await this.extractCover(book)
    } catch (error) {
      console.warn('Failed to extract cover image', error)
    }

    return {
      title: metadata.title || undefined,
      author: metadata.creator || undefined,
      coverBlob,
    }
  }

  /**
   * Extract text from all spine items (chapters)
   */
  private async extractChapters(
    book: Book,
    onProgress?: (current: number, total: number) => void
  ): Promise<ChapterText[]> {
    await book.loaded.spine

    const spine = (book.spine as any).items
    const chapters: ChapterText[] = []

    for (let i = 0; i < spine.length; i++) {
      const item = spine[i]
      onProgress?.(i + 1, spine.length)

      try {
        // Load the section
        const section = book.spine.get(item.href)
        if (!section) continue

        await section.load(book.load.bind(book))

        // Get the document
        const doc = section.document

        if (!doc) {
          console.warn(`No document found for spine item ${i}: ${item.href}`)
          continue
        }

        // Extract text from the body
        const bodyElement = doc.querySelector('body')
        if (!bodyElement) {
          console.warn(`No body element found in spine item ${i}: ${item.href}`)
          continue
        }

        // Get inner HTML and extract text
        const html = bodyElement.innerHTML
        const text = this.extractTextFromHtml(html)

        // Get chapter title from heading or use section label
        const title = this.extractTitle(doc) || item.idref || `Chapter ${i + 1}`

        chapters.push({
          index: i,
          title,
          text,
          href: item.href,
        })

        // Unload section to free memory
        section.unload()
      } catch (error) {
        console.error(`Error extracting spine item ${i} (${item.href}):`, error)
        // Continue with other chapters even if one fails
      }
    }

    return chapters
  }

  /**
   * Attempt to extract the cover image as a Blob (if available)
   */
  private async extractCover(book: Book): Promise<Blob | undefined> {
    if (typeof fetch !== 'function') {
      return undefined
    }

    try {
      const coverUrl = await book.coverUrl()
      if (!coverUrl) {
        return undefined
      }

      const response = await fetch(coverUrl)
      if (!response.ok) {
        return undefined
      }

      const blob = await response.blob()

      if (coverUrl.startsWith('blob:')) {
        URL.revokeObjectURL(coverUrl)
      }

      return blob
    } catch (error) {
      console.warn('Error fetching cover image', error)
      return undefined
    }
  }

  /**
   * Extract title from document (first h1-h6 element)
   */
  private extractTitle(doc: Document): string | null {
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6')
    if (headings.length > 0) {
      return headings[0]?.textContent?.trim() || null
    }
    return null
  }

  /**
   * Extract visible text from HTML, preserving paragraph breaks
   */
  private extractTextFromHtml(html: string): string {
    // Sanitize HTML to remove scripts, styles, etc.
    const clean = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li', 'ul', 'ol'],
      KEEP_CONTENT: true,
    })

    // Create a temporary DOM element to parse
    const temp = document.createElement('div')
    temp.innerHTML = clean

    // Remove script and style elements
    temp.querySelectorAll('script, style').forEach((el) => el.remove())

    // Extract text with paragraph preservation
    const textParts: string[] = []

    // Process block-level elements
    const blockElements = temp.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, blockquote, li')

    if (blockElements.length > 0) {
      blockElements.forEach((el) => {
        const text = el.textContent?.trim()
        if (text) {
          textParts.push(text)
        }
      })
    } else {
      // Fallback: just get all text if no block elements
      const text = temp.textContent?.trim()
      if (text) {
        textParts.push(text)
      }
    }

    // Join with double newlines to preserve paragraph breaks
    return textParts.join('\n\n')
  }

  /**
   * Normalize text:
   * - Resolve HTML entities
   * - Collapse excessive whitespace
   * - Preserve paragraph boundaries (\n\n)
   * - Remove zero-width characters
   */
  private normalizeText(text: string): string {
    return (
      text
        // Remove zero-width characters
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        // Collapse multiple spaces/tabs into single space
        .replace(/[ \t]+/g, ' ')
        // Preserve paragraph breaks (double newlines)
        .replace(/\n\n+/g, '\n\n')
        // Remove spaces around newlines
        .replace(/ *\n */g, '\n')
        // Trim each line
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
        // Collapse more than 2 consecutive newlines
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    )
  }

  /**
   * Count words in text (Unicode-aware)
   */
  private countWords(text: string): number {
    // Split on whitespace and filter empty strings
    return text.split(/\s+/).filter((word) => word.length > 0).length
  }
}

// Singleton instance
export const epubParser = new EpubParser()
