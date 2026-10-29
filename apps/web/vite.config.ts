import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const page = (name: string) => fileURLToPath(new URL(name, import.meta.url));

/** `/lab` serves the match lab's own entry (→LAB-1), as `_redirects` does on Netlify. */
const rewriteLab: Connect.NextHandleFunction = (req, _res, next) => {
  if (req.url && /^\/lab\/?(?:[?#]|$)/.test(req.url))
    req.url = '/lab.html' + req.url.replace(/^\/lab\/?/, '');
  next();
};
const labAddress = (): Plugin => ({
  name: 'haeram-lab-address',
  configureServer: (server) => void server.middlewares.use(rewriteLab),
  configurePreviewServer: (server) => void server.middlewares.use(rewriteLab),
});

export default defineConfig({
  root: page('.'),
  plugins: [react(), labAddress()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // The lab is a second entry with its own chunks: the game's initial download stays as it was.
    rolldownOptions: { input: { main: page('index.html'), lab: page('lab.html') } },
  },
  // The project's own dev port (1950, the founding year, plus a zero), kept fixed so a busy port
  // fails loudly instead of moving the game to another address.
  server: { host: '0.0.0.0', port: 19500, strictPort: true },
});
