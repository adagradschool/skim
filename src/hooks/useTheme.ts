import { useEffect, useState } from 'react'

const THEME_KEY = 'skim-theme'

export type ThemeSetting = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

const getStoredSetting = (): ThemeSetting => {
  if (typeof window === 'undefined') return 'system'
  const stored = window.localStorage.getItem(THEME_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

const systemTheme = (): Theme =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

const resolve = (setting: ThemeSetting): Theme => (setting === 'system' ? systemTheme() : setting)

// One shared setting across every component that calls useTheme.
const listeners = new Set<(s: ThemeSetting) => void>()
let currentSetting: ThemeSetting = getStoredSetting()

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#272933' : '#dfe5f2')
}

export function useTheme() {
  const [setting, setSettingState] = useState<ThemeSetting>(currentSetting)
  const [theme, setResolved] = useState<Theme>(() => resolve(currentSetting))

  useEffect(() => {
    const onChange = (s: ThemeSetting) => {
      setSettingState(s)
      setResolved(resolve(s))
    }
    listeners.add(onChange)
    return () => {
      listeners.delete(onChange)
    }
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Follow the OS while in system mode
  useEffect(() => {
    if (setting !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => setResolved(systemTheme())
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [setting])

  const setSetting = (s: ThemeSetting) => {
    currentSetting = s
    window.localStorage.setItem(THEME_KEY, s)
    listeners.forEach((l) => l(s))
  }

  const toggleTheme = () => setSetting(theme === 'dark' ? 'light' : 'dark')

  return { theme, setting, setSetting, setTheme: setSetting, toggleTheme }
}
