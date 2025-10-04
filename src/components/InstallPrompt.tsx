import { useEffect, useState } from 'react'
import { X, Download } from 'lucide-react'

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
  if (isInstalled || !showPrompt || !deferredPrompt) {
    return null
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-slide-up sm:left-auto sm:right-4 sm:w-96">
      <div className="rounded-2xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600">
            <Download className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-100">Install Skim</h3>
            <p className="mt-1 text-sm text-slate-400">
              Install the app for a better reading experience and offline access.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-slate-400 transition hover:text-slate-300"
            aria-label="Dismiss"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleDismiss}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={handleInstallClick}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            Install
          </button>
        </div>
      </div>
    </div>
  )
}
