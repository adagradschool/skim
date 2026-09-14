import type { Block, ChapterInput, Run, SlideBlock, SlideContent } from './types'

export const DEFAULT_MAX_CHARS_PER_SLIDE = 300

interface Span {
  start: number
  end: number
}

export interface ChunkerOptions {
  /** Hard budget per slide, in characters of text (block separators count as one). */
  maxChars?: number
  /** A paragraph may run this far past maxChars to finish its last sentence. Ratio, e.g. 1.15. */
  softOverflow?: number
  /** Once a slide is at least this full (ratio of maxChars) a paragraph end closes the slide. */
  minFill?: number
}

/** Plain text of a run list. */
export function runsToText(runs: Run[]): string {
  return runs.map((r) => r.text).join('')
}

/** Plain text -> paragraph blocks. Blank lines separate paragraphs; other whitespace collapses. */
export function textToBlocks(text: string): Block[] {
  if (!text) return []
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0)
    .map((p) => ({ type: 'paragraph' as const, runs: [{ text: p }] }))
}

export class ChunkerService {
  private readonly maxChars: number
  private readonly softChars: number
  private readonly minFillChars: number

  constructor(maxChars: number = DEFAULT_MAX_CHARS_PER_SLIDE, options: ChunkerOptions = {}) {
    const max = options.maxChars ?? maxChars
    if (!Number.isFinite(max) || max < 1) {
      throw new Error('maxChars must be a positive number')
    }
    this.maxChars = Math.floor(max)
    this.softChars = Math.floor(this.maxChars * (options.softOverflow ?? 1.15))
    this.minFillChars = Math.floor(this.maxChars * (options.minFill ?? 0.6))
  }

  /** Chunk a parsed chapter. Uses structured blocks when present, plain text otherwise. */
  chunkChapter(chapter: ChapterInput): SlideContent[] {
    const blocks = chapter.blocks && chapter.blocks.length > 0 ? chapter.blocks : textToBlocks(chapter.text)
    return this.chunkBlocks(blocks)
  }

  /** Plain-text convenience: paragraphs split on blank lines, returns slide texts. */
  chunkText(text: string): string[] {
    return this.chunkBlocks(textToBlocks(text)).map((s) => s.text)
  }

  /**
   * Pack blocks into slides.
   *
   * - A heading is always a slide of its own.
   * - Blocks never merge: a slide may hold several short paragraphs, each
   *   kept as its own block.
   * - Paragraph text is added sentence by sentence within the character
   *   budget. A sentence that does not fit starts a new slide, where the
   *   paragraph is marked as continued.
   * - The last sentence of a paragraph may overflow the budget slightly
   *   (softOverflow) rather than leave a short orphan on the next slide.
   * - When a paragraph ends and the slide is reasonably full (minFill),
   *   the slide closes so the next paragraph starts fresh.
   * - A sentence longer than a whole slide flows word by word; a single
   *   token longer than the budget is hard-split.
   */
  chunkBlocks(blocks: Block[]): SlideContent[] {
    const slides: SlideContent[] = []
    let current: SlideBlock[] = []
    let seenFirstParagraph = false

    const slideLength = () =>
      current.reduce((n, b) => n + runsToText(b.runs).length, 0) + Math.max(0, current.length - 1)

    const flush = () => {
      if (current.length > 0) {
        slides.push(this.toSlide(current))
        current = []
      }
    }

    for (const raw of blocks) {
      const runs = normalizeRuns(raw.runs)
      const text = runsToText(runs)
      if (text.length === 0) continue

      if (raw.type === 'heading') {
        flush()
        slides.push(this.toSlide([{ ...raw, runs }]))
        continue
      }

      const dropCap = raw.type === 'paragraph' && !seenFirstParagraph
      if (raw.type === 'paragraph') seenFirstParagraph = true

      // The piece of this paragraph living on the current slide.
      let piece: SlideBlock | null = null
      let pieceStart = 0

      const room = () => {
        const used = slideLength()
        // Separator before a new block on a non-empty slide; a space when extending the piece.
        const sep = piece ? 1 : current.length > 0 ? 1 : 0
        return this.maxChars - used - sep
      }

      const extendTo = (start: number, end: number) => {
        if (!piece) {
          pieceStart = start
          piece = {
            type: raw.type,
            level: raw.level,
            marker: raw.marker,
            runs: [],
            continued: start > 0 || undefined,
            dropCap: dropCap && start === 0 ? true : undefined,
          }
          current.push(piece)
        }
        piece.runs = sliceRuns(runs, pieceStart, end)
      }

      const startNewSlideWith = (start: number, end: number) => {
        flush()
        piece = null
        extendTo(start, end)
      }

      const sentences = sentenceSpans(text)
      for (let si = 0; si < sentences.length; si++) {
        const s = sentences[si]!
        const isLast = si === sentences.length - 1
        const sentLen = s.end - s.start
        // When extending a piece we measure from the piece start, not the sentence start.
        const growth = piece ? s.end - (pieceEnd(piece, pieceStart) ?? s.start) : sentLen

        if (growth <= room()) {
          extendTo(s.start, s.end)
          continue
        }

        // Let a paragraph finish on this slide if it only just overflows.
        if (piece && isLast) {
          const softRoom = this.softChars - slideLength() - 1
          if (growth <= softRoom) {
            extendTo(s.start, s.end)
            flush()
            piece = null
            continue
          }
        }

        if (sentLen <= this.maxChars) {
          startNewSlideWith(s.start, s.end)
          continue
        }

        // Sentence longer than a slide: flow words into whatever room there is.
        for (const w of wordSpans(text, s.start, s.end)) {
          const wGrowth = piece ? w.end - (pieceEnd(piece, pieceStart) ?? w.start) : w.end - w.start
          if (wGrowth <= room()) {
            extendTo(w.start, w.end)
            continue
          }
          if (w.end - w.start <= this.maxChars) {
            startNewSlideWith(w.start, w.end)
            continue
          }
          // Oversize token: hard split.
          let cursor = w.start
          if (piece || current.length > 0) {
            flush()
            piece = null
          }
          while (w.end - cursor > this.maxChars) {
            extendTo(cursor, cursor + this.maxChars)
            flush()
            piece = null
            cursor += this.maxChars
          }
          extendTo(cursor, w.end)
        }
      }

      if (slideLength() >= this.minFillChars) {
        flush()
      }
    }

    flush()
    return slides
  }

  private toSlide(blocks: SlideBlock[]): SlideContent {
    const cleaned = blocks.map((b) => ({ ...b, runs: normalizeRuns(b.runs) }))
    return {
      blocks: cleaned,
      text: cleaned.map((b) => runsToText(b.runs)).join('\n\n'),
    }
  }
}

/** End offset (in paragraph text) of the piece currently on the slide. */
function pieceEnd(piece: SlideBlock, pieceStart: number): number | undefined {
  const len = runsToText(piece.runs).length
  return len === 0 ? undefined : pieceStart + len
}

/** Sentence spans: terminator-delimited, trimmed. A trailing fragment is a sentence too. */
function sentenceSpans(text: string): Span[] {
  const spans: Span[] = []
  const re = /[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++
      continue
    }
    const span = trimSpan(text, m.index, m.index + m[0].length)
    if (span.end > span.start) spans.push(span)
  }
  if (spans.length === 0 && text.trim().length > 0) {
    spans.push(trimSpan(text, 0, text.length))
  }
  return spans
}

function wordSpans(text: string, from: number, to: number): Span[] {
  const spans: Span[] = []
  const re = /\S+/g
  re.lastIndex = from
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null && m.index < to) {
    spans.push({ start: m.index, end: Math.min(to, m.index + m[0].length) })
  }
  return spans
}

function trimSpan(text: string, start: number, end: number): Span {
  while (start < end && /\s/.test(text[start]!)) start++
  while (end > start && /\s/.test(text[end - 1]!)) end--
  return { start, end }
}

/** Collapse whitespace across runs, drop empties, merge equal-format neighbours. */
function normalizeRuns(runs: Run[]): Run[] {
  const out: Run[] = []
  let prevEndsWithSpace = true // trims leading space of the first run
  for (const r of runs) {
    let t = r.text.replace(/\s+/g, ' ')
    if (prevEndsWithSpace && t.startsWith(' ')) t = t.slice(1)
    if (t.length === 0) continue
    prevEndsWithSpace = t.endsWith(' ')
    const last = out[out.length - 1]
    if (last && !!last.i === !!r.i && !!last.b === !!r.b && !!last.sup === !!r.sup) {
      last.text += t
    } else {
      out.push({ text: t, ...(r.i ? { i: true } : {}), ...(r.b ? { b: true } : {}), ...(r.sup ? { sup: true } : {}) })
    }
  }
  // trim trailing space
  const last = out[out.length - 1]
  if (last) {
    last.text = last.text.replace(/\s+$/, '')
    if (last.text.length === 0) out.pop()
  }
  return out
}

/** Slice a run list by character offsets of its joined text. */
function sliceRuns(runs: Run[], start: number, end: number): Run[] {
  const out: Run[] = []
  let offset = 0
  for (const r of runs) {
    const rStart = offset
    const rEnd = offset + r.text.length
    offset = rEnd
    if (rEnd <= start || rStart >= end) continue
    const from = Math.max(start, rStart) - rStart
    const to = Math.min(end, rEnd) - rStart
    const text = r.text.slice(from, to)
    if (text.length > 0) out.push({ ...r, text })
  }
  return normalizeRuns(out)
}

// Singleton instance
export const chunkerService = new ChunkerService()
