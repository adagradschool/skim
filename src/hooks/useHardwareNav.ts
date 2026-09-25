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
 * 2. In the Capacitor Android app, asks the native VolumeButtons plugin to
 *    take over the rocker. The activity swallows the hardware keys and
 *    re-dispatches them as the same keydown events handled in (1), so the
 *    web code path is identical in the browser and the app.
 */

interface VolumeButtonsPlugin {
  setEnabled(options: { enabled: boolean }): Promise<void>
}

const VolumeButtons = registerPlugin<VolumeButtonsPlugin>('VolumeButtons')
const isNative = Capacitor.isNativePlatform()
const isAndroid = Capacitor.getPlatform() === 'android'
export const isNativeApp = isNative

const VOLUME_UP_KEYS = new Set(['AudioVolumeUp', 'VolumeUp'])
const VOLUME_DOWN_KEYS = new Set(['AudioVolumeDown', 'VolumeDown'])
// Legacy keyCodes: 175/174 (Chromium, IE), 183/182 (Firefox)
const VOLUME_UP_CODES = new Set([175, 183])
const VOLUME_DOWN_CODES = new Set([174, 182])


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

export function useHardwareNav({ enabled, onNext, onPrevious }: HardwareNavOptions) {
  const nextRef = useRef(onNext)
  const prevRef = useRef(onPrevious)
  nextRef.current = onNext
  prevRef.current = onPrevious

  // 1. Volume key events. Android only: iOS never exposes the rocker and
  //    Apple rejects apps that repurpose it.
  useEffect(() => {
    if (!enabled || !isAndroid) return

    // Volume down (the lower button, under the thumb) = next; volume up = previous.
    const handleKey = (event: KeyboardEvent) => {
      if (isVolumeDownEvent(event)) {
        event.preventDefault()
        nextRef.current()
      } else if (isVolumeUpEvent(event)) {
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
    if (!isNative || !isAndroid) return
    VolumeButtons.setEnabled({ enabled }).catch(() => {
      /* plugin missing on this platform (e.g. iOS); the JS paths still apply */
    })
    return () => {
      VolumeButtons.setEnabled({ enabled: false }).catch(() => {})
    }
  }, [enabled])

}
