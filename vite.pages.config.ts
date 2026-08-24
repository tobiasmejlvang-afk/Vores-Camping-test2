import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'github-pages',
  base: '/Vores-Camping-test2/',
  publicDir: '../public',
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    outDir: '../docs',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
  },
});
