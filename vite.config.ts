import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'src/web',
  base: './',
  resolve: {
    // `@/…` → src/web/… (the shadcn/ui convention, see components.json).
    alias: { '@': fileURLToPath(new URL('./src/web', import.meta.url)) },
  },
  build: {
    outDir: '../../dist-web',
    emptyOutDir: true,
  },
});
