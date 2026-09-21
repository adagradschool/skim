import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { readFileSync } from 'fs'

import { handleFetchPage } from './api/_lib/fetchPage.mjs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

/** Serves /api/fetch in `vite dev` and `vite preview` with the same code Vercel runs. */
const pageProxyPlugin = {
  name: 'skim-page-proxy',
  configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
    server.middlewares.use((req, res, next) => (req.url?.startsWith('/api/fetch') ? handleFetchPage(req, res) : next()))
  },
  configurePreviewServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
    server.middlewares.use((req, res, next) => (req.url?.startsWith('/api/fetch') ? handleFetchPage(req, res) : next()))
  },
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    strictPort: false,
    host: true,
    allowedHosts: ['.zrok.io'],
  },
  preview: {
    port: 4173,
    strictPort: false,
    host: true,
    allowedHosts: ['.zrok.io'],
  },
  plugins: [
    pageProxyPlugin,
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Skim - EPUB Reader',
        short_name: 'Skim',
        description: 'TikTok-style EPUB reader with auto-advance slides',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'file', accept: ['application/epub+zip', 'application/pdf', '.epub', '.pdf'] }],
          },
        },
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
      injectManifest: {
        // The Store catalog (json) is precached so browsing works offline;
        // the books themselves come from standardebooks.org on demand.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,json}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
