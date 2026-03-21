import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // In dev, proxy /api/extract to avoid CORS when using a local proxy server.
  // For production (Vercel), the api/ directory is deployed as serverless functions.
  // If running pure vite dev without Vercel, the app falls back to direct Anthropic
  // calls using the API key stored in localStorage.
  server: {
    port: 3000,
  },
})
