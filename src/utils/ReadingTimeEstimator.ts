/**
 * Reading-speed model for auto-advance.
 *
 * Learns one number: the reader's speed in characters per second. It is an
 * exponentially weighted estimate kept in log space (speeds are ratios, so
 * averaging logs is far more stable than averaging seconds), started from a
 * prior of a typical adult reading pace.
 *
 * Robustness rules, in order:
 * - Observations from slides the auto-advance turned are ignored: their
 *   duration equals the prediction, so learning from them only echoes it.
 * - A pause (the reader put the phone down, the app went to the background)
 *   is any observation far longer than the model expects. It is ignored.
 * - Implausible speeds (a reflexive double tap, or a stall) are ignored.
 * - Step size starts large so the first few slides calibrate quickly, then
 *   settles to a slow EWMA so one odd slide barely moves the estimate.
 * - Predictions are clamped to a sane window and padded with a fixed
 *   overhead plus a safety margin, so the reader is never rushed.
 *
 * Serialisable, so the learned speed survives app restarts.
 */

export interface ReadingSpeedSnapshot {
  logCps: number
  n: number
}

export interface ObservationOptions {
  /** the slide was turned by the auto-advance timer, not the reader */
  auto?: boolean
}

export class ReadingTimeEstimator {
  static readonly PRIOR_CPS = 14 // ≈ 170 wpm at 5 chars/word
  static readonly MIN_CPS = 3 // slower than this is not reading
  static readonly MAX_CPS = 60 // faster than this is a skip
  static readonly MIN_SECONDS = 3
  static readonly MAX_SECONDS = 60
  static readonly OVERHEAD_SECONDS = 1.5
  static readonly SAFETY = 1.15
  static readonly MIN_OBSERVATIONS = 3
  static readonly PAUSE_FACTOR = 3 // longer than 3x expected = pause
  static readonly PAUSE_FLOOR_SECONDS = 45
  static readonly STEADY_ALPHA = 0.12

  private logCps = Math.log(ReadingTimeEstimator.PRIOR_CPS)
  private n = 0

  constructor(snapshot?: ReadingSpeedSnapshot | null) {
    if (snapshot) this.restore(snapshot)
  }

  /**
   * Add one observation.
   * @param timeSeconds seconds the reader spent on the slide
   * @param chars characters of text on the slide
   * @returns true if the observation was used
   */
  addObservation(timeSeconds: number, chars: number, options: ObservationOptions = {}): boolean {
    if (options.auto) return false
    if (!Number.isFinite(timeSeconds) || !Number.isFinite(chars) || chars <= 0 || timeSeconds <= 0) return false

    // Pause: far longer than we'd predict for this slide.
    const expected = this.rawSeconds(chars)
    if (timeSeconds > Math.max(ReadingTimeEstimator.PAUSE_FLOOR_SECONDS, expected * ReadingTimeEstimator.PAUSE_FACTOR)) {
      return false
    }

    const cps = chars / timeSeconds
    if (cps < ReadingTimeEstimator.MIN_CPS || cps > ReadingTimeEstimator.MAX_CPS) return false

    const alpha = Math.max(ReadingTimeEstimator.STEADY_ALPHA, 1 / (this.n + 2))
    this.logCps = (1 - alpha) * this.logCps + alpha * Math.log(cps)
    this.n += 1
    return true
  }

  /** Seconds to allow for a slide of `chars` characters, padded and clamped. */
  predict(chars: number): number {
    const c = Number.isFinite(chars) ? Math.max(0, chars) : 0
    const seconds = ReadingTimeEstimator.OVERHEAD_SECONDS + this.rawSeconds(c) * ReadingTimeEstimator.SAFETY
    return Math.min(ReadingTimeEstimator.MAX_SECONDS, Math.max(ReadingTimeEstimator.MIN_SECONDS, seconds))
  }

  shouldEnableAutoplay(): boolean {
    return this.n >= ReadingTimeEstimator.MIN_OBSERVATIONS
  }

  getObservationCount(): number {
    return this.n
  }

  /** Learned speed in characters per second. */
  getCharsPerSecond(): number {
    return Math.exp(this.logCps)
  }

  /** Approximate words per minute, for display. */
  getWordsPerMinute(): number {
    return Math.round((this.getCharsPerSecond() * 60) / 5.5)
  }

  reset(): void {
    this.logCps = Math.log(ReadingTimeEstimator.PRIOR_CPS)
    this.n = 0
  }

  snapshot(): ReadingSpeedSnapshot {
    return { logCps: this.logCps, n: this.n }
  }

  restore(snapshot: ReadingSpeedSnapshot): void {
    if (!snapshot || !Number.isFinite(snapshot.logCps) || !Number.isFinite(snapshot.n)) return
    const cps = Math.exp(snapshot.logCps)
    if (cps < ReadingTimeEstimator.MIN_CPS || cps > ReadingTimeEstimator.MAX_CPS) return
    this.logCps = snapshot.logCps
    this.n = Math.max(0, Math.floor(snapshot.n))
  }

  private rawSeconds(chars: number): number {
    return chars / this.getCharsPerSecond()
  }
}
