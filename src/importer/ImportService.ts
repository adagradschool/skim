import { parserService } from '@/parser/ParserService'
import { formatDetector } from '@/parser' // Import from index to ensure parsers are registered
import { storageService } from '@/db/StorageService'
import { chunkerService } from '@/chunker/ChunkerService'
import { gamification } from '@/gamification/score'
import type { Book, Slide, Chapter } from '@/db/types'
import type { ParseProgress, ParseResult } from '@/parser/types'
import type { ExtractedArticle } from '@/articles/extract'

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
  /** Provenance tag for catalog downloads, stored on the book. */
  sourceId?: string
}

/** Metadata for storing an already-parsed document (articles, or files). */
export interface StoreMeta {
  fallbackTitle: string
  sizeBytes: number
  sourceId?: string
  kind?: 'book' | 'article'
  sourceUrl?: string
  siteName?: string
  excerpt?: string
  signal?: AbortSignal
  onProgress?: (update: ImportProgressUpdate) => void
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
    const { onProgress, signal, sourceId } = options

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

      const bookId = await this.storeParsed(parseResult, {
        fallbackTitle: this.fallbackTitle(file.name),
        sizeBytes: file.size,
        sourceId,
        signal,
        onProgress,
      })
      void gamification.record('book_added', { bookId }).catch(() => {})
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
        const chapterSlides = chunkerService.chunkChapter(parsedChapter)
        const chapterSlideTexts = chapterSlides.map((slide) => slide.text)
        const firstSlideIndex = globalSlideIndex

        for (const slide of chapterSlides) {
          slides.push({
            bookId,
            slideIndex: globalSlideIndex++,
            chapter: parsedChapter.index,
            words: this.countWords(slide.text),
            text: slide.text,
            content: slide,
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
   * Save a web article that has already been fetched and extracted.
   * @returns Book ID of the stored article
   */
  async importArticle(article: ExtractedArticle, options: ImportOptions = {}): Promise<string> {
    const parseResult: ParseResult = {
      chapters: article.chapters,
      meta: { title: article.title, author: article.byline },
      parseTimeMs: 0,
      totalWords: article.words,
    }
    const bookId = await this.storeParsed(parseResult, {
      fallbackTitle: article.title,
      sizeBytes: article.chapters.reduce((n, c) => n + c.text.length, 0),
      kind: 'article',
      sourceUrl: article.url,
      siteName: article.siteName,
      excerpt: article.excerpt,
      sourceId: `url:${article.url}`,
      signal: options.signal,
      onProgress: options.onProgress,
    })
    return bookId
  }

  /** Chunk parsed chapters into slides and persist book, chapters, slides and progress. */
  private async storeParsed(parseResult: ParseResult, meta: StoreMeta): Promise<string> {
    const { signal, onProgress } = meta
    this.ensureNotAborted(signal)

    const bookId = this.generateBookId()
    const timestamp = Date.now()

    // Chunk all chapters into slides and build chapter metadata
    const slides: Slide[] = []
    const chapters: Chapter[] = []
    let globalSlideIndex = 0

    for (const parsedChapter of parseResult.chapters) {
      const chapterSlides = chunkerService.chunkChapter(parsedChapter)
      const firstSlideIndex = globalSlideIndex

      for (const slide of chapterSlides) {
        slides.push({
          bookId,
          slideIndex: globalSlideIndex++,
          chapter: parsedChapter.index,
          words: this.countWords(slide.text),
          text: slide.text,
          content: slide,
        })
      }

      chapters.push({
        bookId,
        chapterIndex: parsedChapter.index,
        title: parsedChapter.title || `Chapter ${parsedChapter.index + 1}`,
        firstSlideIndex,
        slideCount: chapterSlides.length,
      })
    }

    if (slides.length === 0) {
      throw new Error('Nothing to read in that document')
    }

    const book: Book = {
      id: bookId,
      title: parseResult.meta.title || meta.fallbackTitle,
      author: parseResult.meta.author,
      modifiedAt: timestamp,
      sizeBytes: meta.sizeBytes,
      coverBlob: parseResult.meta.coverBlob,
      ...(meta.sourceId ? { sourceId: meta.sourceId } : {}),
      ...(meta.kind ? { kind: meta.kind } : {}),
      ...(meta.sourceUrl ? { sourceUrl: meta.sourceUrl } : {}),
      ...(meta.siteName ? { siteName: meta.siteName } : {}),
      ...(meta.excerpt ? { excerpt: meta.excerpt } : {}),
    }

    onProgress?.({
      stage: 'storing',
      message: `Saving ${slides.length} slides...`,
      current: slides.length,
      total: slides.length,
    })

    this.ensureNotAborted(signal)
    await storageService.saveBook(book)
    await storageService.saveChapters(chapters)
    await storageService.saveSlides(slides)
    await storageService.setProgress(bookId, 0)

    onProgress?.({ stage: 'complete', message: 'Import complete' })
    return bookId
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
