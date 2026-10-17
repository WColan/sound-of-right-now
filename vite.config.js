import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Tone.js and the astronomy engine change rarely — cache them separately
        manualChunks: {
          tone: ['tone'],
          astronomy: ['astronomy-engine'],
        },
      },
    },
  },
});
