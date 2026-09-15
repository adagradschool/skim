import { useEffect, useState } from 'react'
import { App as KonstaApp } from 'konsta/react'
import { HomePage } from '@/pages/HomePage'
import { InstallPrompt } from '@/components/InstallPrompt'
import { ReaderPage } from '@/pages/ReaderPage'
import { storageService } from '@/db/StorageService'
import { Loader2 } from 'lucide-react'
import { Onboarding } from '@/onboarding/Onboarding'

function App() {
  const [initialBookId, setInitialBookId] = useState<string | null | undefined>(undefined)
  const [isCheckingLastBook, setIsCheckingLastBook] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  useEffect(() => {
    const checkLastOpenedBook = async () => {
      try {
        const onboarded = await storageService.getKV('onboardingDone')
        if (!onboarded) {
          // Existing libraries skip onboarding; only a truly fresh install sees it.
          const books = await storageService.getAllBooks()
          if (books.length === 0) {
            setNeedsOnboarding(true)
          } else {
            await storageService.setKV('onboardingDone', true)
          }
        }

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
        <div className="flex h-screen items-center justify-center bg-bg dark:bg-bg-dark">
          <div className="nb-box flex h-16 w-16 items-center justify-center bg-yellow dark:bg-yellow">
            <Loader2 className="h-8 w-8 animate-spin text-black" strokeWidth={2.5} />
          </div>
        </div>
        <InstallPrompt />
      </KonstaApp>
    )
  }

  if (needsOnboarding) {
    return (
      <KonstaApp theme="ios" safeAreas>
        <Onboarding
          onDone={async () => {
            await storageService.setKV('onboardingDone', true)
            setNeedsOnboarding(false)
          }}
        />
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
