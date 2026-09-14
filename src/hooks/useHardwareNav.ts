import { useEffect, useRef } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Hardware-button page navigation.
 *
 * Browsers do not expose the phone's volume rocker to web pages on Android
 * Chrome or iOS Safari. This hook does the best a PWA can do:
 *
 * 1. Listens for volume keydown events in the browsers/webviews that do
 *    forward them (Firefox for Android, some kiosk and TV browsers, desktop
 *    keyboards with media keys).
 * 2. Registers Media Session next/previous handlers backed by a silent
 *    looping audio track, so headset buttons and Bluetooth page-turner
 *    remotes (which send media key events) flip pages. The silent track
 *    only starts after a user gesture, as autoplay policy requires.
 * 3. In the Capacitor Android app, asks the native VolumeButtons plugin to
 *    take over the rocker. The activity swallows the hardware keys and
 *    re-dispatches them as the same keydown events handled in (1), so the
 *    web code path is identical in the browser and the app.
 */

interface VolumeButtonsPlugin {
  setEnabled(options: { enabled: boolean }): Promise<void>
}

const VolumeButtons = registerPlugin<VolumeButtonsPlugin>('VolumeButtons')
const isNative = Capacitor.isNativePlatform()
export const isNativeApp = isNative

const VOLUME_UP_KEYS = new Set(['AudioVolumeUp', 'VolumeUp'])
const VOLUME_DOWN_KEYS = new Set(['AudioVolumeDown', 'VolumeDown'])
// Legacy keyCodes: 175/174 (Chromium, IE), 183/182 (Firefox)
const VOLUME_UP_CODES = new Set([175, 183])
const VOLUME_DOWN_CODES = new Set([174, 182])

// 1 second of 8 kHz 8-bit mono silence as a WAV data URI (tiny, loopable).
const SILENT_WAV = (() => {
  const sampleRate = 8000
  const samples = sampleRate
  const header = new ArrayBuffer(44 + samples)
  const view = new DataView(header)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  writeStr(36, 'data')
  view.setUint32(40, samples, true)
  const bytes = new Uint8Array(header)
  bytes.fill(128, 44) // 8-bit PCM silence is 128
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return `data:audio/wav;base64,${btoa(binary)}`
})()

export function isVolumeUpEvent(event: KeyboardEvent): boolean {
  return VOLUME_UP_KEYS.has(event.key) || VOLUME_UP_CODES.has(event.keyCode)
}

export function isVolumeDownEvent(event: KeyboardEvent): boolean {
  return VOLUME_DOWN_KEYS.has(event.key) || VOLUME_DOWN_CODES.has(event.keyCode)
}

interface HardwareNavOptions {
  enabled: boolean
  onNext: () => void
  onPrevious: () => void
  title?: string
}

export function useHardwareNav({ enabled, onNext, onPrevious, title }: HardwareNavOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const nextRef = useRef(onNext)
  const prevRef = useRef(onPrevious)
  nextRef.current = onNext
  prevRef.current = onPrevious

  // 1. Volume key events (where the browser forwards them)
  useEffect(() => {
    if (!enabled) return

    const handleKey = (event: KeyboardEvent) => {
      if (isVolumeUpEvent(event)) {
        event.preventDefault()
        nextRef.current()
      } else if (isVolumeDownEvent(event)) {
        event.preventDefault()
        prevRef.current()
      }
    }

    // Capture phase so a focused input can't swallow it first.
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [enabled])

  // 3. Native volume rocker (Capacitor Android)
  useEffect(() => {
    if (!isNative) return
    VolumeButtons.setEnabled({ enabled }).catch(() => {
      /* plugin missing on this platform (e.g. iOS); the JS paths still apply */
    })
    return () => {
      VolumeButtons.setEnabled({ enabled: false }).catch(() => {})
    }
  }, [enabled])

  // 2. Media Session handlers backed by silent audio.
  // Skipped in the native app: the rocker is handled natively there, and a
  // permanent "playing" media notification would be intrusive.
  useEffect(() => {
    if (!enabled || isNative) return
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return

    const session = navigator.mediaSession
    const audio = new Audio(SILENT_WAV)
    audio.loop = true
    audio.volume = 0.01 // must be audible-ish for some platforms to keep the session alive
    audioRef.current = audio

    const startAudio = () => {
      audio.play().catch(() => {
        /* autoplay blocked until the next gesture; we retry below */
      })
    }

    const setHandlers = () => {
      try {
        session.metadata = new MediaMetadata({
          title: title || 'Skim',
          artist: 'Volume buttons turn pages',
        })
        session.setActionHandler('nexttrack', () => nextRef.current())
        session.setActionHandler('previoustrack', () => prevRef.current())
        session.setActionHandler('seekforward', () => nextRef.current())
        session.setActionHandler('seekbackward', () => prevRef.current())
        // Keep "playing" so the session stays the active media target.
        session.setActionHandler('pause', () => {
          startAudio()
          session.playbackState = 'playing'
        })
        session.setActionHandler('play', () => {
          startAudio()
          session.playbackState = 'playing'
        })
        session.playbackState = 'playing'
      } catch {
        /* unsupported action names throw on some browsers; ignore */
      }
    }

    setHandlers()
    startAudio()

    // Retry on the next user gesture if autoplay was blocked.
    const gestureEvents: Array<keyof WindowEventMap> = ['pointerdown', 'touchstart', 'keydown']
    const onGesture = () => {
      if (audio.paused) startAudio()
    }
    gestureEvents.forEach((ev) => window.addEventListener(ev, onGesture, { passive: true }))

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && audio.paused) startAudio()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      gestureEvents.forEach((ev) => window.removeEventListener(ev, onGesture))
      document.removeEventListener('visibilitychange', onVisibility)
      audio.pause()
      audio.src = ''
      audioRef.current = null
      try {
        for (const action of ['nexttrack', 'previoustrack', 'seekforward', 'seekbackward', 'play', 'pause'] as const) {
          session.setActionHandler(action, null)
        }
        session.playbackState = 'none'
        session.metadata = null
      } catch {
        /* ignore */
      }
    }
  }, [enabled, title])
}
