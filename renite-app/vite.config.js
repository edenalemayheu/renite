import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],

  resolve: {
    alias: {
      // Shared blockchain ABI and service layer
      '@blockchain': fileURLToPath(new URL('../../shared/blockchain', import.meta.url)),
    },
  },

  build: {
    // Raise the warning threshold to 600 kB so advisory warnings only fire
    // if a chunk unexpectedly balloons past the new split boundaries.
    chunkSizeWarningLimit: 600,

    rolldownOptions: {
      output: {
        // Split vendor libraries into stable, cache-friendly named chunks.
        // Each group is updated independently so returning users only
        // re-download changed chunks.
        manualChunks(id) {
          // React core — smallest, most stable, longest cache life
          if (id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/scheduler/')) {
            return 'vendor-react';
          }

          // Routing
          if (id.includes('node_modules/react-router') ||
              id.includes('node_modules/cookie/') ||
              id.includes('node_modules/set-cookie-parser/')) {
            return 'vendor-router';
          }

          // Supabase — largest vendor group; split into its own chunk so it
          // can be cached independently of app code changes
          if (id.includes('node_modules/@supabase/')) {
            return 'vendor-supabase';
          }

          // i18n — updated infrequently, good cache candidate
          if (id.includes('node_modules/i18next') ||
              id.includes('node_modules/react-i18next') ||
              id.includes('node_modules/html-parse-stringify') ||
              id.includes('node_modules/use-sync-external-store/')) {
            return 'vendor-i18n';
          }

          // Lucide icons — large icon set, almost never changes version
          if (id.includes('node_modules/lucide-react/')) {
            return 'vendor-icons';
          }

          // Axios — small but separate for clarity
          if (id.includes('node_modules/axios/') ||
              id.includes('node_modules/follow-redirects/') ||
              id.includes('node_modules/form-data/') ||
              id.includes('node_modules/proxy-from-env/')) {
            return 'vendor-axios';
          }
        },
      },
    },
  },

  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
