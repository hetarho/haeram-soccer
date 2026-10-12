import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  // The project's own dev port (1950, the founding year, plus a zero), kept fixed so a busy port
  // fails loudly instead of moving the game to another address.
  server: { host: '0.0.0.0', port: 19500, strictPort: true },
});
