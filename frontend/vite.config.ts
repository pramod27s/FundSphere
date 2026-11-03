import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

/** Third-party code that changes far less often than the app, each in its own file. */
const VENDOR_CHUNKS: [name: string, pattern: RegExp][] = [
  ['react', /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/],
  ['router', /[\\/]node_modules[\\/](react-router|react-router-dom)[\\/]/],
  ['motion', /[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/],
]

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  build: {
    rollupOptions: {
      output: {
        // React, the router and Framer Motion load on every page, so they'd sit in the
        // main bundle. Splitting them out keeps that bundle small, lets the browser fetch
        // the pieces in parallel, and keeps them cached when only the app's code changes.
        manualChunks(id) {
          return VENDOR_CHUNKS.find(([, pattern]) => pattern.test(id))?.[0]
        },
      },
    },
  },
})
