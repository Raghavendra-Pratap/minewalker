import { defineConfig } from 'vite'

export default defineConfig({
  /* Relative asset + model URLs so the build works under /games/minewalker/. */
  base: './',
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
