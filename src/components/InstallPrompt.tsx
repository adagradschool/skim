import { useEffect, useState } from 'react'
import { X, Download } from 'lucide-react'
import { ANDROID_APK_URL, NATIVE_APP_PITCH, isAndroidBrowser } from '@/platform'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Debug: Check for test mode (add ?testInstall=1 to URL to test the UI)
    const urlParams = new URLSearchParams(window.location.search)
    const testMode = urlParams.get('testInstall') === '1'

    if (testMode) {
      console.log('[InstallPrompt] Test mode enabled - showing prompt')
      setTimeout(() => setShowPrompt(true), 3000)
      return
    }

    // Android browser: offer the native app instead of the PWA
    if (isAndroidBrowser) {
      const dismissedAt = Number(localStorage.getItem('pwa-install-dismissed') ?? 0)
      if (Date.now() - dismissedAt > 7 * 24 * 60 * 60 * 1000) {
        const t = setTimeout(() => setShowPrompt(true), 3000)
        return () => clearTimeout(t)
      }
      return
    }

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('[InstallPrompt] Already installed')
      setIsInstalled(true)
      return
    }

    // Check if user has dismissed the prompt before
    const dismissed = localStorage.getItem('pwa-install-dismissed')
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10)
      const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24)
      // Show again after 7 days
      if (daysSinceDismissed < 7) {
        console.log('[InstallPrompt] User dismissed recently, hiding prompt')
        return
      }
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      console.log('[InstallPrompt] beforeinstallprompt event fired')
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault()
      // Stash the event so it can be triggered later
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Show the install prompt after a short delay
      setTimeout(() => {
        setShowPrompt(true)
      }, 3000) // Show after 3 seconds
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setShowPrompt(false)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (isAndroidBrowser) {
      window.location.href = ANDROID_APK_URL
      setShowPrompt(false)
      return
    }
    if (!deferredPrompt) {
      console.log('[InstallPrompt] No deferred prompt available (test mode or not supported)')
      alert('Install prompt test - In production, this would trigger the browser install dialog')
      setShowPrompt(false)
      return
    }

    // Show the install prompt
    await deferredPrompt.prompt()

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      console.log('[InstallPrompt] User accepted the install prompt')
    } else {
      console.log('[InstallPrompt] User dismissed the install prompt')
      localStorage.setItem('pwa-install-dismissed', Date.now().toString())
    }

    // Clear the deferredPrompt
    setDeferredPrompt(null)
    setShowPrompt(false)
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    localStorage.setItem('pwa-install-dismissed', Date.now().toString())
  }

  // Don't show if already installed or no prompt available
  if (isInstalled || !showPrompt || (!deferredPrompt && !isAndroidBrowser)) {
    return null
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-slide-up sm:left-auto sm:right-4 sm:w-96">
      <div className="nb-box-lg p-4">
        <div className="flex items-start gap-3">
          <div className="nb-box-flat flex h-12 w-12 items-center justify-center bg-lime dark:bg-lime">
            <Download className="h-6 w-6 text-black" strokeWidth={2.5} />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-extrabold">{isAndroidBrowser ? NATIVE_APP_PITCH.title : 'Install Skim'}</h3>
            <p className="mt-1 text-sm text-fg-muted dark:text-fg-muted-dark">
              {isAndroidBrowser ? NATIVE_APP_PITCH.body : 'Install the app for a better reading experience and offline access.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="nb-btn nb-btn-neutral h-8 w-8"
            aria-label="Dismiss"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleDismiss}
            className="nb-btn nb-btn-neutral flex-1 px-4 py-2 text-sm"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={handleInstallClick}
            className="nb-btn nb-btn-main flex-1 px-4 py-2 text-sm"
          >
            {isAndroidBrowser ? 'Download' : 'Install'}
          </button>
        </div>
      </div>
    </div>
  )
}
