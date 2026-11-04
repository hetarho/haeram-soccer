import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { designSystem } from './src/design-system/server.ts';
import { gameplayInfluences } from './src/constants/server.ts';

const page = (name: string) => fileURLToPath(new URL(name, import.meta.url));

/** Standalone tools use the same addresses in development, preview and deployment. */
const rewriteLab: Connect.NextHandleFunction = (req, _res, next) => {
  if (req.url && /^\/(lab|constants)\/?(?:[?#]|$)/.test(req.url))
    req.url = req.url.replace(/^\/(lab|constants)\/?/, '/$1.html');
  next();
};
const labAddress = (): Plugin => ({
  name: 'haeram-lab-address',
  configureServer: (server) => void server.middlewares.use(rewriteLab),
  configurePreviewServer: (server) => void server.middlewares.use(rewriteLab),
});

export default defineConfig({
  root: page('.'),
  plugins: [react(), labAddress(), gameplayInfluences(), designSystem()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Standalone tools keep their code and inventory outside the game entry.
    rolldownOptions: {
      input: { main: page('index.html'), lab: page('lab.html'), constants: page('constants.html') },
    },
  },
  // The project's own dev port (1950, the founding year, plus a zero), kept fixed so a busy port
  // fails loudly instead of moving the game to another address.
  server: { host: '0.0.0.0', port: 19500, strictPort: true },
});
