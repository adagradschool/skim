import { storageService } from '@/db/StorageService'

/**
 * Todoist-style score. Points accrue for reading and for finishing things;
 * levels are thresholds on lifetime points. No streaks: a missed day costs
 * nothing. Everything is derived from small counters kept in the KV store.
 */

export type ScoreEvent =
  | 'book_added'
  | 'slide_read'
  | 'chapter_done'
  | 'book_done'
  | 'note_saved'
  | 'goal_hit'

export const POINTS: Record<ScoreEvent, number> = {
  book_added: 20,
  slide_read: 1,
  chapter_done: 25,
  book_done: 250,
  note_saved: 10,
  goal_hit: 50,
}

export const EVENT_LABELS: Record<ScoreEvent, string> = {
  book_added: 'Add a book',
  slide_read: 'Read a slide',
  chapter_done: 'Finish a chapter',
  book_done: 'Finish a book',
  note_saved: 'Save a note',
  goal_hit: 'Hit your daily target',
}

export interface Level {
  index: number
  name: string
  min: number
  /** points needed for the next level, undefined at the top */
  next?: number
  /** 0..1 progress toward the next level */
  progress: number
}

export const LEVELS: Array<{ name: string; min: number }> = [
  { name: 'Novice', min: 0 },
  { name: 'Reader', min: 200 },
  { name: 'Bookworm', min: 1000 },
  { name: 'Scholar', min: 3000 },
  { name: 'Sage', min: 8000 },
  { name: 'Enlightened', min: 20000 },
]

export function levelFor(points: number): Level {
  let index = 0
  for (let i = 0; i < LEVELS.length; i++) {
    if (points >= LEVELS[i]!.min) index = i
  }
  const current = LEVELS[index]!
  const nextLevel = LEVELS[index + 1]
  const progress = nextLevel ? Math.min(1, (points - current.min) / (nextLevel.min - current.min)) : 1
  return { index, name: current.name, min: current.min, next: nextLevel?.min, progress }
}

export interface DailyStat {
  seconds: number
  slides: number
  goalHit?: boolean
}

export interface ScoreState {
  points: number
  counts: Record<ScoreEvent, number>
  /** ISO date -> stats, pruned to the last 60 days */
  daily: Record<string, DailyStat>
  finishedBooks: string[]
  updatedAt: number
}

export interface ReaderProfile {
  readerNumber: number
  joinedAt: number
  interests: string[]
  /** minutes per day */
  targetMinutes: number
}

export interface RecordResult {
  awarded: number
  state: ScoreState
  levelUp?: Level
}

const STATE_KEY = 'score:state'
const PROFILE_KEY = 'reader:profile'
const MAX_SLIDE_SECONDS = 90

export function emptyState(): ScoreState {
  return {
    points: 0,
    counts: { book_added: 0, slide_read: 0, chapter_done: 0, book_done: 0, note_saved: 0, goal_hit: 0 },
    daily: {},
    finishedBooks: [],
    updatedAt: 0,
  }
}

export function dayKey(ts: number = Date.now()): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

type Listener = (state: ScoreState) => void

/**
 * Pure state transitions, exported for tests. `apply` never touches storage.
 */
export function apply(state: ScoreState, event: ScoreEvent, opts: { bookId?: string; now?: number } = {}): RecordResult {
  const now = opts.now ?? Date.now()
  const before = levelFor(state.points)
  const next: ScoreState = {
    ...state,
    counts: { ...state.counts },
    daily: { ...state.daily },
    finishedBooks: [...state.finishedBooks],
  }

  if (event === 'book_done') {
    if (!opts.bookId || next.finishedBooks.includes(opts.bookId)) {
      return { awarded: 0, state }
    }
    next.finishedBooks.push(opts.bookId)
  }

  const awarded = POINTS[event]
  next.points += awarded
  next.counts[event] += 1
  next.updatedAt = now

  if (event === 'slide_read') {
    const key = dayKey(now)
    const day = next.daily[key] ?? { seconds: 0, slides: 0 }
    next.daily[key] = { ...day, slides: day.slides + 1 }
  }

  const after = levelFor(next.points)
  return { awarded, state: next, levelUp: after.index > before.index ? after : undefined }
}

/** Add reading time for today; returns goal-hit result when the target is first reached. */
export function applyReadingTime(
  state: ScoreState,
  seconds: number,
  targetMinutes: number,
  now: number = Date.now()
): RecordResult {
  const clamped = Math.max(0, Math.min(MAX_SLIDE_SECONDS, seconds))
  const key = dayKey(now)
  const day = state.daily[key] ?? { seconds: 0, slides: 0 }
  const updatedDay: DailyStat = { ...day, seconds: day.seconds + clamped }
  let next: ScoreState = { ...state, daily: { ...state.daily, [key]: updatedDay }, updatedAt: now }

  if (!updatedDay.goalHit && targetMinutes > 0 && updatedDay.seconds >= targetMinutes * 60) {
    next.daily[key] = { ...updatedDay, goalHit: true }
    const res = apply(next, 'goal_hit', { now })
    next = res.state
    next.daily[key] = { ...next.daily[key]!, goalHit: true }
    return { awarded: res.awarded, state: pruneDaily(next, now), levelUp: res.levelUp }
  }
  return { awarded: 0, state: pruneDaily(next, now) }
}

function pruneDaily(state: ScoreState, now: number): ScoreState {
  const cutoff = now - 60 * 24 * 60 * 60 * 1000
  const daily: Record<string, DailyStat> = {}
  for (const [k, v] of Object.entries(state.daily)) {
    if (new Date(k).getTime() >= cutoff) daily[k] = v
  }
  return { ...state, daily }
}

export function todayStats(state: ScoreState, now: number = Date.now()): DailyStat {
  return state.daily[dayKey(now)] ?? { seconds: 0, slides: 0 }
}

/** Last 7 days of minutes, oldest first. */
export function weekMinutes(state: ScoreState, now: number = Date.now()): number[] {
  const out: number[] = []
  for (let i = 6; i >= 0; i--) {
    const key = dayKey(now - i * 24 * 60 * 60 * 1000)
    out.push(Math.round((state.daily[key]?.seconds ?? 0) / 60))
  }
  return out
}

class Gamification {
  private state: ScoreState | null = null
  private profile: ReaderProfile | null | undefined = undefined
  private listeners = new Set<Listener>()
  private loading: Promise<ScoreState> | null = null

  async getState(): Promise<ScoreState> {
    if (this.state) return this.state
    if (!this.loading) {
      this.loading = (async () => {
        const stored = (await storageService.getKV(STATE_KEY)) as ScoreState | undefined
        this.state = stored ? { ...emptyState(), ...stored, counts: { ...emptyState().counts, ...stored.counts } } : emptyState()
        return this.state
      })()
    }
    return this.loading
  }

  async getProfile(): Promise<ReaderProfile | null> {
    if (this.profile !== undefined) return this.profile
    const stored = (await storageService.getKV(PROFILE_KEY)) as ReaderProfile | undefined
    this.profile = stored ?? null
    return this.profile
  }

  async saveProfile(profile: ReaderProfile): Promise<void> {
    this.profile = profile
    await storageService.setKV(PROFILE_KEY, profile)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async record(event: ScoreEvent, opts: { bookId?: string } = {}): Promise<RecordResult> {
    const state = await this.getState()
    const res = apply(state, event, opts)
    if (res.awarded > 0 || res.state !== state) await this.commit(res.state)
    return res
  }

  async addReadingTime(seconds: number): Promise<RecordResult> {
    const [state, profile] = await Promise.all([this.getState(), this.getProfile()])
    const res = applyReadingTime(state, seconds, profile?.targetMinutes ?? 0)
    await this.commit(res.state)
    return res
  }

  private async commit(state: ScoreState) {
    this.state = state
    await storageService.setKV(STATE_KEY, state)
    this.listeners.forEach((l) => l(state))
  }
}

export const gamification = new Gamification()
