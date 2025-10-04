import { App as KonstaApp } from 'konsta/react'
import { HomePage } from '@/pages/HomePage'

function App() {
  return (
    <KonstaApp theme="ios" safeAreas>
      <HomePage />
    </KonstaApp>
  )
}

export default App
