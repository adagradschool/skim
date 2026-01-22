/**
 * Online reading time estimator using running linear regression.
 *
 * Tracks user's actual reading time per slide and predicts future reading times
 * based on word count (per-book session).
 * - O(1) time complexity per update
 * - O(1) space complexity
 * - Session-based (resets each reading session)
 */
export class ReadingTimeEstimator {
  private n: number = 0
  private sumWords: number = 0
  private sumTime: number = 0
  private sumWordsSquared: number = 0
  private sumWordsTime: number = 0

  private static readonly MIN_OBSERVATIONS = 5
  private static readonly BUFFER_SECONDS = 2
  private static readonly DEFAULT_SECONDS_PER_WORD = 0.3

  /**
   * Add a new observation of actual reading time
   * @param timeSeconds The actual time spent on a slide (in seconds)
   * @param wordCount The number of words on the slide
   */
  addObservation(timeSeconds: number, wordCount: number): void {
    if (
      !Number.isFinite(timeSeconds) ||
      !Number.isFinite(wordCount) ||
      timeSeconds <= 0 ||
      wordCount <= 0
    ) {
      return
    }

    this.n += 1
    this.sumWords += wordCount
    this.sumTime += timeSeconds
    this.sumWordsSquared += wordCount * wordCount
    this.sumWordsTime += wordCount * timeSeconds
  }

  /**
   * Predict the reading time for the next slide
   * Returns the predicted time with buffer
   * @param wordCount The number of words on the slide
   * @returns Predicted time in seconds
   */
  predict(wordCount: number): number {
    const sanitizedWords = Number.isFinite(wordCount)
      ? Math.max(wordCount, 0)
      : 0
    const baseSeconds = this.getPredictedSeconds(sanitizedWords)
    const bufferedSeconds = baseSeconds + ReadingTimeEstimator.BUFFER_SECONDS

    return Math.max(ReadingTimeEstimator.BUFFER_SECONDS, bufferedSeconds)
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
   * Get the current regression slope (seconds per word)
   */
  getSlope(): number {
    return this.getRegression().slope
  }

  /**
   * Get the current regression intercept (seconds)
   */
  getIntercept(): number {
    return this.getRegression().intercept
  }

  /**
   * Reset the estimator (for new sessions)
   */
  reset(): void {
    this.n = 0
    this.sumWords = 0
    this.sumTime = 0
    this.sumWordsSquared = 0
    this.sumWordsTime = 0
  }

  private getRegression(): { slope: number; intercept: number } {
    if (this.n < 2 || this.sumWords === 0) {
      return { slope: this.getAverageSecondsPerWord(), intercept: 0 }
    }

    const denominator =
      this.n * this.sumWordsSquared - this.sumWords * this.sumWords
    if (denominator === 0) {
      return { slope: this.getAverageSecondsPerWord(), intercept: 0 }
    }

    const slope =
      (this.n * this.sumWordsTime - this.sumWords * this.sumTime) / denominator
    const intercept = (this.sumTime - slope * this.sumWords) / this.n

    return { slope, intercept }
  }

  private getAverageSecondsPerWord(): number {
    if (this.sumWords > 0) {
      return this.sumTime / this.sumWords
    }
    return ReadingTimeEstimator.DEFAULT_SECONDS_PER_WORD
  }

  private getPredictedSeconds(wordCount: number): number {
    const { slope, intercept } = this.getRegression()
    return intercept + slope * wordCount
  }
}
