import { defineConfig, loadEnv } from 'vite'
import ollamaPlugin from './vite-plugin-ollama.js'
import react from '@vitejs/plugin-react'
import jurisdictionConfigPlugin from './vite-plugin-jurisdiction.js'

export default defineConfig(({ mode }) => ({
  plugins: [
    jurisdictionConfigPlugin(),  // runs build-config.js before every build/dev start
    react(),
    ollamaPlugin({ ...loadEnv(mode, process.cwd(), ''), ...process.env }),
  ],
  server: { port: 3000 }
}))
