import { App as KonstaApp } from 'konsta/react'
import { HomePage } from '@/pages/HomePage'
import { InstallPrompt } from '@/components/InstallPrompt'

function App() {
  return (
    <KonstaApp theme="ios" safeAreas>
      <HomePage />
      <InstallPrompt />
    </KonstaApp>
  )
}

export default App
