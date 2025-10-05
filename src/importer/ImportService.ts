import { parserService } from '@/parser/ParserService'
import { storageService } from '@/db/StorageService'
import type { Book, Chapter } from '@/db/types'
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

      this.ensureNotAborted(signal)

      // Convert parsed chapters to storage format
      const chapters: Chapter[] = parseResult.chapters.map((parsedChapter) => ({
        bookId,
        chapterIndex: parsedChapter.index,
        title: parsedChapter.title,
        text: parsedChapter.text,
        words: this.countWords(parsedChapter.text),
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
        message: `Saving ${chapters.length} chapters...`,
        current: chapters.length,
        total: chapters.length,
      })

      await storageService.saveBook(book)
      await storageService.saveChapters(chapters)

      // Initialize progress at start of first chapter
      await storageService.setProgress(bookId, 0, 0)

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
