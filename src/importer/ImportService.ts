import { parserService } from '@/parser/ParserService'
import { formatDetector } from '@/parser' // Import from index to ensure parsers are registered
import { storageService } from '@/db/StorageService'
import { chunkerService } from '@/chunker/ChunkerService'
import type { Book, Slide, Chapter } from '@/db/types'
import type { ParseProgress } from '@/parser/types'

export type ImportProgressStage = 'reading' | 'parsing' | 'storing' | 'complete'

export interface ImportProgressUpdate {
  stage: ImportProgressStage
  message: string
  current?: number
  total?: number
}

export interface ImportOptions {
  onProgress?: (update: ImportProgressUpdate) => void
  signal?: AbortSignal
}

/**
 * Orchestrates document import: file → parse → chunk → store
 * Supports multiple formats (EPUB, PDF, etc.)
 */
export class ImportService {
  /**
   * Import a document file into the database (format auto-detected)
   * @param file - Document file selected by the user (EPUB, PDF, etc.)
   * @param options - Progress/cancellation options
   * @returns Book ID of the imported title
   */
  async import(file: File, options: ImportOptions = {}): Promise<string> {
    const { onProgress, signal } = options

    try {
      this.ensureNotAborted(signal)

      // Detect format and get appropriate parser
      const parser = formatDetector.detectParser(file)
      if (!parser) {
        const supportedFormats = formatDetector.getSupportedFormats().join(', ')
        throw new Error(
          `Unsupported file format. Supported formats: ${supportedFormats}`
        )
      }

      const formatName = parser.getFormatName()

      onProgress?.({ stage: 'reading', message: `Reading ${formatName} file...` })
      const fileData = await file.arrayBuffer()

      this.ensureNotAborted(signal)

      onProgress?.({ stage: 'parsing', message: `Parsing ${formatName}...` })
      const parseResult = await parser.parse(fileData, (progress) => {
        this.ensureNotAborted(signal)
        onProgress?.(this.mapParserProgress(progress))
      })

      this.ensureNotAborted(signal)

      const bookId = this.generateBookId()
      const timestamp = Date.now()

      this.ensureNotAborted(signal)

      // Chunk all chapters into slides and build chapter metadata
      const slides: Slide[] = []
      const chapters: Chapter[] = []
      let globalSlideIndex = 0

      for (const parsedChapter of parseResult.chapters) {
        const chapterSlideTexts = chunkerService.chunkText(parsedChapter.text)
        const firstSlideIndex = globalSlideIndex

        for (const slideText of chapterSlideTexts) {
          slides.push({
            bookId,
            slideIndex: globalSlideIndex++,
            chapter: parsedChapter.index,
            words: this.countWords(slideText),
            text: slideText,
          })
        }

        // Store chapter metadata
        chapters.push({
          bookId,
          chapterIndex: parsedChapter.index,
          title: parsedChapter.title || `Chapter ${parsedChapter.index + 1}`,
          firstSlideIndex,
          slideCount: chapterSlideTexts.length,
        })
      }

      const book: Book = {
        id: bookId,
        title: parseResult.meta.title || this.fallbackTitle(file.name),
        author: parseResult.meta.author,
        modifiedAt: timestamp,
        sizeBytes: file.size,
        coverBlob: parseResult.meta.coverBlob,
      }

      onProgress?.({
        stage: 'storing',
        message: `Saving ${slides.length} slides...`,
        current: slides.length,
        total: slides.length,
      })

      await storageService.saveBook(book)
      await storageService.saveChapters(chapters)
      await storageService.saveSlides(slides)

      // Initialize progress at first slide
      await storageService.setProgress(bookId, 0)

      onProgress?.({ stage: 'complete', message: 'Import complete' })

      return bookId
    } catch (error) {
      if (this.isAbortError(error)) {
        throw error
      }

      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Import failed: ${message}`)
    }
  }

  /**
   * Import an EPUB file into the database
   * @param file - EPUB file selected by the user
   * @param options - Progress/cancellation options
   * @returns Book ID of the imported title
   * @deprecated Use import() instead for multi-format support
   */
  async importEpub(file: File, options: ImportOptions = {}): Promise<string> {
    const { onProgress, signal } = options

    try {
      this.ensureNotAborted(signal)

      onProgress?.({ stage: 'reading', message: 'Reading EPUB file...' })
      const epubData = await file.arrayBuffer()

      this.ensureNotAborted(signal)

      onProgress?.({ stage: 'parsing', message: 'Parsing EPUB...' })
      const parseResult = await parserService.parse(epubData, (progress) => {
        this.ensureNotAborted(signal)
        onProgress?.(this.mapParserProgress(progress))
      })

      this.ensureNotAborted(signal)

      const bookId = this.generateBookId()
      const timestamp = Date.now()

      this.ensureNotAborted(signal)

      // Chunk all chapters into slides and build chapter metadata
      const slides: Slide[] = []
      const chapters: Chapter[] = []
      let globalSlideIndex = 0

      for (const parsedChapter of parseResult.chapters) {
        const chapterSlideTexts = chunkerService.chunkText(parsedChapter.text)
        const firstSlideIndex = globalSlideIndex

        for (const slideText of chapterSlideTexts) {
          slides.push({
            bookId,
            slideIndex: globalSlideIndex++,
            chapter: parsedChapter.index,
            words: this.countWords(slideText),
            text: slideText,
          })
        }

        // Store chapter metadata
        chapters.push({
          bookId,
          chapterIndex: parsedChapter.index,
          title: parsedChapter.title || `Chapter ${parsedChapter.index + 1}`,
          firstSlideIndex,
          slideCount: chapterSlideTexts.length,
        })
      }

      const book: Book = {
        id: bookId,
        title: parseResult.meta.title || this.fallbackTitle(file.name),
        author: parseResult.meta.author,
        modifiedAt: timestamp,
        sizeBytes: file.size,
        coverBlob: parseResult.meta.coverBlob,
      }

      onProgress?.({
        stage: 'storing',
        message: `Saving ${slides.length} slides...`,
        current: slides.length,
        total: slides.length,
      })

      await storageService.saveBook(book)
      await storageService.saveChapters(chapters)
      await storageService.saveSlides(slides)

      // Initialize progress at first slide
      await storageService.setProgress(bookId, 0)

      onProgress?.({ stage: 'complete', message: 'Import complete' })

      return bookId
    } catch (error) {
      if (this.isAbortError(error)) {
        throw error
      }

      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Import failed: ${message}`)
    }
  }

  private mapParserProgress(progress: ParseProgress): ImportProgressUpdate {
    return {
      stage: 'parsing',
      message: progress.message,
      current: progress.current,
      total: progress.total,
    }
  }

  private ensureNotAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new DOMException('Import cancelled', 'AbortError')
    }
  }

  private isAbortError(error: unknown): error is DOMException {
    return (
      error instanceof DOMException &&
      (error.name === 'AbortError' || error.message === 'Aborted' || error.message === 'Import cancelled')
    )
  }

  private fallbackTitle(fileName: string): string {
    const withoutExt = fileName.replace(/\.(epub|pdf)$/i, '').trim()
    return withoutExt.length > 0 ? withoutExt : 'Untitled Book'
  }

  /**
   * Generate a unique book ID
   */
  private generateBookId(): string {
    return `book-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0).length
  }
}

// Singleton instance
export const importService = new ImportService()
