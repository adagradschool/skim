/**
 * Structured slide content.
 *
 * A chapter is a list of Blocks (headings, paragraphs, quotes, list items).
 * Each block is a list of Runs: plain text with optional inline emphasis.
 * The chunker packs blocks into slides without ever fusing two blocks, and
 * records when a paragraph continues from the previous slide.
 */

export interface Run {
  text: string
  /** italic */
  i?: boolean
  /** bold */
  b?: boolean
  /** superscript (footnote markers) */
  sup?: boolean
}

export type BlockType = 'heading' | 'paragraph' | 'quote' | 'list'

export interface Block {
  type: BlockType
  /** heading level 1-6 */
  level?: number
  /** list marker such as "1." or "•" */
  marker?: string
  runs: Run[]
}

export interface SlideBlock extends Block {
  /** paragraph text carried over from the previous slide */
  continued?: boolean
  /** first paragraph of a chapter: render with a drop cap */
  dropCap?: boolean
}

export interface SlideContent {
  blocks: SlideBlock[]
  /** plain text of the slide, blocks separated by blank lines */
  text: string
}

export interface ChapterInput {
  text: string
  blocks?: Block[]
}
