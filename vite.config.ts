import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Bij GitHub Pages staat de app onder /klussen-app/; zet dan BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Darneviel Klussen',
        short_name: 'Darneviel',
        description: 'Per klant bijhouden wat er bij elk bezoek is gedaan',
        lang: 'nl',
        theme_color: '#0d0d0b',
        background_color: '#0d0d0b',
        display: 'standalone',
        icons: [
          { src: 'icoon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icoon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icoon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
