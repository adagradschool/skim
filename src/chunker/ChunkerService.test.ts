import { describe, expect, test } from 'bun:test'
import { ChunkerService, DEFAULT_MAX_CHARS_PER_SLIDE } from './ChunkerService'

const words = (s: string) => s.split(/\s+/).filter((w) => w.length > 0)
const sentenceOf = (label: string, n: number) => Array.from({ length: n }, (_, i) => `${label}${i + 1}`).join(' ') + '.'

describe('ChunkerService - character budget', () => {
  // Small budget keeps fixtures readable. Each "Xn." token is 3-4 chars.
  const MAX = 40
  const chunker = new ChunkerService(MAX)

  test('default budget is 300 characters', () => {
    expect(DEFAULT_MAX_CHARS_PER_SLIDE).toBe(300)
    const long = sentenceOf('W', 200) // far over 300 chars
    new ChunkerService().chunkText(long).forEach((slide) => {
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
    const text = 'One two three. Four five six.' // 29 chars
    expect(chunker.chunkText(text)).toEqual(['One two three. Four five six.'])
  })

  test('a sentence that does not fit starts a new slide and stays whole', () => {
    const s1 = 'One two three four five six.' // 28
    const s2 = 'Seven eight nine ten.' // 21 -> 28 + 1 + 21 = 50 > 40
    expect(chunker.chunkText(`${s1} ${s2}`)).toEqual([s1, s2])
  })

  test('a sentence longer than the budget is split at word boundaries', () => {
    const s = sentenceOf('W', 20) // "W1 W2 ... W20." = 62 chars
    const result = chunker.chunkText(s)
    expect(result.length).toBeGreaterThan(1)
    result.forEach((slide) => expect(slide.length).toBeLessThanOrEqual(MAX))
    expect(words(result.join(' '))).toEqual(words(s))
    // Boundaries fall between words: every slide starts and ends on a token.
    result.forEach((slide) => expect(slide).toMatch(/^W\d+.*W\d+\.?$/))
  })

  test('a long sentence fills the room left on the current slide first', () => {
    const s1 = 'Short one.' // 10
    const s2 = sentenceOf('W', 20)
    const result = chunker.chunkText(`${s1} ${s2}`)
    expect(result[0]!.startsWith('Short one. W1')).toBe(true)
    expect(result[0]!.length).toBeLessThanOrEqual(MAX)
  })

  test('the tail of a split sentence can be joined by the next sentence', () => {
    const s1 = sentenceOf('W', 14) // 44 chars: overflows a 40 budget by a few tokens
    const s2 = 'Tail.' // 5
    const result = chunker.chunkText(`${s1} ${s2}`)
    expect(result).toHaveLength(2)
    expect(result[1]!.endsWith('W14. Tail.')).toBe(true)
  })

  test('a single word longer than the budget is hard-split', () => {
    const word = 'x'.repeat(95)
    const result = chunker.chunkText(word)
    expect(result).toEqual(['x'.repeat(40), 'x'.repeat(40), 'x'.repeat(15)])
  })

  test('trailing text without a terminator is kept', () => {
    const text = 'First sentence. and then a fragment'
    expect(chunker.chunkText(text)).toEqual(['First sentence. and then a fragment'])
  })

  test('internal whitespace and newlines are normalized', () => {
    const text = 'One   two\nthree.  Four\n\nfive.'
    expect(chunker.chunkText(text)).toEqual(['One two three. Four five.'])
  })

  test('no slide exceeds the budget and no words are lost', () => {
    const text = [sentenceOf('A', 5), sentenceOf('B', 30), sentenceOf('C', 12), sentenceOf('D', 3), 'E1 E2 E3'].join(' ')
    const result = chunker.chunkText(text)

    result.forEach((slide) => {
      expect(slide.length).toBeLessThanOrEqual(MAX)
      expect(slide.length).toBeGreaterThan(0)
      expect(slide).toBe(slide.trim())
    })
    expect(words(result.join(' '))).toEqual(words(text))
  })
})
