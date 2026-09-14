import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'dev.skim.reader',
  appName: 'Skim',
  webDir: 'dist',
  android: {
    // Keep the WebView on a secure origin so IndexedDB, wake lock and the
    // service worker behave the same as in the browser build.
    allowMixedContent: false,
  },
}

export default config
