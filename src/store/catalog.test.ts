import { describe, expect, it } from 'vitest'
import { cover2x, filterCatalog, formatMinutes, orderFeatured, type CatalogBook } from './catalog'

const book = (id: string, title: string, author: string, tags: string[], rank: number): CatalogBook => ({
  id,
  title,
  author,
  blurb: '',
  epub: `https://standardebooks.org/ebooks/${id}/downloads/x.epub?source=download`,
  cover: `https://standardebooks.org/images/covers/${id.replace('/', '_')}/abc/cover.jpg`,
  words: 1000,
  minutes: 4,
  tags,
  rank,
})

const books = [
  book('jane-austen/emma', 'Emma', 'Jane Austen', ['fiction'], 0),
  book('h-g-wells/the-time-machine', 'The Time Machine', 'H. G. Wells', ['science-fiction'], 1),
  book('gaston-leroux/le-fantome', 'The Phantom of the Opéra', 'Gaston Leroux', ['fiction', 'horror'], 2),
]

describe('filterCatalog', () => {
  it('returns everything in order with no query or tag', () => {
    expect(filterCatalog(books, '', null).map((b) => b.id)).toEqual(books.map((b) => b.id))
  })
  it('matches every term against title and author, case-insensitively', () => {
    expect(filterCatalog(books, 'wells time', null).map((b) => b.id)).toEqual(['h-g-wells/the-time-machine'])
    expect(filterCatalog(books, 'AUSTEN', null)).toHaveLength(1)
  })
  it('ignores accents', () => {
    expect(filterCatalog(books, 'opera', null)).toHaveLength(1)
  })
  it('filters by tag and combines with search', () => {
    expect(filterCatalog(books, '', 'fiction')).toHaveLength(2)
    expect(filterCatalog(books, 'phantom', 'horror')).toHaveLength(1)
    expect(filterCatalog(books, 'emma', 'horror')).toHaveLength(0)
  })
})

describe('formatMinutes', () => {
  it('formats minutes and hours', () => {
    expect(formatMinutes(45)).toBe('45 min')
    expect(formatMinutes(60)).toBe('1 h')
    expect(formatMinutes(125)).toBe('2 h 5 min')
  })
})

describe('orderFeatured', () => {
  it('puts picks first in the given order, then the rest by rank, skipping unknown ids', () => {
    const shuffled = [books[2]!, books[0]!, books[1]!]
    const out = orderFeatured(shuffled, ['h-g-wells/the-time-machine', 'nobody/nothing'])
    expect(out.map((b) => b.id)).toEqual(['h-g-wells/the-time-machine', 'jane-austen/emma', 'gaston-leroux/le-fantome'])
  })
})

describe('cover2x', () => {
  it('points at the retina cover beside the 1x one', () => {
    expect(cover2x(books[0]!)).toMatch(/\/cover@2x\.jpg$/)
  })
})
