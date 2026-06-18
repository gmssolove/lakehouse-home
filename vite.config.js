import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  appType: 'mpa',
  publicDir: 'static',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@oc': resolve(__dirname, 'src/oc'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        oc: resolve(__dirname, 'oc.html'),
        pair: resolve(__dirname, 'pair.html'),
        admin: resolve(__dirname, 'admin.html'),
        characters: resolve(__dirname, 'characters.html'),
        kisaragi: resolve(__dirname, 'kisaragi.html'),
      },
    },
  },
  server: {
    open: '/index.html',
    proxy: {
      '/api': 'http://localhost:3004',
    },
  },
});
