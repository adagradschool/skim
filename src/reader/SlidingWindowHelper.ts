import { chunkerService } from '@/chunker/ChunkerService'
import type { ChunkConfig } from '@/chunker/types'
import type { Chapter } from '@/db/types'

export interface SlideWindow {
  slides: string[]           // Array of slide texts (max 11)
  currentIndex: number       // Index of current slide in window
  startWordOffset: number    // Word offset where slides[0] starts
  chapterIndex: number       // Which chapter these slides are from
  endWordOffset: number      // Word offset where last slide ends
  slideWordCounts: number[]  // Word count for each slide
}

export interface WindowConfig {
  prevCount: number          // Number of previous slides (default 5)
  nextCount: number          // Number of next slides (default 5)
}

const DEFAULT_WINDOW_CONFIG: WindowConfig = {
  prevCount: 5,
  nextCount: 5,
}

/**
 * Helper for managing sliding window of slides
 */
export class SlidingWindowHelper {
  /**
   * Split text into words, preserving whitespace
   */
  private splitIntoWords(text: string): string[] {
    return text.split(/(\s+)/).filter(token => token.length > 0)
  }

  /**
   * Count words in an array of tokens (excluding whitespace)
   */
  private countWordsInTokens(tokens: string[]): number {
    return tokens.filter(token => !/^\s+$/.test(token)).length
  }

  /**
   * Compute a new slide window around a target word offset
   * @param chapter - Full chapter text
   * @param targetWordOffset - Word position to center window around (0-indexed)
   * @param chunkConfig - Chunking configuration
   * @param windowConfig - Window size configuration
   * @returns Computed slide window
   */
  computeWindow(
    chapter: Chapter,
    targetWordOffset: number,
    chunkConfig: ChunkConfig,
    windowConfig: WindowConfig = DEFAULT_WINDOW_CONFIG
  ): SlideWindow {
    const { prevCount, nextCount } = windowConfig

    // Split chapter text into word tokens
    const allTokens = this.splitIntoWords(chapter.text)

    // Convert word offset to token index
    let wordCount = 0
    let targetTokenIndex = 0
    for (let i = 0; i < allTokens.length; i++) {
      if (!/^\s+$/.test(allTokens[i])) {
        if (wordCount >= targetWordOffset) {
          targetTokenIndex = i
          break
        }
        wordCount++
      }
    }
    if (wordCount < targetWordOffset) {
      targetTokenIndex = allTokens.length
    }

    // Get tokens before and after target
    const tokensBefore = allTokens.slice(0, targetTokenIndex)
    const tokensAfter = allTokens.slice(targetTokenIndex)

    // Chunk text before to get previous slides
    const textBefore = tokensBefore.join('')
    const slidesBefore = textBefore.length > 0
      ? chunkerService.chunkText(textBefore, chunkConfig)
      : []
    const prev = slidesBefore.slice(-prevCount)

    // Chunk text after to get current + next slides
    const textAfter = tokensAfter.join('')
    const slidesAfter = textAfter.length > 0
      ? chunkerService.chunkText(textAfter, chunkConfig)
      : []
    const currentAndNext = slidesAfter.slice(0, nextCount + 1)

    // Combine into window
    const slides = [...prev, ...currentAndNext]
    const currentIndex = prev.length

    // Calculate slideWordCounts
    const slideWordCounts = slides.map(slide => this.countWordsInTokens(this.splitIntoWords(slide)))

    // Calculate startWordOffset (words before first slide)
    const wordsBeforeWindow = this.countWordsInTokens(tokensBefore) - prev.reduce((sum, slide) => {
      return sum + this.countWordsInTokens(this.splitIntoWords(slide))
    }, 0)
    const startWordOffset = Math.max(0, wordsBeforeWindow)

    // Calculate endWordOffset
    const endWordOffset = startWordOffset + slideWordCounts.reduce((sum, count) => sum + count, 0)

    return {
      slides,
      currentIndex,
      startWordOffset,
      chapterIndex: chapter.chapterIndex,
      endWordOffset,
      slideWordCounts,
    }
  }

  /**
   * Check if a word offset is within the current window
   */
  isWithinWindow(window: SlideWindow, wordOffset: number): boolean {
    return wordOffset >= window.startWordOffset && wordOffset < window.endWordOffset
  }

  /**
   * Find the slide index in window that contains a word offset
   */
  findSlideIndexAtOffset(window: SlideWindow, wordOffset: number): number {
    if (wordOffset < window.startWordOffset) {
      return 0
    }

    let currentOffset = window.startWordOffset
    for (let i = 0; i < window.slides.length; i++) {
      const slideWordCount = window.slideWordCounts[i]
      if (wordOffset >= currentOffset && wordOffset < currentOffset + slideWordCount) {
        return i
      }
      currentOffset += slideWordCount
    }

    // Past the end of window
    return window.slides.length - 1
  }

  /**
   * Get word offset of a slide by its index in window
   */
  getOffsetAtSlideIndex(window: SlideWindow, slideIndex: number): number {
    if (slideIndex < 0) {
      return window.startWordOffset
    }

    let offset = window.startWordOffset
    for (let i = 0; i < slideIndex && i < window.slides.length; i++) {
      offset += window.slideWordCounts[i]
    }

    return offset
  }

  /**
   * Check if window needs shifting based on current index
   */
  needsShifting(window: SlideWindow, shiftThreshold = { forward: 8, backward: 2 }): 'forward' | 'backward' | null {
    if (window.currentIndex >= shiftThreshold.forward) {
      return 'forward'
    }
    if (window.currentIndex <= shiftThreshold.backward) {
      return 'backward'
    }
    return null
  }

  /**
   * Calculate total words in all chapters
   */
  getTotalWords(chapters: Chapter[]): number {
    return chapters.reduce((sum, ch) => sum + ch.words, 0)
  }

  /**
   * Calculate total words before a given chapter
   */
  getWordsBeforeChapter(chapters: Chapter[], chapterIndex: number): number {
    return chapters
      .slice(0, chapterIndex)
      .reduce((sum, ch) => sum + ch.words, 0)
  }

  /**
   * Calculate progress percentage based on word position
   */
  calculateProgress(chapters: Chapter[], chapterIndex: number, wordOffset: number): number {
    const totalWords = this.getTotalWords(chapters)
    if (totalWords === 0) return 0

    const wordsBefore = this.getWordsBeforeChapter(chapters, chapterIndex)
    const currentPosition = wordsBefore + wordOffset

    return (currentPosition / totalWords) * 100
  }

  /**
   * Find chapter and offset from a progress percentage
   */
  findPositionFromProgress(chapters: Chapter[], progressPercent: number): { chapterIndex: number; wordOffset: number } {
    const totalWords = this.getTotalWords(chapters)
    const targetWordPosition = Math.floor((progressPercent / 100) * totalWords)

    let remainingWords = targetWordPosition
    for (let i = 0; i < chapters.length; i++) {
      if (remainingWords <= chapters[i].words) {
        return {
          chapterIndex: i,
          wordOffset: remainingWords,
        }
      }
      remainingWords -= chapters[i].words
    }

    // Fallback to end of last chapter
    const lastChapter = chapters[chapters.length - 1]
    return {
      chapterIndex: chapters.length - 1,
      wordOffset: lastChapter ? lastChapter.words : 0,
    }
  }
}

// Singleton instance
export const slidingWindowHelper = new SlidingWindowHelper()
