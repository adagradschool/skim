import { Capacitor } from '@capacitor/core'

export const ANDROID_APK_URL = 'https://github.com/adagradschool/skim/releases/latest/download/skim-android-debug.apk'

export const isNativeApp = Capacitor.isNativePlatform()
export const nativePlatform = Capacitor.getPlatform() as 'web' | 'android' | 'ios'
export const isAndroidApp = nativePlatform === 'android'
export const isIosApp = nativePlatform === 'ios'

/** Android in a browser (Chrome, Firefox…): the native app is the better home. */
export const isAndroidBrowser =
  typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) && !isNativeApp

export const NATIVE_APP_PITCH = {
  title: 'Skim is better as an app',
  body: 'Smoother pages, works fully offline, hardware buttons turn pages, and your library stays put. Set up once, keep it.',
  cta: 'Get the Android app',
}
