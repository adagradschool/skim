import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, BookOpen, Check, Clock, Loader2, Plus, Search, X } from 'lucide-react'
import {
  CATALOG_TAGS,
  cover2x,
  filterCatalog,
  orderFeatured,
  formatMinutes,
  importCatalogBook,
  libraryCatalogIds,
  loadCatalog,
  sourceIdFor,
  type Catalog,
  type CatalogBook,
} from './catalog'

const PAGE = 24

export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    setError(null)
    loadCatalog()
      .then((c) => alive && setCatalog(c))
      .catch((err) => alive && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      alive = false
    }
  }, [attempt])
  return { catalog, error, retry: () => setAttempt((n) => n + 1) }
}

interface CatalogBrowserProps {
  /** Called after a book lands in the library. */
  onImported?: (bookId: string, book: CatalogBook) => void
  /** Called when the user chooses to read the book they just added. */
  onRead?: (bookId: string, book: CatalogBook) => void
  /** Books shown before any search, when the user has not typed anything. Defaults to the whole catalog. */
  initialLimit?: number
  /** Tag chips row. */
  showTags?: boolean
  className?: string
}

/**
 * Search, filter, and a cover grid for the Standard Ebooks catalog. Tapping a
 * cover opens a sheet with the blurb and an add button. Used by the Store page
 * and by onboarding.
 */
export function CatalogBrowser({ onImported, onRead, initialLimit, showTags = true, className = '' }: CatalogBrowserProps) {
  const { catalog, error, retry } = useCatalog()
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [shown, setShown] = useState(PAGE)
  const [owned, setOwned] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<CatalogBook | null>(null)

  useEffect(() => {
    libraryCatalogIds().then(setOwned).catch(() => {})
  }, [])

  useEffect(() => setShown(PAGE), [query, tag])

  const ordered = useMemo(() => (catalog ? orderFeatured(catalog.books) : []), [catalog])

  const results = useMemo(() => {
    const all = filterCatalog(ordered, query, tag)
    return initialLimit && !query && !tag ? all.slice(0, initialLimit) : all
  }, [ordered, query, tag, initialLimit])

  const handleImported = useCallback(
    (bookId: string, book: CatalogBook) => {
      setOwned((prev) => new Set(prev).add(sourceIdFor(book)))
      onImported?.(bookId, book)
    },
    [onImported]
  )

  return (
    <div className={className}>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60" strokeWidth={2.5} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title or author"
          aria-label="Search the catalog"
          className="nb-input pl-9 pr-9 py-2.5 [&::-webkit-search-cancel-button]:hidden"
          autoCapitalize="none"
          autoCorrect="off"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-nb p-1 opacity-70 hover:opacity-100"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        ) : null}
      </label>

      {showTags ? (
        <div className="-mx-6 mt-3 flex gap-2 overflow-x-auto px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TagChip label="All" on={tag === null} onClick={() => setTag(null)} />
          {CATALOG_TAGS.map((t) => (
            <TagChip key={t.id} label={t.label} on={tag === t.id} onClick={() => setTag(tag === t.id ? null : t.id)} />
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="nb-box mt-4 bg-danger p-4 text-sm font-semibold text-black dark:bg-danger-dark">
          <div className="mb-1 flex items-center gap-2 font-extrabold uppercase">
            <AlertTriangle className="h-4 w-4" strokeWidth={2.5} /> Couldn’t load the catalog
          </div>
          {error}
          <button type="button" className="nb-btn nb-btn-neutral mt-3 px-3 py-1.5 text-xs" onClick={retry}>
            Try again
          </button>
        </div>
      ) : !catalog ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2.5} />
        </div>
      ) : results.length === 0 ? (
        <p className="nb-muted mt-4 p-4 text-sm font-semibold">
          Nothing matches. Standard Ebooks carries {catalog.count.toLocaleString()} public-domain titles, so try an author’s surname.
        </p>
      ) : (
        <>
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {results.slice(0, shown).map((b) => (
              <li key={b.id}>
                <CoverCard book={b} owned={owned.has(sourceIdFor(b))} onClick={() => setSelected(b)} />
              </li>
            ))}
          </ul>
          {results.length > shown ? (
            <button type="button" className="nb-btn nb-btn-neutral mt-5 w-full px-4 py-2.5 text-sm" onClick={() => setShown((n) => n + PAGE * 2)}>
              Show more · {(results.length - shown).toLocaleString()} left
            </button>
          ) : null}
        </>
      )}

      {selected ? (
        <BookSheet
          book={selected}
          owned={owned.has(sourceIdFor(selected))}
          onClose={() => setSelected(null)}
          onImported={handleImported}
          onRead={onRead}
        />
      ) : null}
    </div>
  )
}

function TagChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`nb-btn shrink-0 px-3 py-1.5 text-xs uppercase tracking-wider ${on ? 'nb-btn-lime' : 'nb-btn-neutral'}`}
    >
      {label}
    </button>
  )
}

function CoverCard({ book, owned, onClick }: { book: CatalogBook; owned: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="nb-btn w-full flex-col items-stretch overflow-hidden p-0 text-left nb-btn-neutral">
      <span className="relative block">
        <Cover book={book} className="block aspect-[224/335] w-full border-b-2 border-border bg-surface-muted object-cover dark:bg-surface-muted-dark" />
        {owned ? (
          <span className="nb-chip absolute left-2 top-2 bg-lime text-black">
            <Check className="mr-1 h-3 w-3" strokeWidth={3} /> Yours
          </span>
        ) : null}
      </span>
      <span className="flex flex-1 flex-col p-2.5">
        <span className="line-clamp-2 text-sm font-extrabold leading-tight">{book.title}</span>
        <span className="mt-0.5 line-clamp-1 text-xs font-semibold opacity-70">{book.author}</span>
        <span className="mt-2 flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider opacity-60">
          <Clock className="h-3 w-3" strokeWidth={3} /> {formatMinutes(book.minutes)}
        </span>
      </span>
    </button>
  )
}

function Cover({ book, className }: { book: CatalogBook; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span className={`flex items-center justify-center bg-main text-black dark:bg-main-dark ${className ?? ''}`}>
        <BookOpen className="h-8 w-8" strokeWidth={2.5} />
      </span>
    )
  }
  return (
    <img
      src={book.cover}
      srcSet={`${cover2x(book)} 2x`}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={className}
    />
  )
}

type AddState =
  | { kind: 'idle' }
  | { kind: 'downloading'; percent: number | null }
  | { kind: 'importing'; message: string }
  | { kind: 'done'; bookId: string }
  | { kind: 'error'; message: string }

interface BookSheetProps {
  book: CatalogBook
  owned: boolean
  onClose: () => void
  onImported: (bookId: string, book: CatalogBook) => void
  onRead?: (bookId: string, book: CatalogBook) => void
}

function BookSheet({ book, owned, onClose, onImported, onRead }: BookSheetProps) {
  const [state, setState] = useState<AddState>({ kind: 'idle' })
  const controller = useRef<AbortController | null>(null)
  const busy = state.kind === 'downloading' || state.kind === 'importing'

  useEffect(() => () => controller.current?.abort(), [])

  const add = async () => {
    const ac = new AbortController()
    controller.current = ac
    setState({ kind: 'downloading', percent: null })
    try {
      const bookId = await importCatalogBook(book, {
        signal: ac.signal,
        onDownload: (loaded, total) => setState({ kind: 'downloading', percent: total ? Math.round((loaded / total) * 100) : null }),
        onProgress: (u) => setState({ kind: 'importing', message: u.message }),
      })
      setState({ kind: 'done', bookId })
      onImported(bookId, book)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setState({ kind: 'idle' })
      } else {
        setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  const tags = book.tags.map((t) => CATALOG_TAGS.find((c) => c.id === t)?.label ?? t)

  return (
    <div
      className="nb-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={book.title}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className="nb-modal flex max-h-[88vh] max-w-md flex-col overflow-hidden">
        <div className="relative flex-1 overflow-y-auto p-5">
          <button
            type="button"
            className="nb-btn nb-btn-neutral absolute right-4 top-4 h-9 w-9"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-start gap-4 pr-10">
            <Cover book={book} className="nb-box-flat aspect-[224/335] w-24 shrink-0 object-cover" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-extrabold leading-tight [text-wrap:balance]">{book.title}</h2>
              <p className="mt-1 text-sm font-semibold text-fg-muted dark:text-fg-muted-dark">{book.author}</p>
              {book.translator ? (
                <p className="mt-0.5 text-xs font-semibold text-fg-muted dark:text-fg-muted-dark">Translated by {book.translator}</p>
              ) : null}
              <p className="mt-3 flex items-center gap-1 text-xs font-extrabold uppercase tracking-wider text-fg-muted dark:text-fg-muted-dark">
                <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={3} /> {formatMinutes(book.minutes)}
              </p>
            </div>
          </div>
          {tags.length > 0 ? (
            <p className="mt-4 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span key={t} className="nb-chip bg-surface-muted text-[10px] dark:bg-surface-muted-dark">
                  {t}
                </span>
              ))}
            </p>
          ) : null}

          {book.blurb ? <p className="mt-4 text-sm font-semibold leading-relaxed">{book.blurb}</p> : null}
          <p className="mt-3 text-xs font-semibold text-fg-muted dark:text-fg-muted-dark">
            A free, carefully edited public-domain edition from Standard Ebooks.
          </p>

          {state.kind === 'downloading' || state.kind === 'importing' ? (
            <div className="nb-box mt-4 p-4">
              <div className="flex items-center gap-3 text-sm font-bold">
                <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.5} />
                {state.kind === 'downloading'
                  ? state.percent === null
                    ? 'Downloading…'
                    : `Downloading ${state.percent}%`
                  : state.message}
              </div>
              <div className="nb-track mt-3">
                <div
                  className="nb-track-fill transition-all"
                  style={{ width: `${state.kind === 'downloading' ? (state.percent ?? 15) * 0.6 : 80}%` }}
                />
              </div>
            </div>
          ) : null}
          {state.kind === 'error' ? (
            <p className="nb-box-flat mt-4 bg-danger p-3 text-xs font-bold text-black dark:bg-danger-dark">{state.message}</p>
          ) : null}
        </div>

        <div className="border-t-2 border-border p-4">
          {state.kind === 'done' ? (
            <div className="flex gap-3">
              <button type="button" className="nb-btn nb-btn-neutral px-4 py-2.5 text-sm" onClick={onClose}>
                Keep browsing
              </button>
              {onRead ? (
                <button type="button" className="nb-btn nb-btn-main flex-1 px-4 py-2.5 text-sm" onClick={() => onRead(state.bookId, book)}>
                  Read now <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </button>
              ) : (
                <span className="nb-btn nb-btn-lime flex-1 px-4 py-2.5 text-sm">
                  <Check className="h-4 w-4" strokeWidth={3} /> In your library
                </span>
              )}
            </div>
          ) : busy ? (
            <button type="button" className="nb-btn nb-btn-neutral w-full px-4 py-2.5 text-sm" onClick={() => controller.current?.abort()}>
              Cancel
            </button>
          ) : owned ? (
            <div className="flex gap-3">
              <span className="nb-btn nb-btn-lime flex-1 px-4 py-2.5 text-sm">
                <Check className="h-4 w-4" strokeWidth={3} /> Already in your library
              </span>
              <button type="button" className="nb-btn nb-btn-neutral px-4 py-2.5 text-sm" onClick={add}>
                Add again
              </button>
            </div>
          ) : (
            <button type="button" className="nb-btn nb-btn-main w-full px-4 py-2.5 text-sm" onClick={add}>
              <Plus className="h-4 w-4" strokeWidth={3} /> Add to library
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
