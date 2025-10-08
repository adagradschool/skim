import type { IFormatParser } from './IFormatParser'

/**
 * Registry and detection system for document format parsers
 */
export class FormatDetector {
  private parsers: IFormatParser[] = []

  /**
   * Register a parser for use
   */
  registerParser(parser: IFormatParser): void {
    this.parsers.push(parser)
  }

  /**
   * Detect format from file and return appropriate parser
   * @param file - File to detect format for
   * @returns Parser instance or null if no parser found
   */
  detectParser(file: File): IFormatParser | null {
    const fileName = file.name.toLowerCase()
    const mimeType = file.type

    // Try to match by extension first (most reliable)
    for (const parser of this.parsers) {
      const extensions = parser.getSupportedExtensions()
      if (extensions.some((ext) => fileName.endsWith(ext.toLowerCase()))) {
        return parser
      }
    }

    // Fallback to MIME type matching
    if (mimeType) {
      for (const parser of this.parsers) {
        const mimeTypes = parser.getSupportedMimeTypes()
        if (mimeTypes.includes(mimeType)) {
          return parser
        }
      }
    }

    return null
  }

  /**
   * Get all supported file extensions
   */
  getSupportedExtensions(): string[] {
    return this.parsers.flatMap((p) => p.getSupportedExtensions())
  }

  /**
   * Get all supported MIME types
   */
  getSupportedMimeTypes(): string[] {
    return this.parsers.flatMap((p) => p.getSupportedMimeTypes())
  }

  /**
   * Get list of registered format names
   */
  getSupportedFormats(): string[] {
    return this.parsers.map((p) => p.getFormatName())
  }
}
