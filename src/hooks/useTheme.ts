import { useEffect, useState } from 'react'

const THEME_KEY = 'skim-theme'

type Theme = 'light' | 'dark'

const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const stored = window.localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') {
    return stored
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme())

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem(THEME_KEY, theme)

    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#272933' : '#dfe5f2')
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  return { theme, setTheme, toggleTheme }
}
