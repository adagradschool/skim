import { useEffect, useState } from 'react'
import { App as KonstaApp } from 'konsta/react'
import { HomePage } from '@/pages/HomePage'
import { InstallPrompt } from '@/components/InstallPrompt'
import { ReaderPage } from '@/pages/ReaderPage'
import { storageService } from '@/db/StorageService'
import { Loader2 } from 'lucide-react'

function App() {
  const [initialBookId, setInitialBookId] = useState<string | null | undefined>(undefined)
  const [isCheckingLastBook, setIsCheckingLastBook] = useState(true)

  useEffect(() => {
    const checkLastOpenedBook = async () => {
      try {
        // Get the last opened book ID from storage
        const lastBookId = await storageService.getKV('lastOpenedBookId')

        if (lastBookId) {
          // Verify the book still exists
          const book = await storageService.getBook(lastBookId)
          if (book) {
            setInitialBookId(lastBookId)
          } else {
            // Book was deleted, clear the stored ID
            await storageService.deleteKV('lastOpenedBookId')
            setInitialBookId(null)
          }
        } else {
          setInitialBookId(null)
        }
      } catch (err) {
        console.error('Failed to check last opened book', err)
        setInitialBookId(null)
      } finally {
        setIsCheckingLastBook(false)
      }
    }

    checkLastOpenedBook()
  }, [])

  const handleExitReader = () => {
    setInitialBookId(null)
  }

  if (isCheckingLastBook) {
    return (
      <KonstaApp theme="ios" safeAreas>
        <div className="flex h-screen items-center justify-center bg-slate-950">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
        <InstallPrompt />
      </KonstaApp>
    )
  }

  if (initialBookId) {
    return (
      <KonstaApp theme="ios" safeAreas>
        <ReaderPage bookId={initialBookId} onExit={handleExitReader} />
        <InstallPrompt />
      </KonstaApp>
    )
  }

  return (
    <KonstaApp theme="ios" safeAreas>
      <HomePage />
      <InstallPrompt />
    </KonstaApp>
  )
}

export default App
