import type { Block, Run } from '@/chunker/types'

/**
 * Turn an EPUB chapter's HTML (already sanitized) into structured blocks.
 *
 * - Leaf block elements (no block descendants) become blocks: headings keep
 *   their level, list items get a marker, anything inside a blockquote is a
 *   quote, everything else is a paragraph.
 * - Inline content sitting directly inside a container next to block
 *   children is collected into a synthetic paragraph, so no text is lost.
 * - Inline emphasis (em/i, strong/b, sup) is recorded as run formatting.
 */

const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'div', 'section', 'article', 'aside', 'header',
  'footer', 'figure', 'figcaption', 'pre', 'td', 'th', 'dd', 'dt', 'ul', 'ol', 'table', 'tr', 'nav', 'main', 'body',
  'hr', 'br',
])
const SKIP_TAGS = new Set(['script', 'style', 'svg', 'img', 'video', 'audio', 'iframe', 'object', 'template', 'noscript'])
const ITALIC_TAGS = new Set(['em', 'i', 'cite', 'dfn', 'var'])
const BOLD_TAGS = new Set(['strong', 'b'])

interface Format {
  i?: boolean
  b?: boolean
  sup?: boolean
}

export function extractBlocks(root: Element): Block[] {
  const blocks: Block[] = []
  visit(root, blocks, { inQuote: false })
  return blocks.filter((b) => b.runs.some((r) => r.text.trim().length > 0))
}

function tag(node: Node): string {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element).tagName.toLowerCase() : ''
}

function isBlock(node: Node): boolean {
  return BLOCK_TAGS.has(tag(node))
}

function hasBlockDescendant(el: Element): boolean {
  for (const child of Array.from(el.children)) {
    if (SKIP_TAGS.has(tag(child))) continue
    const t = tag(child)
    if (BLOCK_TAGS.has(t) && t !== 'br') return true
    if (hasBlockDescendant(child)) return true
  }
  return false
}

function visit(container: Element, out: Block[], ctx: { inQuote: boolean }) {
  let inline: Node[] = []

  const flushInline = () => {
    if (inline.length === 0) return
    const runs: Run[] = []
    inline.forEach((n) => collectRuns(n, {}, runs))
    inline = []
    if (runs.some((r) => r.text.trim().length > 0)) {
      out.push({ type: ctx.inQuote ? 'quote' : 'paragraph', runs })
    }
  }

  const children = Array.from(container.childNodes)
  for (let idx = 0; idx < children.length; idx++) {
    const node = children[idx]!
    const t = tag(node)
    if (SKIP_TAGS.has(t)) continue

    if (node.nodeType === Node.ELEMENT_NODE && isBlock(node) && t !== 'br') {
      flushInline()
      const el = node as Element
      if (t === 'hr') continue

      const childCtx = { inQuote: ctx.inQuote || t === 'blockquote' }

      if (hasBlockDescendant(el)) {
        visit(el, out, childCtx)
        continue
      }

      const runs: Run[] = []
      collectRuns(el, {}, runs)
      if (!runs.some((r) => r.text.trim().length > 0)) continue

      if (/^h[1-6]$/.test(t)) {
        out.push({ type: 'heading', level: Number(t[1]), runs })
      } else if (t === 'li') {
        out.push({ type: 'list', marker: listMarker(el), runs })
      } else if (childCtx.inQuote) {
        out.push({ type: 'quote', runs })
      } else {
        out.push({ type: 'paragraph', runs })
      }
      continue
    }

    inline.push(node)
  }
  flushInline()
}

function listMarker(li: Element): string {
  const parent = li.parentElement
  if (parent && tag(parent) === 'ol') {
    const startAttr = Number(parent.getAttribute('start') ?? '1')
    const start = Number.isFinite(startAttr) ? startAttr : 1
    const index = Array.from(parent.children).filter((c) => tag(c) === 'li').indexOf(li)
    return `${start + index}.`
  }
  return '•'
}

function collectRuns(node: Node, fmt: Format, out: Run[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    if (text.length > 0) out.push({ text, ...fmt })
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return

  const t = tag(node)
  if (SKIP_TAGS.has(t)) return
  if (t === 'br') {
    out.push({ text: ' ', ...fmt })
    return
  }

  const next: Format = { ...fmt }
  if (ITALIC_TAGS.has(t)) next.i = true
  if (BOLD_TAGS.has(t)) next.b = true
  if (t === 'sup') next.sup = true

  for (const child of Array.from(node.childNodes)) {
    collectRuns(child, next, out)
  }
}

export function blocksToText(blocks: Block[]): string {
  return blocks
    .map((b) => b.runs.map((r) => r.text).join('').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 0)
    .join('\n\n')
}
