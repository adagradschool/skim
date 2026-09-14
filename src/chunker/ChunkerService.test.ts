import { describe, expect, test } from 'bun:test'
import { ChunkerService, DEFAULT_MAX_CHARS_PER_SLIDE, runsToText, textToBlocks } from './ChunkerService'
import type { Block } from './types'

const words = (s: string) => s.split(/\s+/).filter((w) => w.length > 0)
const sentenceOf = (label: string, n: number) => Array.from({ length: n }, (_, i) => `${label}${i + 1}`).join(' ') + '.'
const para = (text: string): Block => ({ type: 'paragraph', runs: [{ text }] })
const heading = (text: string, level = 1): Block => ({ type: 'heading', level, runs: [{ text }] })

describe('ChunkerService - plain text', () => {
  const MAX = 40
  const chunker = new ChunkerService(MAX)

  test('default budget is 300 characters', () => {
    expect(DEFAULT_MAX_CHARS_PER_SLIDE).toBe(300)
    new ChunkerService().chunkText(sentenceOf('W', 200)).forEach((slide) => {
      expect(slide.length).toBeLessThanOrEqual(300)
    })
  })

  test('rejects a non-positive budget', () => {
    expect(() => new ChunkerService(0)).toThrow()
  })

  test('empty text returns no slides', () => {
    expect(chunker.chunkText('')).toEqual([])
    expect(chunker.chunkText('   ')).toEqual([])
  })

  test('sentences that fit together share a slide', () => {
    expect(chunker.chunkText('One two three. Four five six.')).toEqual(['One two three. Four five six.'])
  })

  test('a sentence that does not fit starts a new slide and stays whole', () => {
    const s1 = 'One two three four five six.' // 28
    const s2 = 'Seven eight nine ten.' // 21
    expect(chunker.chunkText(`${s1} ${s2}`)).toEqual([s1, s2])
  })

  test('a sentence longer than the budget is split at word boundaries', () => {
    const s = sentenceOf('W', 20)
    const result = chunker.chunkText(s)
    expect(result.length).toBeGreaterThan(1)
    result.forEach((slide) => {
      expect(slide.length).toBeLessThanOrEqual(MAX)
      expect(slide).toMatch(/^W\d+.*W\d+\.?$/)
    })
    expect(words(result.join(' '))).toEqual(words(s))
  })

  test('a single word longer than the budget is hard-split', () => {
    expect(chunker.chunkText('x'.repeat(95))).toEqual(['x'.repeat(40), 'x'.repeat(40), 'x'.repeat(15)])
  })

  test('trailing text without a terminator is kept', () => {
    expect(chunker.chunkText('First sentence. and then a fragment')).toEqual(['First sentence. and then a fragment'])
  })

  test('blank lines become paragraph breaks, other whitespace collapses', () => {
    expect(chunker.chunkText('One   two\nthree.\n\nFour\tfive.')).toEqual(['One two three.\n\nFour five.'])
    expect(textToBlocks('a\n\n\nb')).toHaveLength(2)
  })

  test('no slide exceeds the soft budget and no words are lost', () => {
    const text = [sentenceOf('A', 5), sentenceOf('B', 30), sentenceOf('C', 12), sentenceOf('D', 3), 'E1 E2 E3'].join(' ')
    const result = chunker.chunkText(text)
    result.forEach((slide) => {
      expect(slide.length).toBeLessThanOrEqual(Math.floor(MAX * 1.15))
      expect(slide).toBe(slide.trim())
    })
    expect(words(result.join(' '))).toEqual(words(text))
  })
})

describe('ChunkerService - structured blocks', () => {
  const MAX = 40
  const chunker = new ChunkerService(MAX)

  test('a heading is always its own slide', () => {
    const slides = chunker.chunkBlocks([heading('Introduction'), para('Short one.'), heading('Part Two', 2), para('Two.')])
    expect(slides.map((s) => s.text)).toEqual(['Introduction', 'Short one.', 'Part Two', 'Two.'])
    expect(slides[0]!.blocks[0]).toMatchObject({ type: 'heading', level: 1 })
    expect(slides[2]!.blocks[0]).toMatchObject({ type: 'heading', level: 2 })
  })

  test('short paragraphs share a slide but stay separate blocks', () => {
    const slides = chunker.chunkBlocks([para('One two.'), para('Three four.')])
    expect(slides).toHaveLength(1)
    expect(slides[0]!.blocks).toHaveLength(2)
    expect(slides[0]!.text).toBe('One two.\n\nThree four.')
    expect(slides[0]!.blocks[1]!.continued).toBeUndefined()
  })

  test('a paragraph end closes a slide once it is reasonably full', () => {
    // 28 chars is above 60% of 40, so the next paragraph starts fresh.
    const slides = chunker.chunkBlocks([para('One two three four five six.'), para('Seven.')])
    expect(slides.map((s) => s.text)).toEqual(['One two three four five six.', 'Seven.'])
  })

  test('a paragraph split across slides is marked continued on the second', () => {
    const text = `${sentenceOf('A', 6)} ${sentenceOf('B', 6)} ${sentenceOf('C', 6)}` // 3 x ~20 chars
    const slides = chunker.chunkBlocks([para(text)])
    expect(slides.length).toBeGreaterThan(1)
    expect(slides[0]!.blocks[0]!.continued).toBeUndefined()
    slides.slice(1).forEach((s) => expect(s.blocks[0]!.continued).toBe(true))
    expect(words(slides.map((s) => s.text).join(' '))).toEqual(words(text))
  })

  test('the last sentence may overflow slightly instead of orphaning', () => {
    // 30 chars + " " + 12 chars = 43 > 40 but <= 46 (soft), and it is the last sentence.
    const text = 'One two three four five six se. Eight nine.'
    const slides = chunker.chunkBlocks([para(text)])
    expect(slides).toHaveLength(1)
    expect(slides[0]!.text).toBe(text)
  })

  test('the soft overflow does not apply mid-paragraph', () => {
    const text = 'One two three four five six se. Eight nine. Ten eleven twelve.'
    const slides = chunker.chunkBlocks([para(text)])
    expect(slides[0]!.text).toBe('One two three four five six se.')
    expect(slides[1]!.text).toBe('Eight nine. Ten eleven twelve.')
    expect(slides[1]!.blocks[0]!.continued).toBe(true)
  })

  test('the first paragraph of a chapter gets a drop cap, later ones do not', () => {
    const slides = chunker.chunkBlocks([heading('Intro'), para('First.'), para('Second.')])
    const body = slides[1]!.blocks
    expect(body[0]!.dropCap).toBe(true)
    expect(body[1]!.dropCap).toBeUndefined()
  })

  test('a continued piece of the first paragraph has no drop cap', () => {
    const slides = chunker.chunkBlocks([para(`${sentenceOf('A', 8)} ${sentenceOf('B', 8)}`)])
    expect(slides[0]!.blocks[0]!.dropCap).toBe(true)
    expect(slides[1]!.blocks[0]!.dropCap).toBeUndefined()
  })

  test('inline emphasis survives splitting and is sliced at the cut', () => {
    const block: Block = {
      type: 'paragraph',
      runs: [{ text: 'Plain start ' }, { text: 'italic middle part here', i: true }, { text: ' and bold end.', b: true }],
    }
    // whole text is 50 chars: must split once.
    const slides = new ChunkerService(30).chunkBlocks([block])
    const joined = slides.flatMap((s) => s.blocks[0]!.runs)
    expect(joined.some((r) => r.i)).toBe(true)
    expect(joined.some((r) => r.b)).toBe(true)
    expect(words(slides.map((s) => s.text).join(' '))).toEqual(words(runsToText(block.runs)))
    slides.forEach((s) => expect(s.text.length).toBeLessThanOrEqual(30))
  })

  test('list items keep their markers and quotes keep their type', () => {
    const slides = chunker.chunkBlocks([
      { type: 'list', marker: '1.', runs: [{ text: 'First item.' }] },
      { type: 'quote', runs: [{ text: 'Quoted.' }] },
    ])
    expect(slides[0]!.blocks[0]).toMatchObject({ type: 'list', marker: '1.' })
    expect(slides[0]!.blocks[1]).toMatchObject({ type: 'quote' })
  })

  test('empty and whitespace-only blocks are skipped', () => {
    const slides = chunker.chunkBlocks([para('   '), heading(''), para('Real.')])
    expect(slides.map((s) => s.text)).toEqual(['Real.'])
  })

  test('chunkChapter prefers blocks and falls back to text', () => {
    expect(chunker.chunkChapter({ text: 'ignored', blocks: [para('Used.')] })[0]!.text).toBe('Used.')
    expect(chunker.chunkChapter({ text: 'Fallback.' })[0]!.text).toBe('Fallback.')
  })
})
