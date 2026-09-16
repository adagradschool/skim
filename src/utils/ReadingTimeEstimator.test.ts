import { describe, expect, test } from 'bun:test'
import { ReadingTimeEstimator } from './ReadingTimeEstimator'

const E = ReadingTimeEstimator

describe('ReadingTimeEstimator (robust speed model)', () => {
  test('starts from the prior and predicts sensibly before any data', () => {
    const m = new E()
    expect(m.getCharsPerSecond()).toBeCloseTo(E.PRIOR_CPS, 5)
    // 280 chars at 14 cps = 20s, x1.15 + 1.5 ≈ 24.5s
    expect(m.predict(280)).toBeCloseTo(1.5 + (280 / 14) * 1.15, 3)
    expect(m.shouldEnableAutoplay()).toBe(false)
  })

  test('converges to a consistent reader quickly', () => {
    const m = new E()
    for (let i = 0; i < 8; i++) m.addObservation(10, 250) // 25 cps
    expect(m.getCharsPerSecond()).toBeGreaterThan(22)
    expect(m.getCharsPerSecond()).toBeLessThanOrEqual(25)
    expect(m.shouldEnableAutoplay()).toBe(true)
  })

  test('a long pause is ignored and does not make later predictions aggressive', () => {
    const m = new E()
    for (let i = 0; i < 6; i++) m.addObservation(12, 240) // 20 cps
    const before = m.predict(300)
    // phone put down for 10 minutes on a slide
    expect(m.addObservation(600, 240)).toBe(false)
    expect(m.predict(300)).toBeCloseTo(before, 6)
    // and a moderately long slide still gets a moderate prediction
    expect(m.predict(600)).toBeLessThanOrEqual(E.MAX_SECONDS)
    expect(m.predict(50)).toBeGreaterThanOrEqual(E.MIN_SECONDS)
  })

  test('auto-advanced slides are not learned from', () => {
    const m = new E()
    for (let i = 0; i < 4; i++) m.addObservation(10, 200)
    const cps = m.getCharsPerSecond()
    for (let i = 0; i < 20; i++) expect(m.addObservation(m.predict(200), 200, { auto: true })).toBe(false)
    expect(m.getCharsPerSecond()).toBe(cps)
    expect(m.getObservationCount()).toBe(4)
  })

  test('implausible speeds are ignored', () => {
    const m = new E()
    expect(m.addObservation(0.2, 300)).toBe(false) // reflexive double tap: 1500 cps
    expect(m.addObservation(40, 40)).toBe(false) // 1 cps stall (but under pause floor)
    expect(m.getObservationCount()).toBe(0)
  })

  test('one odd slide barely moves a settled estimate', () => {
    const m = new E()
    for (let i = 0; i < 30; i++) m.addObservation(10, 200) // 20 cps
    const before = m.getCharsPerSecond()
    m.addObservation(4, 200) // 50 cps: a skim, plausible but odd
    const after = m.getCharsPerSecond()
    expect(after).toBeGreaterThan(before)
    expect(after / before).toBeLessThan(1.15)
  })

  test('predictions are clamped and never rushed', () => {
    const m = new E()
    for (let i = 0; i < 10; i++) m.addObservation(2, 100) // 50 cps, a fast reader
    expect(m.predict(10)).toBe(E.MIN_SECONDS)
    expect(m.predict(100000)).toBe(E.MAX_SECONDS)
    // prediction for a normal slide is above the raw time by overhead + margin
    const raw = 300 / m.getCharsPerSecond()
    expect(m.predict(300)).toBeGreaterThan(raw)
  })

  test('survives a snapshot round trip and rejects a corrupt one', () => {
    const m = new E()
    for (let i = 0; i < 5; i++) m.addObservation(10, 300)
    const copy = new E(m.snapshot())
    expect(copy.getCharsPerSecond()).toBeCloseTo(m.getCharsPerSecond(), 10)
    expect(copy.getObservationCount()).toBe(5)
    const bad = new E({ logCps: Math.log(1000), n: 99 })
    expect(bad.getCharsPerSecond()).toBeCloseTo(E.PRIOR_CPS, 5)
    expect(bad.getObservationCount()).toBe(0)
  })

  test('reset returns to the prior', () => {
    const m = new E()
    for (let i = 0; i < 5; i++) m.addObservation(5, 300)
    m.reset()
    expect(m.getCharsPerSecond()).toBeCloseTo(E.PRIOR_CPS, 5)
    expect(m.shouldEnableAutoplay()).toBe(false)
  })
})
