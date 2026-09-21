import { importService } from '@/importer/ImportService'
import { storageService } from '@/db/StorageService'
import { extractArticleFromHtml, extractUrlFromText, rewriteForReadability } from './extract'

export { rewriteForReadability }
import { fetchPageHtml } from './fetchArticle'

export type ArticleStage = 'fetching' | 'extracting' | 'saving' | 'done'

export interface SaveArticleOptions {
  onStage?: (stage: ArticleStage, detail?: string) => void
  signal?: AbortSignal
}

export function normalizeArticleUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const fromText = extractUrlFromText(trimmed)
  if (fromText) return rewriteForReadability(fromText)
  // bare domain / path without scheme
  if (/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(trimmed)) return rewriteForReadability(`https://${trimmed}`)
  return null
}

/** Fetch, extract and store a web page as an article. Returns the new book id. */
export async function saveArticleFromUrl(rawUrl: string, options: SaveArticleOptions = {}): Promise<string> {
  const url = normalizeArticleUrl(rawUrl)
  if (!url) throw new Error('That doesn’t look like a link')

  // Already saved? Reopen it rather than storing a duplicate.
  const existing = (await storageService.getAllBooks()).find((b) => b.kind === 'article' && b.sourceUrl === url)
  if (existing) return existing.id

  options.onStage?.('fetching', hostOf(url))
  const page = await fetchPageHtml(url)
  if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError')

  if (page.kind === 'pdf') {
    options.onStage?.('saving', hostOf(url))
    const name = decodeURIComponent((page.finalUrl.split('/').pop() || 'document').split(/[?#]/)[0] || 'document')
    const file = new File([page.blob], name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`, { type: 'application/pdf' })
    const id = await importService.import(file, { signal: options.signal, sourceId: `url:${url}` })
    options.onStage?.('done', name)
    return id
  }

  options.onStage?.('extracting')
  const article = extractArticleFromHtml(page.html, page.finalUrl || url)
  // Keep the URL the user shared as the identity, so re-sharing finds it.
  article.url = url

  options.onStage?.('saving', article.title)
  const bookId = await importService.importArticle(article, { signal: options.signal })
  options.onStage?.('done', article.title)
  return bookId
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Minutes to read at a typical pace, for list rows. */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 220))
}
