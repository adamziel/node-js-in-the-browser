import { defineConfig } from 'vite'

export default defineConfig({
  base: '/experiments/dist/',
  server: {
    // Required for SharedArrayBuffer and cross-origin isolation
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
    port: 3000,
    host: true
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    lib: false,
    rollupOptions: {
      output: {
        format: 'esm',
      },
      input: {
        index: 'index.html',
        'comlink-sync': 'comlink-sync.html'
      }      
    }
  },
  worker: {
    format: 'es'
  },
  esbuild: {
    target: 'esnext'
  }
})
