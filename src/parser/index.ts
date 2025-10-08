// Legacy exports for backward compatibility
export { ParserService, parserService } from './ParserService'

// New modular parser exports
export { EpubParser, epubParser } from './EpubParser'
export { PdfParser, pdfParser } from './PdfParser'
export { FormatDetector } from './FormatDetector'
export type { IFormatParser } from './IFormatParser'

// Types
export type { ChapterText, ParseResult, ParseProgress } from './types'

// Initialize and export formatDetector with parsers registered
import { epubParser } from './EpubParser'
import { pdfParser } from './PdfParser'
import { FormatDetector } from './FormatDetector'

// Create and configure format detector
const formatDetector = new FormatDetector()
formatDetector.registerParser(epubParser)
formatDetector.registerParser(pdfParser)

export { formatDetector }
