import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(rootDir, 'src/mainview'),
  base: './',
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src/mainview'),
      '@app-icon': path.resolve(rootDir, 'src/mainview/assets/icons/app-icon.svg'),
      '@assets': path.resolve(rootDir, 'src/mainview/assets'),
      '@core': path.resolve(rootDir, 'src/core'),
      '@platforms': path.resolve(rootDir, 'src/platforms'),
    },
  },
  build: {
    outDir: path.resolve(rootDir, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(rootDir, 'src/mainview/index.html'),
        'counter-strafing-hud': path.resolve(rootDir, 'src/mainview/counter-strafing-hud.html'),
        'counter-strafing-assessment-hud': path.resolve(
          rootDir,
          'src/mainview/counter-strafing-assessment-hud.html',
        ),
      },
    },
  },
  clearScreen: false,
  server: {
    strictPort: true,
    port: 5173,
  },
});
