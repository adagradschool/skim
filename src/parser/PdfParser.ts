import * as pdfjsLib from 'pdfjs-dist'
import type { ChapterText, ParseResult, ParseProgress } from './types'
import type { IFormatParser } from './IFormatParser'

// Set up the worker for PDF.js using Vite's asset import
// @ts-ignore - Vite handles this at build time
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker
}

/**
 * PdfParser - Extract and normalize text from PDF files
 *
 * Uses PDF.js for PDF parsing.
 * Extracts visible text treating each page as a chapter.
 */
export class PdfParser implements IFormatParser {
  getSupportedExtensions(): string[] {
    return ['.pdf']
  }

  getSupportedMimeTypes(): string[] {
    return ['application/pdf']
  }

  getFormatName(): string {
    return 'PDF'
  }

  /**
   * Parse a PDF file from an ArrayBuffer
   *
   * @param data - PDF file as ArrayBuffer
   * @param onProgress - Optional callback for progress updates
   * @returns ParseResult with chapters (pages), metadata, and performance metrics
   */
  async parse(
    data: ArrayBuffer,
    onProgress?: (progress: ParseProgress) => void
  ): Promise<ParseResult> {
    const startTime = performance.now()

    try {
      // Stage 1: Load PDF
      onProgress?.({
        stage: 'loading',
        current: 0,
        total: 100,
        message: 'Loading PDF file...',
      })

      const pdf = await pdfjsLib.getDocument({ data }).promise

      // Extract metadata
      const meta = await this.extractMetadata(pdf)

      // Try to get PDF outline (table of contents)
      const outline = await pdf.getOutline().catch(() => null)

      // Stage 2: Extract chapters based on outline or pages
      onProgress?.({
        stage: 'extracting',
        current: 0,
        total: 100,
        message: 'Analyzing document structure...',
      })

      let chapters: ChapterText[]

      if (outline && outline.length > 0) {
        // Try to use outline to define chapters
        chapters = await this.extractChaptersFromOutline(pdf, outline, onProgress)

        // If outline extraction failed or returned empty, fallback to pages
        if (chapters.length === 0) {
          console.warn('Outline extraction yielded no chapters, falling back to page-by-page')
          chapters = await this.extractChaptersByPage(pdf, onProgress)
        }
      } else {
        // No outline: treat each page as a chapter
        chapters = await this.extractChaptersByPage(pdf, onProgress)
      }

      // Stage 3: Generate cover from first page
      onProgress?.({
        stage: 'normalizing',
        current: 0,
        total: 100,
        message: 'Generating cover...',
      })

      let coverBlob: Blob | undefined
      try {
        coverBlob = await this.generateCover(pdf)
      } catch (error) {
        console.warn('Failed to generate cover from first page', error)
      }

      // Update metadata with cover
      if (coverBlob) {
        meta.coverBlob = coverBlob
      }

      // Calculate total words
      const totalWords = chapters.reduce((sum, ch) => sum + this.countWords(ch.text), 0)

      const parseTimeMs = performance.now() - startTime

      onProgress?.({
        stage: 'complete',
        current: 100,
        total: 100,
        message: 'Parsing complete',
      })

      return {
        chapters,
        meta,
        parseTimeMs,
        totalWords,
      }
    } catch (error) {
      throw new Error(
        `Failed to parse PDF: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Extract chapters using PDF outline (table of contents)
   */
  private async extractChaptersFromOutline(
    pdf: pdfjsLib.PDFDocumentProxy,
    outline: any[],
    onProgress?: (progress: ParseProgress) => void
  ): Promise<ChapterText[]> {
    // Flatten nested outline into chapter list
    const flatOutline = this.flattenOutline(outline)

    // Get page numbers for each outline item
    const chapterRanges = await this.getChapterPageRanges(pdf, flatOutline)

    // If no valid ranges found, return empty to trigger fallback
    if (chapterRanges.length === 0) {
      return []
    }

    // Check if outline covers all pages
    const firstOutlinePage = Math.min(...chapterRanges.map(r => r.startPage))
    const lastOutlinePage = Math.max(...chapterRanges.map(r => r.endPage))
    const outlineCoverage = ((lastOutlinePage - firstOutlinePage + 1) / pdf.numPages) * 100

    // If outline covers less than 90% of the document, it's likely incomplete
    // Fall back to page-by-page to ensure no content is lost
    if (outlineCoverage < 90 || firstOutlinePage > 1) {
      const missingPages = (firstOutlinePage - 1) + (pdf.numPages - lastOutlinePage)
      console.warn(
        `Outline is incomplete: covers pages ${firstOutlinePage}-${lastOutlinePage} (${outlineCoverage.toFixed(1)}%), missing ${missingPages} pages. Falling back to page-by-page extraction for complete coverage.`
      )
      return [] // Trigger fallback
    }

    const chapters: ChapterText[] = []

    for (let i = 0; i < chapterRanges.length; i++) {
      const range = chapterRanges[i]

      onProgress?.({
        stage: 'extracting',
        current: i + 1,
        total: chapterRanges.length,
        message: `Extracting chapter ${i + 1} of ${chapterRanges.length}...`,
      })

      try {
        const text = await this.extractTextFromPageRange(pdf, range.startPage, range.endPage)

        chapters.push({
          index: i,
          title: range.title || `Chapter ${i + 1}`,
          text: this.normalizeText(text),
          href: `chapter-${i}`,
        })
      } catch (error) {
        console.error(`Error extracting chapter ${i} (${range.title}):`, error)
      }
    }

    return chapters
  }

  /**
   * Extract chapters treating each page as a chapter (fallback)
   */
  private async extractChaptersByPage(
    pdf: pdfjsLib.PDFDocumentProxy,
    onProgress?: (progress: ParseProgress) => void
  ): Promise<ChapterText[]> {
    const chapters: ChapterText[] = []

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      onProgress?.({
        stage: 'extracting',
        current: pageNum,
        total: pdf.numPages,
        message: `Extracting page ${pageNum} of ${pdf.numPages}...`,
      })

      try {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()

        const pageText = textContent.items
          .map((item: any) => item.str || '')
          .join(' ')

        chapters.push({
          index: pageNum - 1,
          title: `Page ${pageNum}`,
          text: this.normalizeText(pageText),
          href: `page-${pageNum}`,
        })

        page.cleanup()
      } catch (error) {
        console.error(`Error extracting page ${pageNum}:`, error)
      }
    }

    return chapters
  }

  /**
   * Flatten nested outline structure
   */
  private flattenOutline(outline: any[], depth: number = 0): any[] {
    const result: any[] = []

    for (const item of outline) {
      result.push({ ...item, depth })

      if (item.items && item.items.length > 0) {
        result.push(...this.flattenOutline(item.items, depth + 1))
      }
    }

    return result
  }

  /**
   * Get page ranges for each chapter based on outline
   */
  private async getChapterPageRanges(
    pdf: pdfjsLib.PDFDocumentProxy,
    flatOutline: any[]
  ): Promise<Array<{ title: string; startPage: number; endPage: number }>> {
    const ranges: Array<{ title: string; startPage: number; endPage: number }> = []

    // Build list of valid outline items with their page numbers
    interface ValidOutlineItem {
      title: string
      pageNum: number
      originalIndex: number
    }
    const validItems: ValidOutlineItem[] = []

    for (let i = 0; i < flatOutline.length; i++) {
      const item = flatOutline[i]
      try {
        const pageNum = await this.getPageNumberFromDest(pdf, item.dest)

        // Validate page number is within bounds
        if (pageNum >= 1 && pageNum <= pdf.numPages) {
          validItems.push({
            title: item.title,
            pageNum,
            originalIndex: i,
          })
        } else {
          console.warn(`Outline item "${item.title}" has out-of-bounds page number: ${pageNum}`)
        }
      } catch (error) {
        console.warn(`Skipping outline item "${item.title}": ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // If we couldn't resolve any outline items, return empty (will fallback to page-by-page)
    if (validItems.length === 0) {
      console.warn('No valid outline items found, will use page-by-page fallback')
      return []
    }

    // Sort by page number to ensure proper ordering
    validItems.sort((a, b) => a.pageNum - b.pageNum)

    // Deduplicate: Keep only first item for each unique page number
    const deduplicatedItems: ValidOutlineItem[] = []
    let lastPageNum = -1

    for (const item of validItems) {
      if (item.pageNum !== lastPageNum) {
        deduplicatedItems.push(item)
        lastPageNum = item.pageNum
      } else {
        console.warn(`Skipping duplicate outline item "${item.title}" at page ${item.pageNum}`)
      }
    }

    // Create ranges from deduplicated items
    for (let i = 0; i < deduplicatedItems.length; i++) {
      const item = deduplicatedItems[i]
      const nextItem = deduplicatedItems[i + 1]

      const endPage = nextItem ? nextItem.pageNum - 1 : pdf.numPages

      ranges.push({
        title: item.title,
        startPage: item.pageNum,
        endPage,
      })
    }

    return ranges
  }

  /**
   * Get page number from PDF destination
   */
  private async getPageNumberFromDest(
    pdf: pdfjsLib.PDFDocumentProxy,
    dest: any
  ): Promise<number> {
    try {
      // If dest is a string, it's a named destination
      if (typeof dest === 'string') {
        dest = await pdf.getDestination(dest)
      }

      if (!dest || !Array.isArray(dest) || dest.length === 0) {
        throw new Error('Invalid destination')
      }

      // First element is the page reference
      const pageRef = dest[0]

      // Handle different types of page references
      if (typeof pageRef === 'number') {
        // Direct page number (0-indexed)
        return pageRef + 1
      }

      // Page reference object - need to resolve it
      const pageIndex = await pdf.getPageIndex(pageRef)
      return pageIndex + 1 // Convert to 1-indexed
    } catch (error) {
      // If we can't resolve the destination, throw to be caught by caller
      throw new Error(`Failed to resolve destination: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Extract text from a range of pages
   */
  private async extractTextFromPageRange(
    pdf: pdfjsLib.PDFDocumentProxy,
    startPage: number,
    endPage: number
  ): Promise<string> {
    const textParts: string[] = []

    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()

        const pageText = textContent.items
          .map((item: any) => item.str || '')
          .join(' ')

        textParts.push(pageText)
        page.cleanup()
      } catch (error) {
        console.error(`Error extracting page ${pageNum}:`, error)
      }
    }

    return textParts.join('\n\n')
  }

  /**
   * Extract metadata from PDF
   */
  private async extractMetadata(
    pdf: pdfjsLib.PDFDocumentProxy
  ): Promise<{ title?: string; author?: string; coverBlob?: Blob }> {
    try {
      const metadata = await pdf.getMetadata()
      const info = metadata.info as any

      return {
        title: info?.Title || undefined,
        author: info?.Author || undefined,
      }
    } catch (error) {
      console.warn('Failed to extract PDF metadata', error)
      return {}
    }
  }

  /**
   * Generate cover image from first page of PDF
   */
  private async generateCover(pdf: pdfjsLib.PDFDocumentProxy): Promise<Blob | undefined> {
    if (pdf.numPages === 0) {
      return undefined
    }

    try {
      const page = await pdf.getPage(1)
      const viewport = page.getViewport({ scale: 1.5 })

      // Create canvas
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) {
        return undefined
      }

      canvas.width = viewport.width
      canvas.height = viewport.height

      // Render page to canvas
      const renderTask = page.render({
        canvasContext: context,
        viewport: viewport,
      } as any)
      await renderTask.promise

      // Convert canvas to blob
      return new Promise<Blob | undefined>((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob || undefined)
        }, 'image/jpeg', 0.85)
      })
    } catch (error) {
      console.warn('Failed to generate cover image', error)
      return undefined
    }
  }

  /**
   * Normalize text:
   * - Collapse excessive whitespace
   * - Remove zero-width characters
   * - Trim
   */
  private normalizeText(text: string): string {
    return (
      text
        // Remove zero-width characters
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        // Collapse multiple spaces/tabs into single space
        .replace(/[ \t]+/g, ' ')
        // Collapse multiple newlines
        .replace(/\n\n+/g, '\n\n')
        // Remove spaces around newlines
        .replace(/ *\n */g, '\n')
        // Trim
        .trim()
    )
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter((word) => word.length > 0).length
  }
}

// Singleton instance
export const pdfParser = new PdfParser()
