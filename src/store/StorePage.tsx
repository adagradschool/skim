import { ArrowLeft } from 'lucide-react'
import { CatalogBrowser } from './CatalogBrowser'
import { useTheme } from '@/hooks/useTheme'

interface StorePageProps {
  onClose: () => void
  onRead: (bookId: string) => void
}

/** Full-screen catalog of free Standard Ebooks titles. */
export function StorePage({ onClose, onRead }: StorePageProps) {
  useTheme()
  return (
    <div className="relative min-h-screen bg-bg bg-dots text-fg dark:bg-bg-dark dark:bg-dots-dark dark:text-fg-dark">
      <header className="flex items-start gap-4 px-6 pb-5 pt-8">
        <button type="button" onClick={onClose} aria-label="Back to library" className="nb-icon-btn nb-btn-neutral shrink-0">
          <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
        </button>
        <div className="min-w-0">
          <span className="nb-chip bg-yellow text-black">Free</span>
          <h1 className="mt-3 font-display text-3xl uppercase leading-none tracking-tight">Store</h1>
          <p className="mt-2 text-sm font-semibold text-fg-muted dark:text-fg-muted-dark">
            Public-domain classics, beautifully edited by Standard Ebooks. All free, all yours.
          </p>
        </div>
      </header>
      <main className="px-6 pb-16">
        <CatalogBrowser onRead={(bookId) => onRead(bookId)} />
      </main>
    </div>
  )
}
