import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@hamilton/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  optimizeDeps: {
    // Exclude from pre-bundling so the resolve.alias (TypeScript source) is used
    exclude: ['@hamilton/shared'],
  },
  server: {
    port: 5173,
    fs: {
      // Absolute path — allow serving files from the monorepo root
      allow: [path.resolve(__dirname, '../..')],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
