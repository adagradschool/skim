import { useState } from 'react'
import { AlertTriangle, Check, Download, ExternalLink, Loader2, Moon, RefreshCw, Smartphone, Sun, Trash2 } from 'lucide-react'
import { storageService } from '@/db/StorageService'
import { useTheme, type ThemeSetting } from '@/hooks/useTheme'
import { isNativeApp, isAndroidApp, isIosApp } from '@/platform'
import { APP_VERSION, RELEASES_PAGE, fetchLatestRelease, refreshWebApp, type ReleaseInfo } from '@/updates'

interface SettingsSheetProps {
  onClose: () => void
}

const APPEARANCES: Array<{ id: ThemeSetting; label: string; icon: typeof Sun }> = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Smartphone },
]

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'result'; release: ReleaseInfo; web?: 'updated' | 'current' | 'unsupported' }
  | { kind: 'error'; message: string }

export function SettingsSheet({ onClose }: SettingsSheetProps) {
  const { setting, setSetting } = useTheme()
  const [update, setUpdate] = useState<UpdateState>({ kind: 'idle' })
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting, setResetting] = useState(false)

  const checkForUpdates = async () => {
    setUpdate({ kind: 'checking' })
    try {
      const release = await fetchLatestRelease()
      let web: 'updated' | 'current' | 'unsupported' | undefined
      if (!isNativeApp) web = await refreshWebApp()
      setUpdate({ kind: 'result', release, web })
    } catch (err) {
      setUpdate({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const startOver = async () => {
    setResetting(true)
    try {
      await storageService.clear()
      // A full reload drops every in-memory cache (score, profile, open DB) and lands on onboarding.
      window.location.replace('/')
    } catch (err) {
      console.error('Reset failed', err)
      setResetting(false)
    }
  }

  if (confirmReset) {
    return (
      <div className="nb-overlay" role="dialog" aria-modal="true" aria-label="Start over">
        <div className="nb-modal max-w-sm p-6">
          <div className="flex items-center gap-3">
            <div className="nb-box-flat flex h-10 w-10 items-center justify-center bg-danger text-black dark:bg-danger-dark">
              <AlertTriangle className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <h2 className="text-xl font-extrabold uppercase">Start over?</h2>
          </div>
          <p className="mt-4 text-sm font-semibold text-fg-muted dark:text-fg-muted-dark">
            This deletes every book, your reading positions, bookmarks, notes, score and reader card from this device. It cannot be undone.
          </p>
          <div className="mt-6 flex gap-3">
            <button type="button" className="nb-btn nb-btn-neutral flex-1 px-4 py-2 text-sm" onClick={() => setConfirmReset(false)} disabled={resetting}>
              Keep my data
            </button>
            <button type="button" className="nb-btn nb-btn-danger flex-1 px-4 py-2 text-sm" onClick={startOver} disabled={resetting}>
              {resetting ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <Trash2 className="h-4 w-4" strokeWidth={2.5} />}
              Delete everything
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="nb-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div className="nb-modal flex max-h-[88vh] max-w-md flex-col overflow-hidden">
        <div className="border-b-2 border-border bg-yellow p-5 text-black">
          <h2 className="text-xl font-extrabold uppercase">Settings</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="text-xs font-extrabold uppercase tracking-widest text-fg-muted dark:text-fg-muted-dark">Appearance</div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {APPEARANCES.map(({ id, label, icon: Icon }) => {
              const on = setting === id
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSetting(id)}
                  className={`nb-btn flex-col gap-1.5 px-2 py-3 text-xs ${on ? 'nb-btn-main' : 'nb-btn-neutral'}`}
                >
                  <Icon className="h-5 w-5" strokeWidth={2.5} />
                  {label}
                  {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <span className="h-3.5" />}
                </button>
              )
            })}
          </div>

          <div className="mt-6 text-xs font-extrabold uppercase tracking-widest text-fg-muted dark:text-fg-muted-dark">Updates</div>
          <div className="nb-muted mt-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold">Skim {APP_VERSION}</div>
                <div className="text-xs font-semibold text-fg-muted dark:text-fg-muted-dark">
                  {isAndroidApp ? 'Android app' : isIosApp ? 'iOS app' : 'Web app'}
                </div>
              </div>
              <button
                type="button"
                className="nb-btn nb-btn-neutral px-3 py-2 text-xs uppercase tracking-wider"
                onClick={checkForUpdates}
                disabled={update.kind === 'checking'}
              >
                {update.kind === 'checking' ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />
                ) : (
                  <RefreshCw className="h-4 w-4" strokeWidth={2.5} />
                )}
                Check
              </button>
            </div>

            {update.kind === 'error' ? (
              <p className="nb-box-flat mt-3 bg-danger p-2.5 text-xs font-bold text-black">Couldn’t reach GitHub: {update.message}</p>
            ) : null}

            {update.kind === 'result' ? (
              <div className="mt-3 border-t-2 border-border pt-3">
                {update.release.isNewer ? (
                  <>
                    <div className="text-sm font-extrabold">{update.release.version} is available</div>
                    <div className="mt-0.5 text-xs font-semibold text-fg-muted dark:text-fg-muted-dark">
                      {update.release.name} · {new Date(update.release.publishedAt).toLocaleDateString()}
                    </div>
                    {isAndroidApp ? (
                      <a
                        href={update.release.apkUrl ?? update.release.pageUrl}
                        className="nb-btn nb-btn-lime mt-3 w-full px-4 py-2.5 text-sm"
                      >
                        <Download className="h-4 w-4" strokeWidth={2.5} /> Download {update.release.version}
                      </a>
                    ) : (
                      <p className="mt-2 text-xs font-semibold text-fg-muted dark:text-fg-muted-dark">
                        {isIosApp
                          ? 'Update through TestFlight or the App Store.'
                          : update.web === 'current'
                            ? 'The site updates itself; reopen Skim to get it.'
                            : 'Refreshing to the latest build…'}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-sm font-extrabold">
                    <Check className="h-4 w-4" strokeWidth={3} /> You’re on the latest version
                  </div>
                )}
                <a
                  href={update.release.pageUrl || RELEASES_PAGE}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider underline decoration-2 underline-offset-4"
                >
                  Release notes <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.5} />
                </a>
              </div>
            ) : null}
          </div>

          <div className="mt-6 text-xs font-extrabold uppercase tracking-widest text-fg-muted dark:text-fg-muted-dark">Local data</div>
          <div className="nb-muted mt-3 flex items-center justify-between gap-3 p-4">
            <div>
              <div className="text-sm font-extrabold">Start over</div>
              <div className="text-xs font-semibold text-fg-muted dark:text-fg-muted-dark">Wipe this device and see onboarding again</div>
            </div>
            <button type="button" className="nb-btn nb-btn-danger shrink-0 px-3 py-2 text-xs uppercase tracking-wider" onClick={() => setConfirmReset(true)}>
              <Trash2 className="h-4 w-4" strokeWidth={2.5} /> Reset
            </button>
          </div>
        </div>

        <div className="border-t-2 border-border p-4">
          <button type="button" className="nb-btn nb-btn-main w-full px-4 py-2.5 text-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
