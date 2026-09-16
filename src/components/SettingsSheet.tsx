import { useState } from 'react'
import { Check, Download, ExternalLink, Loader2, Moon, RefreshCw, Smartphone, Sun } from 'lucide-react'
import { useTheme, type ThemeSetting } from '@/hooks/useTheme'
import { isNativeApp } from '@/platform'
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
                  {isNativeApp ? 'Android app' : 'Web app'}
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
                    {isNativeApp ? (
                      <a
                        href={update.release.apkUrl ?? update.release.pageUrl}
                        className="nb-btn nb-btn-lime mt-3 w-full px-4 py-2.5 text-sm"
                      >
                        <Download className="h-4 w-4" strokeWidth={2.5} /> Download {update.release.version}
                      </a>
                    ) : (
                      <p className="mt-2 text-xs font-semibold text-fg-muted dark:text-fg-muted-dark">
                        {update.web === 'current'
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
