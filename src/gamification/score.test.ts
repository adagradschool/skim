import { describe, expect, test } from 'bun:test'
import { apply, applyReadingTime, dayKey, emptyState, levelFor, LEVELS, POINTS, weekMinutes } from './score'

const NOW = new Date('2026-09-15T10:00:00').getTime()

describe('levels', () => {
  test('thresholds map to names and progress', () => {
    expect(levelFor(0)).toMatchObject({ name: 'Novice', index: 0, next: 200 })
    expect(levelFor(199).name).toBe('Novice')
    expect(levelFor(200)).toMatchObject({ name: 'Reader', index: 1 })
    expect(levelFor(600).progress).toBeCloseTo(0.5, 5)
    const top = levelFor(LEVELS[LEVELS.length - 1]!.min + 5000)
    expect(top).toMatchObject({ name: 'Enlightened', progress: 1 })
    expect(top.next).toBeUndefined()
  })
})

describe('apply', () => {
  test('awards points and counts the event', () => {
    const r = apply(emptyState(), 'chapter_done', { now: NOW })
    expect(r.awarded).toBe(POINTS.chapter_done)
    expect(r.state.points).toBe(25)
    expect(r.state.counts.chapter_done).toBe(1)
  })

  test('does not mutate the input state', () => {
    const s = emptyState()
    apply(s, 'slide_read', { now: NOW })
    expect(s.points).toBe(0)
    expect(s.daily).toEqual({})
  })

  test('slide reads are tallied per day', () => {
    let s = emptyState()
    s = apply(s, 'slide_read', { now: NOW }).state
    s = apply(s, 'slide_read', { now: NOW }).state
    expect(s.daily[dayKey(NOW)]!.slides).toBe(2)
  })

  test('a book only pays out once', () => {
    let s = emptyState()
    const first = apply(s, 'book_done', { bookId: 'b1', now: NOW })
    expect(first.awarded).toBe(POINTS.book_done)
    s = first.state
    const again = apply(s, 'book_done', { bookId: 'b1', now: NOW })
    expect(again.awarded).toBe(0)
    expect(again.state.points).toBe(POINTS.book_done)
    expect(apply(s, 'book_done', { now: NOW }).awarded).toBe(0) // no id
  })

  test('reports a level up when a threshold is crossed', () => {
    const s = { ...emptyState(), points: 190 }
    const r = apply(s, 'book_added', { now: NOW })
    expect(r.levelUp?.name).toBe('Reader')
    expect(apply(r.state, 'slide_read', { now: NOW }).levelUp).toBeUndefined()
  })
})

describe('reading time and daily target', () => {
  test('accumulates seconds, clamped per slide', () => {
    let s = emptyState()
    s = applyReadingTime(s, 30, 10, NOW).state
    s = applyReadingTime(s, 500, 10, NOW).state // clamped to 90
    expect(s.daily[dayKey(NOW)]!.seconds).toBe(120)
  })

  test('pays the goal bonus once when the target is reached', () => {
    let s = emptyState()
    let hits = 0
    for (let i = 0; i < 12; i++) {
      const r = applyReadingTime(s, 60, 10, NOW)
      if (r.awarded > 0) hits++
      s = r.state
    }
    expect(hits).toBe(1)
    expect(s.points).toBe(POINTS.goal_hit)
    expect(s.daily[dayKey(NOW)]!.goalHit).toBe(true)
  })

  test('no target means no bonus', () => {
    let s = emptyState()
    for (let i = 0; i < 20; i++) s = applyReadingTime(s, 60, 0, NOW).state
    expect(s.points).toBe(0)
  })

  test('weekMinutes returns seven days oldest first', () => {
    let s = emptyState()
    s = applyReadingTime(s, 90, 0, NOW).state
    s = applyReadingTime(s, 60, 0, NOW - 24 * 60 * 60 * 1000).state
    const w = weekMinutes(s, NOW)
    expect(w).toHaveLength(7)
    expect(w[6]).toBe(2) // today: 90s rounds to 2
    expect(w[5]).toBe(1)
  })

  test('old days are pruned', () => {
    let s = emptyState()
    s = applyReadingTime(s, 60, 0, NOW - 90 * 24 * 60 * 60 * 1000).state
    s = applyReadingTime(s, 60, 0, NOW).state
    expect(Object.keys(s.daily)).toEqual([dayKey(NOW)])
  })
})
