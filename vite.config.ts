import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Garomax Bites',
        short_name: 'Garomax',
        description: 'Restaurant stock and sales management — works offline.',
        theme_color: '#090a0f',
        background_color: '#090a0f',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the built app shell (JS/CSS/HTML/icons) so the app itself
        // opens with zero connectivity. Order data (Dexie/IndexedDB) is
        // already local-first and handled separately from this cache.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Supabase calls should never be served from a stale cache — always
        // hit the network (or fail fast) so sync state never lies to the user.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server:{
    host:true,
    port:5173,
    strictPort: true,
    allowedHosts: true,
  }
});