/**
 * Online reading time estimator using Exponential Moving Average (EMA)
 *
 * Tracks user's actual reading time per slide and predicts future reading times.
 * - O(1) time complexity per update
 * - O(1) space complexity
 * - Session-based (resets each reading session)
 */
export class ReadingTimeEstimator {
  private n: number = 0
  private ema: number = 0
  private alpha: number = 0.3 // Learning rate: higher = more weight to recent readings

  private static readonly MIN_OBSERVATIONS = 5
  private static readonly MIN_TIME_SECONDS = 5
  private static readonly BUFFER_SECONDS = 2

  /**
   * Add a new observation of actual reading time
   * @param timeSeconds The actual time spent on a slide (in seconds)
   */
  addObservation(timeSeconds: number): void {
    // Clamp input to minimum time
    const clampedTime = Math.max(timeSeconds, ReadingTimeEstimator.MIN_TIME_SECONDS)

    if (this.n === 0) {
      // First observation: initialize EMA
      this.ema = clampedTime
    } else {
      // Update EMA: ema = alpha * new_value + (1 - alpha) * old_ema
      this.ema = this.alpha * clampedTime + (1 - this.alpha) * this.ema
    }

    this.n++
  }

  /**
   * Predict the reading time for the next slide
   * Returns the predicted time with buffer, clamped to minimum
   * @returns Predicted time in seconds
   */
  predict(): number {
    if (this.n === 0) {
      // No data yet, return default
      return ReadingTimeEstimator.MIN_TIME_SECONDS + ReadingTimeEstimator.BUFFER_SECONDS
    }

    // Add buffer and clamp to minimum
    return Math.max(
      ReadingTimeEstimator.MIN_TIME_SECONDS,
      this.ema + ReadingTimeEstimator.BUFFER_SECONDS
    )
  }

  /**
   * Check if autoplay should be enabled
   * @returns true if we have enough observations to enable autoplay
   */
  shouldEnableAutoplay(): boolean {
    return this.n >= ReadingTimeEstimator.MIN_OBSERVATIONS
  }

  /**
   * Get the number of observations collected
   */
  getObservationCount(): number {
    return this.n
  }

  /**
   * Get the current EMA value (for debugging/display)
   */
  getCurrentEMA(): number {
    return this.ema
  }

  /**
   * Reset the estimator (for new sessions)
   */
  reset(): void {
    this.n = 0
    this.ema = 0
  }
}
