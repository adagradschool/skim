import { parserService } from '@/parser/ParserService'
import { chunkerService } from '@/chunker/ChunkerService'
import { storageService } from '@/db/StorageService'
import type { Book, Slide } from '@/db/types'
import type { ChapterInput } from '@/chunker/types'

/**
 * Orchestrates EPUB import: parse → chunk → store
 */
export class ImportService {
  /**
   * Import an EPUB file into the database
   * @param epubData - EPUB file as ArrayBuffer
   * @param onProgress - Optional progress callback
   * @returns Book ID
   */
  async importEpub(
    epubData: ArrayBuffer,
    onProgress?: (message: string) => void
  ): Promise<string> {
    try {
      // Step 1: Parse EPUB
      onProgress?.('Parsing EPUB...')
      const parseResult = await parserService.parse(epubData, (prog) => {
        onProgress?.(prog.message)
      })

      // Step 2: Generate Book ID and save book metadata
      const bookId = this.generateBookId()
      const now = Date.now()

      const book: Book = {
        id: bookId,
        title: parseResult.metadata.title || 'Unknown Title',
        author: parseResult.metadata.author || 'Unknown Author',
        addedAt: now,
        modifiedAt: now,
      }

      onProgress?.('Saving book metadata...')
      await storageService.saveBook(book)

      // Step 3: Chunk chapters into slides
      onProgress?.('Chunking into slides...')
      const chapters: ChapterInput[] = parseResult.chapters.map((ch) => ({
        chapter: ch.chapter,
        text: ch.text,
      }))

      const chunkResult = chunkerService.split(bookId, chapters)

      // Step 4: Convert to Slide format for storage
      const slides: Slide[] = chunkResult.slides.map((slide) => ({
        bookId: slide.bookId,
        slideIndex: slide.slideIndex,
        chapter: slide.chapter,
        text: slide.text,
      }))

      // Step 5: Bulk insert slides
      onProgress?.(`Saving ${slides.length} slides...`)
      await storageService.saveSlides(slides)

      // Step 6: Initialize progress
      onProgress?.('Initializing reading progress...')
      await storageService.saveProgress({
        bookId,
        currentSlide: 0,
        lastRead: now,
      })

      onProgress?.('Import complete!')
      return bookId
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Import failed: ${message}`)
    }
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
