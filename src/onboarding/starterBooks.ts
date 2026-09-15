export type Interest =
  | 'fiction'
  | 'nonfiction'
  | 'classics'
  | 'philosophy'
  | 'mystery'
  | 'scifi'
  | 'nature'
  | 'business'

export const INTERESTS: Array<{ id: Interest; label: string }> = [
  { id: 'fiction', label: 'Fiction' },
  { id: 'nonfiction', label: 'Non-fiction' },
  { id: 'classics', label: 'Classics' },
  { id: 'philosophy', label: 'Philosophy' },
  { id: 'mystery', label: 'Mystery' },
  { id: 'scifi', label: 'Sci-fi' },
  { id: 'nature', label: 'Nature' },
  { id: 'business', label: 'Business' },
]

export interface StarterBook {
  id: string
  title: string
  author: string
  blurb: string
  /** path under public/ */
  file: string
  cover: string
  tags: Interest[]
  source: 'Standard Ebooks' | 'Project Gutenberg' | 'Cory Doctorow, CC BY-NC-SA'
  minutes: number
}

export const STARTER_BOOKS: StarterBook[] = [
  {
    id: 'pride-and-prejudice',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    blurb: 'Sharp, funny, and still the best romance ever written.',
    file: '/books/pride-and-prejudice.epub',
    cover: '/onboarding/cover-pride-and-prejudice.svg',
    tags: ['fiction', 'classics'],
    source: 'Standard Ebooks',
    minutes: 540,
  },
  {
    id: 'the-great-gatsby',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    blurb: 'A short, glittering novel about wanting what you can’t have.',
    file: '/books/the-great-gatsby.epub',
    cover: '/onboarding/cover-the-great-gatsby.svg',
    tags: ['fiction', 'classics'],
    source: 'Standard Ebooks',
    minutes: 200,
  },
  {
    id: 'frankenstein',
    title: 'Frankenstein',
    author: 'Mary Shelley',
    blurb: 'The first science-fiction novel, written by a nineteen-year-old.',
    file: '/books/frankenstein.epub',
    cover: '/onboarding/cover-frankenstein.svg',
    tags: ['fiction', 'scifi', 'classics'],
    source: 'Standard Ebooks',
    minutes: 330,
  },
  {
    id: 'sherlock-holmes',
    title: 'The Adventures of Sherlock Holmes',
    author: 'Arthur Conan Doyle',
    blurb: 'Twelve cases. Perfect for reading one at a time.',
    file: '/books/sherlock-holmes.epub',
    cover: '/onboarding/cover-sherlock-holmes.svg',
    tags: ['fiction', 'mystery', 'classics'],
    source: 'Standard Ebooks',
    minutes: 420,
  },
  {
    id: 'meditations',
    title: 'Meditations',
    author: 'Marcus Aurelius',
    blurb: 'A Roman emperor’s private notes to himself. Read a page a day.',
    file: '/books/meditations.epub',
    cover: '/onboarding/cover-meditations.svg',
    tags: ['nonfiction', 'philosophy', 'classics'],
    source: 'Standard Ebooks',
    minutes: 240,
  },
  {
    id: 'walden',
    title: 'Walden',
    author: 'Henry David Thoreau',
    blurb: 'Two years in a cabin by a pond, and what it taught him.',
    file: '/books/walden.epub',
    cover: '/onboarding/cover-walden.svg',
    tags: ['nonfiction', 'nature', 'philosophy'],
    source: 'Standard Ebooks',
    minutes: 400,
  },
  {
    id: 'alice-in-wonderland',
    title: 'Alice’s Adventures in Wonderland',
    author: 'Lewis Carroll',
    blurb: 'Down the rabbit hole. Short, strange, and endlessly quotable.',
    file: '/books/alice-in-wonderland.epub',
    cover: '/onboarding/cover-alice-in-wonderland.svg',
    tags: ['fiction', 'classics'],
    source: 'Project Gutenberg',
    minutes: 120,
  },
  {
    id: 'little-brother',
    title: 'Little Brother',
    author: 'Cory Doctorow',
    blurb: 'A modern thriller about surveillance, released free by its author.',
    file: '/books/little-brother.epub',
    cover: '/onboarding/cover-little-brother.svg',
    tags: ['fiction', 'scifi'],
    source: 'Cory Doctorow, CC BY-NC-SA',
    minutes: 420,
  },
]

export const MAX_RECOMMENDED = 4

/** Books that match any chosen interest (at most MAX_RECOMMENDED), in shelf order. */
export function recommendedFor(interests: Interest[]): Set<string> {
  const pool = interests.length === 0 ? STARTER_BOOKS : STARTER_BOOKS.filter((b) => b.tags.some((t) => interests.includes(t)))
  // Prefer books matching more of the chosen interests, keep shelf order for ties.
  const ranked = pool
    .map((b, i) => ({ b, i, hits: b.tags.filter((t) => interests.includes(t)).length }))
    .sort((a, z) => z.hits - a.hits || a.i - z.i)
  return new Set(ranked.slice(0, MAX_RECOMMENDED).map((r) => r.b.id))
}
