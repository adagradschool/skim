import { describe, expect, it } from 'vitest'
import type { Progress } from '@/db/types'
import { deriveProgress } from '@/pages/HomePage'

describe('deriveProgress', () => {
  const progressBase: Progress = {
    bookId: 'book-1',
    slideIndex: 0,
    updatedAt: Date.now(),
  }

  it('returns start state when no progress', () => {
    const result = deriveProgress(undefined, 100)
    expect(result.percent).toBe(0)
    expect(result.actionLabel).toBe('Start')
  })

  it('returns start when slide index is 0', () => {
    const result = deriveProgress({ ...progressBase }, 50)
    expect(result.percent).toBe(0)
    expect(result.actionLabel).toBe('Start')
  })

  it('calculates resume percentage with rounding', () => {
    const progress: Progress = { ...progressBase, slideIndex: 66 }
    const result = deriveProgress(progress, 100)
    expect(result.percent).toBe(67)
    expect(result.actionLabel).toBe('Resume 67%')
  })

  it('caps percentage at 100', () => {
    const progress: Progress = { ...progressBase, slideIndex: 120 }
    const result = deriveProgress(progress, 100)
    expect(result.percent).toBe(100)
    expect(result.actionLabel).toBe('Resume 100%')
  })
})
