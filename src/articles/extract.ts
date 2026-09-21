import { Readability } from '@mozilla/readability'
import DOMPurify from 'dompurify'
import type { ChapterText } from '@/parser/types'
import type { Block } from '@/chunker/types'
import { blocksToText, extractBlocks } from '@/parser/htmlBlocks'

export interface ExtractedArticle {
  title: string
  byline?: string
  siteName?: string
  excerpt?: string
  url: string
  chapters: ChapterText[]
  words: number
}

const ALLOWED_TAGS = [
  'p', 'div', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li', 'ul', 'ol',
  'section', 'article', 'aside', 'header', 'footer', 'figure', 'figcaption', 'pre', 'code',
  'table', 'tr', 'td', 'th', 'dl', 'dd', 'dt', 'main',
  'em', 'i', 'strong', 'b', 'sup', 'sub', 'span', 'a', 'cite', 'dfn', 'var', 'small', 'q',
]

const MIN_WORDS = 40
export const JS_ONLY_MESSAGE = 'That page builds its content with JavaScript, so Skim can’t read it. Open it in the browser instead.'

/** A near-empty body with scripts, or an explicit "enable JavaScript" note. */
function looksClientRendered(html: string, doc: Document): boolean {
  const bodyWords = countWords(doc.body?.textContent ?? '')
  if (/enable javascript|requires javascript|javascript is (required|disabled)/i.test(html)) return true
  // A page this empty is a shell that fills itself in with scripts.
  return bodyWords < 120
}

/**
 * Turn a fetched HTML page into Skim chapters.
 *
 * Readability finds the article body and metadata; DOMPurify strips
 * everything but text structure; the shared block extractor keeps
 * headings, paragraphs, quotes, lists and emphasis; then the article is
 * split into chapters at its top-level headings so the chapter index is
 * useful for long reads.
 */
export function extractArticleFromHtml(html: string, url: string): ExtractedArticle {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // Resolve relative links/images against the page and help Readability with the URL.
  const base = doc.createElement('base')
  base.href = url
  doc.head?.prepend(base)

  const reader = new Readability(doc, { charThreshold: 200 })
  const parsed = reader.parse()
  if (!parsed || !parsed.content) {
    throw new Error(looksClientRendered(html, doc) ? JS_ONLY_MESSAGE : 'Couldn’t find an article on that page')
  }

  const clean = DOMPurify.sanitize(parsed.content, { ALLOWED_TAGS, ALLOWED_ATTR: ['start'], KEEP_CONTENT: true })
  const container = document.createElement('div')
  container.innerHTML = clean
  container.querySelectorAll('script, style').forEach((el) => el.remove())

  let blocks = extractBlocks(container)
  const title = pickTitle(blocks, parsed.title || doc.title || hostOf(url), parsed.siteName || undefined)
  blocks = dropDuplicateTitle(blocks, title)

  const words = countWords(blocksToText(blocks))
  if (words < MIN_WORDS) {
    throw new Error(looksClientRendered(html, doc) ? JS_ONLY_MESSAGE : 'That page has no readable article text')
  }

  return {
    title,
    byline: parsed.byline?.trim() || undefined,
    siteName: parsed.siteName?.trim() || hostOf(url),
    excerpt: parsed.excerpt?.trim() || undefined,
    url,
    chapters: splitIntoChapters(blocks, title),
    words,
  }
}

/** Split at h1/h2 headings when there are at least two; otherwise one chapter. */
export function splitIntoChapters(blocks: Block[], title: string): ChapterText[] {
  const isTop = (b: Block) => b.type === 'heading' && (b.level ?? 6) <= 2
  const topCount = blocks.filter(isTop).length
  if (topCount < 2) {
    return [{ index: 0, title, text: blocksToText(blocks), href: '', blocks }]
  }

  const chapters: ChapterText[] = []
  let current: Block[] = []
  let currentTitle = title
  const flush = () => {
    if (current.length === 0) return
    chapters.push({ index: chapters.length, title: currentTitle, text: blocksToText(current), href: '', blocks: current })
    current = []
  }
  for (const b of blocks) {
    if (isTop(b)) {
      flush()
      currentTitle = b.runs.map((r) => r.text).join('').trim() || currentTitle
    }
    current.push(b)
  }
  flush()
  return chapters
}

/** Readability often leaves the page title as the first heading; the book title already carries it. */
function dropDuplicateTitle(blocks: Block[], title: string): Block[] {
  const first = blocks[0]
  if (first && first.type === 'heading') {
    const text = first.runs.map((r) => r.text).join('').trim().toLowerCase()
    if (text === title.trim().toLowerCase()) return blocks.slice(1)
  }
  return blocks
}

/**
 * The page <title> usually carries the site name ("Post | Site"). Prefer the
 * article's own top heading when it matches a piece of the title; otherwise
 * strip a trailing site-name segment.
 */
function pickTitle(blocks: Block[], pageTitle: string, siteName?: string): string {
  const clean = (t: string) => t.replace(/\s+/g, ' ').trim()
  const full = clean(pageTitle)
  const first = blocks.find((b) => b.type === 'heading' && (b.level ?? 6) <= 2)
  const h = first ? clean(first.runs.map((r) => r.text).join('')) : ''
  if (h.length >= 6 && (full.toLowerCase().includes(h.toLowerCase()) || h.toLowerCase().includes(full.toLowerCase()))) {
    return h
  }
  const parts = full.split(/\s+[|–—•·-]\s+/)
  if (parts.length > 1) {
    const first0 = parts[0]!
    const last = parts[parts.length - 1]!
    const site = siteName?.toLowerCase()
    // "Site - Post" (GitHub, some blogs)
    if (site && first0.toLowerCase() === site) return clean(parts.slice(1).join(' - '))
    if (/^github$/i.test(first0)) return clean(parts.slice(1).join(' - '))
    // "Post | Site"
    const looksLikeSite = site ? last.toLowerCase() === site : last.length <= 30
    if (looksLikeSite) return clean(parts.slice(0, -1).join(' - '))
  }
  return full
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'web'
  }
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length
}

/**
 * Pull a URL out of shared text. Browsers share "Title\nhttps://…",
 * sometimes just the URL, sometimes a sentence with a link in it.
 */
export function extractUrlFromText(text: string): string | null {
  if (!text) return null
  const trimmed = text.trim()
  const m = /https?:\/\/[^\s<>"')\]]+/i.exec(trimmed)
  if (!m) return null
  return m[0].replace(/[.,;:!?]+$/, '')
}

/** Sites whose default front end is client-rendered but keep a server-rendered twin. */
export function rewriteForReadability(url: string): string {
  try {
    const u = new URL(url)
    if (/^(www\.)?reddit\.com$/i.test(u.hostname)) {
      u.hostname = 'old.reddit.com'
      return u.toString()
    }
    return url
  } catch {
    return url
  }
}
