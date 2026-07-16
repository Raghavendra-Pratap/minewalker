import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5174,
  },
  resolve: {
    /* One @babylonjs/core instance so loader plugins register where SceneLoader lives. */
    dedupe: ['@babylonjs/core'],
  },
  optimizeDeps: {
    include: ['@babylonjs/core', '@babylonjs/loaders'],
  },
})
