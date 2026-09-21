import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, ExternalLink, Link2, Loader2, MoreVertical, Newspaper, Trash2, X } from 'lucide-react'
import { storageService } from '@/db/StorageService'
import type { Book } from '@/db/types'
import { useTheme } from '@/hooks/useTheme'
import { LIBRARY_CHANGED_EVENT, notifyLibraryChanged } from '@/shared/sharedFiles'
import { hostOf, readingMinutes, saveArticleFromUrl, type ArticleStage } from './ArticleService'

interface ArticlesPageProps {
  onClose: () => void
  onRead: (bookId: string) => void
}

interface ArticleRow {
  book: Book
  words: number
  percent: number
}

const STAGE_LABEL: Record<ArticleStage, string> = {
  fetching: 'Fetching',
  extracting: 'Reading the page',
  saving: 'Saving',
  done: 'Saved',
}

/** The Articles folder: saved web pages, kept apart from books. */
export function ArticlesPage({ onClose, onRead }: ArticlesPageProps) {
  useTheme()
  const [rows, setRows] = useState<ArticleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Book | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const books = (await storageService.getAllBooks()).filter((b) => b.kind === 'article')
      const items = await Promise.all(
        books.map(async (book) => {
          const [slides, progress] = await Promise.all([storageService.getAllSlides(book.id), storageService.getProgress(book.id)])
          const words = slides.reduce((n, s) => n + s.words, 0)
          const total = slides.length
          const idx = progress?.slideIndex ?? 0
          const percent = total > 1 ? Math.round((idx / (total - 1)) * 100) : 0
          return { book, words, percent }
        })
      )
      setRows(items)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onChanged = () => void refresh()
    window.addEventListener(LIBRARY_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(LIBRARY_CHANGED_EVENT, onChanged)
  }, [refresh])

  const remove = async (book: Book) => {
    await storageService.deleteBook(book.id)
    setConfirmDelete(null)
    notifyLibraryChanged()
    await refresh()
  }

  return (
    <div className="relative min-h-screen bg-bg bg-dots text-fg dark:bg-bg-dark dark:bg-dots-dark dark:text-fg-dark">
      <header className="flex items-start gap-4 px-6 pb-5 pt-8">
        <button type="button" onClick={onClose} aria-label="Back to library" className="nb-icon-btn nb-btn-neutral shrink-0">
          <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
        </button>
        <div className="min-w-0 flex-1">
          <span className="nb-chip bg-pink text-black">Folder</span>
          <h1 className="mt-3 font-display text-3xl uppercase leading-none tracking-tight">Articles</h1>
          <p className="mt-2 text-sm font-semibold text-fg-muted dark:text-fg-muted-dark">
            Pages you shared to Skim. Share any page from your browser, or paste a link.
          </p>
        </div>
      </header>

      <main className="px-6 pb-28">
        <button type="button" className="nb-btn nb-btn-main w-full px-4 py-3 text-sm" onClick={() => setAddOpen(true)}>
          <Link2 className="h-4 w-4" strokeWidth={2.5} /> Add from link
        </button>

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2.5} />
          </div>
        ) : rows.length === 0 ? (
          <div className="nb-box-lg mt-6 flex flex-col items-center px-6 py-12 text-center">
            <div className="nb-box flex h-14 w-14 items-center justify-center bg-pink text-black">
              <Newspaper className="h-7 w-7" strokeWidth={2.5} />
            </div>
            <h2 className="mt-5 text-lg font-extrabold uppercase">Nothing saved yet</h2>
            <p className="mt-2 text-sm font-semibold text-fg-muted dark:text-fg-muted-dark">
              In your browser, tap Share and pick Skim. The article lands here, cut into slides.
            </p>
          </div>
        ) : (
          <ul className="mt-6 space-y-4">
            {rows.map(({ book, words, percent }) => (
              <li key={book.id}>
                <article
                  className="nb-box relative cursor-pointer p-4 transition-[transform,box-shadow] duration-100 hover:translate-x-[2px] hover:translate-y-[2px] hover:[box-shadow:var(--shadow-nb-sm)]"
                  onClick={() => onRead(book.id)}
                >
                  <div className="absolute right-2 top-2 z-10">
                    <button
                      type="button"
                      className="nb-btn nb-btn-neutral h-8 w-8"
                      aria-label="Article options"
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenuFor(menuFor === book.id ? null : book.id)
                      }}
                    >
                      <MoreVertical className="h-5 w-5" strokeWidth={2.5} />
                    </button>
                    {menuFor === book.id ? (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuFor(null)
                          }}
                        />
                        <div className="nb-box absolute right-0 top-11 z-20 w-52 overflow-hidden p-0">
                          {book.sourceUrl ? (
                            <a
                              href={book.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex w-full items-center gap-3 border-b-2 border-border px-4 py-2.5 text-left text-sm font-bold transition hover:bg-main hover:text-black dark:hover:bg-main-dark"
                              onClick={(e) => {
                                e.stopPropagation()
                                setMenuFor(null)
                              }}
                            >
                              <ExternalLink className="h-4 w-4" /> Open original
                            </a>
                          ) : null}
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-bold transition hover:bg-danger hover:text-black dark:hover:bg-danger-dark"
                            onClick={(e) => {
                              e.stopPropagation()
                              setMenuFor(null)
                              setConfirmDelete(book)
                            }}
                          >
                            <Trash2 className="h-4 w-4" /> Delete
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                  <div className="pr-10">
                    <div className="text-xs font-extrabold uppercase tracking-wider text-fg-muted dark:text-fg-muted-dark">
                      {book.siteName || hostOf(book.sourceUrl || '')} · {readingMinutes(words)} min
                    </div>
                    <h3 className="mt-1 text-base font-extrabold leading-tight">{book.title}</h3>
                    {book.excerpt ? (
                      <p className="mt-1 line-clamp-2 text-sm font-semibold text-fg-muted dark:text-fg-muted-dark">{book.excerpt}</p>
                    ) : null}
                    <div className="nb-track mt-3">
                      <div className="nb-track-fill" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </main>

      {addOpen ? (
        <AddLinkSheet
          onClose={() => setAddOpen(false)}
          onSaved={(bookId) => {
            setAddOpen(false)
            notifyLibraryChanged()
            onRead(bookId)
          }}
        />
      ) : null}

      {confirmDelete ? (
        <div
          className="nb-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDelete(null)
          }}
        >
          <div className="nb-modal max-w-sm p-6">
            <h2 className="text-xl font-extrabold uppercase">Delete article</h2>
            <p className="mt-3 text-sm font-semibold text-fg-muted dark:text-fg-muted-dark">
              Remove “{confirmDelete.title}” and its reading position? You can share the page again any time.
            </p>
            <div className="mt-6 flex gap-3">
              <button type="button" className="nb-btn nb-btn-neutral flex-1 px-4 py-2 text-sm" onClick={() => setConfirmDelete(null)}>
                Keep
              </button>
              <button type="button" className="nb-btn nb-btn-danger flex-1 px-4 py-2 text-sm" onClick={() => void remove(confirmDelete)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

interface AddLinkSheetProps {
  onClose: () => void
  onSaved: (bookId: string) => void
}

export function AddLinkSheet({ onClose, onSaved }: AddLinkSheetProps) {
  const [value, setValue] = useState('')
  const [stage, setStage] = useState<{ stage: ArticleStage; detail?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setStage({ stage: 'fetching' })
    try {
      const id = await saveArticleFromUrl(value, { onStage: (s, d) => setStage({ stage: s, detail: d }) })
      onSaved(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStage(null)
    }
  }

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) setValue(text.trim())
    } catch {
      /* clipboard not available */
    }
  }

  return (
    <div
      className="nb-overlay items-end sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Add from link"
      onClick={(e) => {
        if (e.target === e.currentTarget && !stage) onClose()
      }}
    >
      <form className="nb-modal max-w-md p-5" onSubmit={submit}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold uppercase">Add from link</h2>
            <p className="mt-1 text-sm font-semibold text-fg-muted dark:text-fg-muted-dark">Paste the address of an article.</p>
          </div>
          <button type="button" className="nb-btn nb-btn-neutral h-9 w-9 shrink-0" aria-label="Close" onClick={onClose} disabled={!!stage}>
            <X className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <input
            type="url"
            inputMode="url"
            autoFocus
            placeholder="https://…"
            className="nb-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!!stage}
            aria-label="Article link"
          />
          <button type="button" className="nb-btn nb-btn-neutral shrink-0 px-3 text-xs uppercase tracking-wider" onClick={pasteFromClipboard} disabled={!!stage}>
            Paste
          </button>
        </div>
        {error ? <p className="nb-box-flat mt-3 bg-danger p-2.5 text-xs font-bold text-black">{error}</p> : null}
        {stage ? (
          <div className="mt-3 flex items-center gap-3 text-sm font-bold">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />
            {STAGE_LABEL[stage.stage]}
            {stage.detail ? <span className="truncate text-fg-muted dark:text-fg-muted-dark">{stage.detail}</span> : null}
          </div>
        ) : null}
        <button type="submit" className="nb-btn nb-btn-main mt-4 w-full px-4 py-2.5 text-sm" disabled={!!stage || value.trim().length === 0}>
          Save to Articles
        </button>
      </form>
    </div>
  )
}
