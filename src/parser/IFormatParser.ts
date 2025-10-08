import type { ParseResult, ParseProgress } from './types'

/**
 * Interface for document format parsers
 * Allows multiple format support (EPUB, PDF, etc.)
 */
export interface IFormatParser {
  /**
   * Parse a document from an ArrayBuffer
   * @param data - Document file as ArrayBuffer
   * @param onProgress - Optional callback for progress updates
   * @returns ParseResult with chapters, metadata, and performance metrics
   */
  parse(data: ArrayBuffer, onProgress?: (progress: ParseProgress) => void): Promise<ParseResult>

  /**
   * Get file extensions supported by this parser
   * @returns Array of extensions (e.g., ['.epub'])
   */
  getSupportedExtensions(): string[]

  /**
   * Get MIME types supported by this parser
   * @returns Array of MIME types (e.g., ['application/epub+zip'])
   */
  getSupportedMimeTypes(): string[]

  /**
   * Get human-readable format name
   * @returns Format name (e.g., 'EPUB')
   */
  getFormatName(): string
}
