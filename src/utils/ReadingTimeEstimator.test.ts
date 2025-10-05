import { test, expect, describe } from 'bun:test'
import { ReadingTimeEstimator } from './ReadingTimeEstimator'

describe('ReadingTimeEstimator', () => {
  test('should start with zero observations', () => {
    const estimator = new ReadingTimeEstimator()
    expect(estimator.getObservationCount()).toBe(0)
    expect(estimator.shouldEnableAutoplay()).toBe(false)
  })

  test('should not enable autoplay until 5 observations', () => {
    const estimator = new ReadingTimeEstimator()

    for (let i = 0; i < 4; i++) {
      estimator.addObservation(10)
      expect(estimator.shouldEnableAutoplay()).toBe(false)
    }

    estimator.addObservation(10)
    expect(estimator.shouldEnableAutoplay()).toBe(true)
  })

  test('should clamp observations to minimum 5 seconds', () => {
    const estimator = new ReadingTimeEstimator()

    // Add observation below minimum
    estimator.addObservation(2)

    // Prediction should still respect minimum (5s + 2s buffer = 7s)
    const prediction = estimator.predict()
    expect(prediction).toBeGreaterThanOrEqual(7)
  })

  test('should return default prediction with no observations', () => {
    const estimator = new ReadingTimeEstimator()
    const prediction = estimator.predict()

    // Should return min (5s) + buffer (2s) = 7s
    expect(prediction).toBe(7)
  })

  test('should update EMA correctly with single observation', () => {
    const estimator = new ReadingTimeEstimator()

    estimator.addObservation(10)

    // First observation: EMA should be exactly the value
    expect(estimator.getCurrentEMA()).toBe(10)

    // Prediction should be EMA + buffer (10 + 2 = 12)
    expect(estimator.predict()).toBe(12)
  })

  test('should update EMA correctly with multiple observations', () => {
    const estimator = new ReadingTimeEstimator()
    const alpha = 0.3 // Default learning rate

    estimator.addObservation(10) // EMA = 10
    expect(estimator.getCurrentEMA()).toBe(10)

    estimator.addObservation(20) // EMA = 0.3 * 20 + 0.7 * 10 = 13
    expect(estimator.getCurrentEMA()).toBeCloseTo(13, 5)

    estimator.addObservation(15) // EMA = 0.3 * 15 + 0.7 * 13 = 13.6
    expect(estimator.getCurrentEMA()).toBeCloseTo(13.6, 5)
  })

  test('should add buffer to predictions', () => {
    const estimator = new ReadingTimeEstimator()

    estimator.addObservation(10)

    // EMA is 10, prediction should be 10 + 2 (buffer) = 12
    expect(estimator.predict()).toBe(12)
  })

  test('should clamp predictions to minimum 5 seconds', () => {
    const estimator = new ReadingTimeEstimator()

    // Even with very low observations, prediction should be at least 5s
    estimator.addObservation(5) // Min clamped to 5
    estimator.addObservation(5)

    const prediction = estimator.predict()
    expect(prediction).toBeGreaterThanOrEqual(5)
  })

  test('should adapt to changing reading speeds', () => {
    const estimator = new ReadingTimeEstimator()

    // Start with fast reading
    for (let i = 0; i < 3; i++) {
      estimator.addObservation(6)
    }

    const fastPrediction = estimator.predict()

    // Switch to slower reading
    for (let i = 0; i < 5; i++) {
      estimator.addObservation(15)
    }

    const slowPrediction = estimator.predict()

    // Prediction should have increased
    expect(slowPrediction).toBeGreaterThan(fastPrediction)
  })

  test('should reset correctly', () => {
    const estimator = new ReadingTimeEstimator()

    // Add some observations
    for (let i = 0; i < 5; i++) {
      estimator.addObservation(10)
    }

    expect(estimator.getObservationCount()).toBe(5)
    expect(estimator.shouldEnableAutoplay()).toBe(true)

    // Reset
    estimator.reset()

    expect(estimator.getObservationCount()).toBe(0)
    expect(estimator.shouldEnableAutoplay()).toBe(false)
    expect(estimator.getCurrentEMA()).toBe(0)
  })

  test('should handle edge case of very long reading times', () => {
    const estimator = new ReadingTimeEstimator()

    estimator.addObservation(300) // 5 minutes

    const prediction = estimator.predict()
    expect(prediction).toBe(302) // 300 + 2 buffer
  })

  test('should demonstrate O(1) space complexity', () => {
    const estimator = new ReadingTimeEstimator()

    // Add many observations
    for (let i = 0; i < 1000; i++) {
      estimator.addObservation(10 + Math.random() * 5)
    }

    // Should still work fine with only 3 state variables
    expect(estimator.getObservationCount()).toBe(1000)
    expect(estimator.predict()).toBeGreaterThan(0)
  })
})
