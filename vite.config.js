import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy libs into separate chunks so the main bundle loads faster
        // and an app update invalidates less of the browser cache.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('recharts') || id.includes('/d3')) return 'charts'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('@hebcal')) return 'hebcal'
          if (id.includes('lucide-react')) return 'icons'
          if (id.includes('react-router') || id.includes('/react-dom/') || id.includes('/react/')) return 'react'
          return 'vendor'
        },
      },
    },
  },
})
