export type Interest =
  | 'fiction'
  | 'nonfiction'
  | 'classics'
  | 'philosophy'
  | 'mystery'
  | 'scifi'
  | 'nature'
  | 'business'

/** Labels for the interests a reader profile may carry (shown on the reader card). */
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
