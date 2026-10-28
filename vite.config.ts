import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // The GitHub Pages test build is served from /<repo>/, so it sets VITE_BASE; Netlify serves from /
  base: process.env.VITE_BASE || '/',
  server: {
    port: 3000,
  },
})
