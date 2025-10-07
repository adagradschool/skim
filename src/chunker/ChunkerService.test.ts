import { describe, expect, test } from 'bun:test'
import { ChunkerService } from './ChunkerService'

describe('ChunkerService - TDD Rewrite', () => {
  const chunker = new ChunkerService()

  describe('Algorithm: 2 sentences capped at 60 words, spillover to next slide', () => {

    // CASE 1: Two sentences ≤ 60 words
    test('Case 1: Two sentences fit within 60 words', () => {
      // S1: 10 words, S2: 10 words = 20 words total
      const text = 'One two three four five six seven eight nine ten. Eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty.'

      const result = chunker.chunkText(text)

      expect(result).toHaveLength(1)
      expect(result[0].split(/\s+/).length).toBe(20)
    })

    // CASE 2: Two sentences > 60 words - split at 60, carry remainder
    test('Case 2: Two sentences exceed 60 words, split and carry', () => {
      // S1: 20 words, S2: 50 words = 70 words total
      // Expected: Slide 1 = first 60 words, Carry = last 10 words
      const s1 = 'A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 A11 A12 A13 A14 A15 A16 A17 A18 A19 A20.'
      const s2 = 'B1 B2 B3 B4 B5 B6 B7 B8 B9 B10 B11 B12 B13 B14 B15 B16 B17 B18 B19 B20 B21 B22 B23 B24 B25 B26 B27 B28 B29 B30 B31 B32 B33 B34 B35 B36 B37 B38 B39 B40 B41 B42 B43 B44 B45 B46 B47 B48 B49 B50.'
      const text = `${s1} ${s2}`

      const result = chunker.chunkText(text)

      // First slide: 60 words
      expect(result[0].split(/\s+/).length).toBe(60)
      // Remaining slides should contain the rest
      const totalOutput = result.join(' ').split(/\s+/).length
      expect(totalOutput).toBe(70)
    })

    // CASE 3: First sentence alone > 60 words
    test('Case 3: Single sentence exceeds 60 words, split it', () => {
      // S1: 80 words
      const s1 = 'W1 W2 W3 W4 W5 W6 W7 W8 W9 W10 W11 W12 W13 W14 W15 W16 W17 W18 W19 W20 W21 W22 W23 W24 W25 W26 W27 W28 W29 W30 W31 W32 W33 W34 W35 W36 W37 W38 W39 W40 W41 W42 W43 W44 W45 W46 W47 W48 W49 W50 W51 W52 W53 W54 W55 W56 W57 W58 W59 W60 W61 W62 W63 W64 W65 W66 W67 W68 W69 W70 W71 W72 W73 W74 W75 W76 W77 W78 W79 W80.'

      const result = chunker.chunkText(s1)

      // First slide: 60 words
      expect(result[0].split(/\s+/).length).toBe(60)
      // Second slide: remaining 20 words
      expect(result[1].split(/\s+/).length).toBe(20)
    })

    // CASE 4: Only one sentence left, ≤ 60 words
    test('Case 4: Single sentence under 60 words, no more sentences', () => {
      const text = 'This is a single sentence with only fifteen words in it so it fits easily within limit.'

      const result = chunker.chunkText(text)

      expect(result).toHaveLength(1)
      expect(result[0].split(/\s+/).length).toBe(17) // Actual word count
    })

    // CASE 5: Fragment + next sentence ≤ 60, add one more sentence
    test('Case 5: Fragment + 1 sentence ≤ 60, add one more sentence to reach 2 sentences', () => {
      // S1: 20w, S2: 50w (total 70w → split at 60, carry 10w)
      // Fragment: 10w + S3: 30w = 40w (under 60)
      // Option A: fragment counts as 1 sentence, so we add S3 (that's 2 "sentences")
      // Should we then try to add S4? Let me re-read...
      // "Add the next two sentences" - if fragment counts as 1, we add 1 more
      // So: Fragment(10w) + S3(30w) = 40w, this becomes a slide
      const s1 = 'A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 A11 A12 A13 A14 A15 A16 A17 A18 A19 A20.'
      const s2 = 'B1 B2 B3 B4 B5 B6 B7 B8 B9 B10 B11 B12 B13 B14 B15 B16 B17 B18 B19 B20 B21 B22 B23 B24 B25 B26 B27 B28 B29 B30 B31 B32 B33 B34 B35 B36 B37 B38 B39 B40 B41 B42 B43 B44 B45 B46 B47 B48 B49 B50.'
      const s3 = 'C1 C2 C3 C4 C5 C6 C7 C8 C9 C10 C11 C12 C13 C14 C15 C16 C17 C18 C19 C20 C21 C22 C23 C24 C25 C26 C27 C28 C29 C30.'
      const text = `${s1} ${s2} ${s3}`

      const result = chunker.chunkText(text)

      // Slide 1: 60 words (all of S1 + first 40w of S2)
      expect(result[0].split(/\s+/).length).toBe(60)
      // Slide 2: 40 words (last 10w of S2 + all of S3)
      expect(result[1].split(/\s+/).length).toBe(40)
      expect(result).toHaveLength(2)
    })

    // CASE 6: Fragment + next sentence > 60 words
    test('Case 6: Fragment + 1 sentence > 60 words, split again', () => {
      // Fragment: 10w, S3: 55w = 65w → split at 60, carry 5w
      const s1 = 'A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 A11 A12 A13 A14 A15 A16 A17 A18 A19 A20.'
      const s2 = 'B1 B2 B3 B4 B5 B6 B7 B8 B9 B10 B11 B12 B13 B14 B15 B16 B17 B18 B19 B20 B21 B22 B23 B24 B25 B26 B27 B28 B29 B30 B31 B32 B33 B34 B35 B36 B37 B38 B39 B40 B41 B42 B43 B44 B45 B46 B47 B48 B49 B50.'
      const s3 = 'C1 C2 C3 C4 C5 C6 C7 C8 C9 C10 C11 C12 C13 C14 C15 C16 C17 C18 C19 C20 C21 C22 C23 C24 C25 C26 C27 C28 C29 C30 C31 C32 C33 C34 C35 C36 C37 C38 C39 C40 C41 C42 C43 C44 C45 C46 C47 C48 C49 C50 C51 C52 C53 C54 C55.'
      const text = `${s1} ${s2} ${s3}`

      const result = chunker.chunkText(text)

      // Slide 1: 60 words
      expect(result[0].split(/\s+/).length).toBe(60)
      // Slide 2: 60 words (10w carry from S2 + first 50w of S3)
      expect(result[1].split(/\s+/).length).toBe(60)
      // Slide 3: 5 words (remainder of S3)
      expect(result[2].split(/\s+/).length).toBe(5)
    })

    // CASE 7: End of text with fragment
    test('Case 7: Fragment at end with no more sentences', () => {
      // S1: 20w, S2: 50w (total 70w → split at 60, carry 10w)
      // No more sentences → fragment becomes final slide
      const s1 = 'A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 A11 A12 A13 A14 A15 A16 A17 A18 A19 A20.'
      const s2 = 'B1 B2 B3 B4 B5 B6 B7 B8 B9 B10 B11 B12 B13 B14 B15 B16 B17 B18 B19 B20 B21 B22 B23 B24 B25 B26 B27 B28 B29 B30 B31 B32 B33 B34 B35 B36 B37 B38 B39 B40 B41 B42 B43 B44 B45 B46 B47 B48 B49 B50.'
      const text = `${s1} ${s2}`

      const result = chunker.chunkText(text)

      // Slide 1: 60 words
      expect(result[0].split(/\s+/).length).toBe(60)
      // Slide 2: 10 words (fragment)
      expect(result[1].split(/\s+/).length).toBe(10)
    })

    // CASE 8: Empty text
    test('Case 8: Empty text returns no slides', () => {
      expect(chunker.chunkText('')).toEqual([])
      expect(chunker.chunkText('   ')).toEqual([])
    })

    // COMPREHENSIVE: No words lost
    test('Comprehensive: All input words appear in output', () => {
      // Complex scenario with multiple sentences of varying lengths
      const s1 = 'A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 A11 A12 A13 A14 A15 A16 A17 A18 A19 A20.'
      const s2 = 'B1 B2 B3 B4 B5 B6 B7 B8 B9 B10 B11 B12 B13 B14 B15 B16 B17 B18 B19 B20 B21 B22 B23 B24 B25 B26 B27 B28 B29 B30 B31 B32 B33 B34 B35 B36 B37 B38 B39 B40 B41 B42 B43 B44 B45 B46 B47 B48 B49 B50.'
      const s3 = 'C1 C2 C3 C4 C5 C6 C7 C8 C9 C10 C11 C12 C13 C14 C15 C16 C17 C18 C19 C20 C21 C22 C23 C24 C25 C26 C27 C28 C29 C30.'
      const s4 = 'D1 D2 D3 D4 D5 D6 D7 D8 D9 D10 D11 D12 D13 D14 D15 D16 D17 D18 D19 D20 D21 D22 D23 D24 D25.'
      const text = `${s1} ${s2} ${s3} ${s4}`

      const inputWords = text.split(/\s+/).filter(w => w.length > 0)
      const result = chunker.chunkText(text)
      const outputWords = result.join(' ').split(/\s+/).filter(w => w.length > 0)

      // No words should be lost
      expect(outputWords.length).toBe(inputWords.length)

      // Each word should appear same number of times
      const inputCounts = new Map<string, number>()
      const outputCounts = new Map<string, number>()

      inputWords.forEach(w => inputCounts.set(w, (inputCounts.get(w) || 0) + 1))
      outputWords.forEach(w => outputCounts.set(w, (outputCounts.get(w) || 0) + 1))

      expect(outputCounts).toEqual(inputCounts)
    })

    // COMPREHENSIVE: Each slide ≤ 60 words
    test('Comprehensive: No slide exceeds 60 words', () => {
      const s1 = 'A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 A11 A12 A13 A14 A15 A16 A17 A18 A19 A20.'
      const s2 = 'B1 B2 B3 B4 B5 B6 B7 B8 B9 B10 B11 B12 B13 B14 B15 B16 B17 B18 B19 B20 B21 B22 B23 B24 B25 B26 B27 B28 B29 B30 B31 B32 B33 B34 B35 B36 B37 B38 B39 B40 B41 B42 B43 B44 B45 B46 B47 B48 B49 B50.'
      const s3 = 'C1 C2 C3 C4 C5 C6 C7 C8 C9 C10 C11 C12 C13 C14 C15 C16 C17 C18 C19 C20 C21 C22 C23 C24 C25 C26 C27 C28 C29 C30.'
      const text = `${s1} ${s2} ${s3}`

      const result = chunker.chunkText(text)

      result.forEach((slide, i) => {
        const wordCount = slide.split(/\s+/).filter(w => w.length > 0).length
        expect(wordCount).toBeLessThanOrEqual(60)
      })
    })
  })
})
