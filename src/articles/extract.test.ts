import { beforeAll, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'

// The extractor is browser code (DOMParser, DOMPurify, Readability need a
// window). Give it one before importing.
let extractArticleFromHtml: typeof import('./extract').extractArticleFromHtml
let extractUrlFromText: typeof import('./extract').extractUrlFromText
let splitIntoChapters: typeof import('./extract').splitIntoChapters

beforeAll(async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://example.com/' })
  const w = dom.window as unknown as Record<string, unknown>
  const g = globalThis as unknown as Record<string, unknown>
  for (const k of ['window', 'document', 'DOMParser', 'Node', 'Element', 'HTMLElement', 'NodeFilter', 'HTMLTemplateElement', 'DocumentFragment', 'Text', 'Comment']) {
    g[k] = k === 'window' ? dom.window : w[k]
  }
  const mod = await import('./extract')
  extractArticleFromHtml = mod.extractArticleFromHtml
  extractUrlFromText = mod.extractUrlFromText
  splitIntoChapters = mod.splitIntoChapters
})

const para = (i: number) =>
  `<p>Paragraph ${i}. This is a reasonably long sentence written so that the readability heuristics treat the body as real article text rather than navigation chrome or boilerplate. It keeps going for a while.</p>`

const PAGE = `<!doctype html><html><head><title>How to Read More | Example Blog</title>
<meta property="og:site_name" content="Example Blog"><meta name="author" content="Jane Doe"></head>
<body>
<nav><a href="/">Home</a> <a href="/about">About</a> <a href="/tag/x">Tag</a></nav>
<article>
<h1>How to Read More</h1>
<p class="byline">By Jane Doe</p>
${para(1)}${para(2)}
<h2>Start small</h2>
${para(3)}<p>Use <em>short</em> sessions and <strong>keep going</strong>.<sup>1</sup></p>
<blockquote><p>A quote about reading that is long enough to count as content in the extractor.</p></blockquote>
<h2>Build the habit</h2>
<ul><li>Read every day for ten minutes at least.</li><li>Carry a book everywhere you go, always.</li></ul>
${para(4)}${para(5)}
</article>
<footer><p>© Example Blog. All rights reserved. Privacy. Terms. Cookies.</p></footer>
</body></html>`

describe('extractArticleFromHtml', () => {
  test('finds the article, title, site, and drops chrome', () => {
    const a = extractArticleFromHtml(PAGE, 'https://example.com/read-more')
    expect(a.title).toBe('How to Read More')
    expect(a.siteName).toBe('Example Blog')
    const text = a.chapters.map((c) => c.text).join('\n')
    expect(text).toContain('Paragraph 1.')
    expect(text).toContain('Carry a book everywhere')
    expect(text).not.toContain('All rights reserved')
    expect(text).not.toMatch(/\bAbout\b\s+\bTag\b/)
    expect(a.words).toBeGreaterThan(100)
  })

  test('splits into chapters at top-level headings and keeps structure', () => {
    const a = extractArticleFromHtml(PAGE, 'https://example.com/read-more')
    expect(a.chapters.map((c) => c.title)).toEqual(['How to Read More', 'Start small', 'Build the habit'])
    const blocks = a.chapters.flatMap((c) => c.blocks ?? [])
    expect(blocks.some((b) => b.type === 'quote')).toBe(true)
    expect(blocks.some((b) => b.type === 'list')).toBe(true)
    expect(blocks.some((b) => b.runs.some((r) => r.i))).toBe(true)
    expect(blocks.some((b) => b.runs.some((r) => r.sup))).toBe(true)
    // duplicate h1 (same as title) is dropped from the body
    expect(a.chapters[0]!.blocks!.filter((b) => b.type === 'heading').length).toBe(0)
  })

  test('rejects pages with no article text', () => {
    const empty = '<html><body><nav><a href="/">Home</a></nav><p>Sign in to continue.</p></body></html>'
    expect(() => extractArticleFromHtml(empty, 'https://example.com/paywall')).toThrow()
  })

  test('single-heading articles stay as one chapter', () => {
    const ch = splitIntoChapters(
      [
        { type: 'paragraph', runs: [{ text: 'Only body.' }] },
        { type: 'heading', level: 2, runs: [{ text: 'One heading' }] },
        { type: 'paragraph', runs: [{ text: 'More body.' }] },
      ],
      'Title'
    )
    expect(ch).toHaveLength(1)
    expect(ch[0]!.title).toBe('Title')
  })
})

describe('extractUrlFromText', () => {
  test('handles the shapes browsers share', () => {
    expect(extractUrlFromText('https://example.com/a/b?c=1')).toBe('https://example.com/a/b?c=1')
    expect(extractUrlFromText('Great post\nhttps://example.com/post')).toBe('https://example.com/post')
    expect(extractUrlFromText('Check this: https://example.com/post.')).toBe('https://example.com/post')
    expect(extractUrlFromText('"https://example.com/x" was shared')).toBe('https://example.com/x')
    expect(extractUrlFromText('no link here')).toBeNull()
    expect(extractUrlFromText('')).toBeNull()
  })
})
