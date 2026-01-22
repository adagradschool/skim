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
      estimator.addObservation(10, 100)
      expect(estimator.shouldEnableAutoplay()).toBe(false)
    }

    estimator.addObservation(10, 100)
    expect(estimator.shouldEnableAutoplay()).toBe(true)
  })

  test('should return default prediction with no observations', () => {
    const estimator = new ReadingTimeEstimator()
    const prediction = estimator.predict(0)

    // Should return buffer with no words to estimate against
    expect(prediction).toBe(2)
  })

  test('should estimate using average seconds per word with a single observation', () => {
    const estimator = new ReadingTimeEstimator()

    estimator.addObservation(10, 100)

    expect(estimator.getSlope()).toBeCloseTo(0.1, 5)
    expect(estimator.getIntercept()).toBe(0)

    // Prediction should be slope * words + buffer (10 + 2 = 12)
    expect(estimator.predict(100)).toBeCloseTo(12, 5)
  })

  test('should fit a linear regression for multiple observations', () => {
    const estimator = new ReadingTimeEstimator()

    estimator.addObservation(20, 100)
    estimator.addObservation(40, 200)
    estimator.addObservation(60, 300)

    expect(estimator.getSlope()).toBeCloseTo(0.2, 5)
    expect(estimator.getIntercept()).toBeCloseTo(0, 5)
  })

  test('should add buffer to predictions', () => {
    const estimator = new ReadingTimeEstimator()

    estimator.addObservation(10, 100)

    // Prediction should be 10 + 2 (buffer) = 12
    expect(estimator.predict(100)).toBe(12)
  })

  test('should fallback to average seconds per word when word counts do not vary', () => {
    const estimator = new ReadingTimeEstimator()

    estimator.addObservation(10, 100)
    estimator.addObservation(20, 100)

    const prediction = estimator.predict(100)
    expect(prediction).toBeCloseTo(17, 5)
  })

  test('should adapt to changing reading speeds', () => {
    const estimator = new ReadingTimeEstimator()

    // Start with fast reading
    for (let i = 0; i < 3; i++) {
      estimator.addObservation(6, 100)
    }

    const fastPrediction = estimator.predict(100)

    // Switch to slower reading
    for (let i = 0; i < 5; i++) {
      estimator.addObservation(15, 100)
    }

    const slowPrediction = estimator.predict(100)

    // Prediction should have increased
    expect(slowPrediction).toBeGreaterThan(fastPrediction)
  })

  test('should reset correctly', () => {
    const estimator = new ReadingTimeEstimator()

    // Add some observations
    for (let i = 0; i < 5; i++) {
      estimator.addObservation(10, 100)
    }

    expect(estimator.getObservationCount()).toBe(5)
    expect(estimator.shouldEnableAutoplay()).toBe(true)

    // Reset
    estimator.reset()

    expect(estimator.getObservationCount()).toBe(0)
    expect(estimator.shouldEnableAutoplay()).toBe(false)
    expect(estimator.getSlope()).toBeCloseTo(0.3, 5)
    expect(estimator.getIntercept()).toBe(0)
  })

  test('should handle edge case of very long reading times', () => {
    const estimator = new ReadingTimeEstimator()

    estimator.addObservation(300, 100) // 5 minutes for 100 words

    const prediction = estimator.predict(100)
    expect(prediction).toBe(302) // 300 + 2 buffer
  })

  test('should demonstrate O(1) space complexity', () => {
    const estimator = new ReadingTimeEstimator()

    // Add many observations
    for (let i = 0; i < 1000; i++) {
      estimator.addObservation(10 + Math.random() * 5, 100 + i)
    }

    // Should still work fine with constant state size
    expect(estimator.getObservationCount()).toBe(1000)
    expect(estimator.predict(200)).toBeGreaterThan(0)
  })
})
