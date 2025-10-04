import { parserService } from '@/parser/ParserService'
import { chunkerService } from '@/chunker/ChunkerService'
import { storageService } from '@/db/StorageService'
import type { Book, Slide } from '@/db/types'
import type { ChapterInput } from '@/chunker/types'
import type { ParseProgress } from '@/parser/types'

export type ImportProgressStage = 'reading' | 'parsing' | 'chunking' | 'storing' | 'complete'

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
 * Orchestrates EPUB import: file → parse → chunk → store
 */
export class ImportService {
  /**
   * Import an EPUB file into the database
   * @param file - EPUB file selected by the user
   * @param options - Progress/cancellation options
   * @returns Book ID of the imported title
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

      onProgress?.({ stage: 'chunking', message: 'Chunking into slides...' })
      const chapters: ChapterInput[] = parseResult.chapters.map((chapter) => ({
        chapter: chapter.index,
        text: chapter.text,
      }))

      const chunkResult = chunkerService.split(bookId, chapters)

      this.ensureNotAborted(signal)

      const slides: Slide[] = chunkResult.slides.map((slide) => ({
        bookId: slide.bookId,
        slideIndex: slide.slideIndex,
        chapter: slide.chapter,
        text: slide.text,
        words: slide.words,
      }))

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

      await storageService.saveImportedBundle({
        book,
        slides,
        initialSlideIndex: 0,
        timestamp,
        signal,
      })

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
    const withoutExt = fileName.replace(/\.epub$/i, '').trim()
    return withoutExt.length > 0 ? withoutExt : 'Untitled Book'
  }

  /**
   * Generate a unique book ID
   */
  private generateBookId(): string {
    return `book-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }
}

// Singleton instance
export const importService = new ImportService()
