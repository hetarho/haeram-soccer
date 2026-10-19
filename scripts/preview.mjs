import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
const root = path.resolve('apps/web/dist');
const port = Number(process.env.PORT || 4173);
const redirects = (await readFile(path.join(root, '_redirects'), 'utf8'))
  .split('\n')
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split(/\s+/));
// Netlify `_headers`: an unindented path pattern, then its indented `Name: value` lines.
const headerRules = [];
for (const line of (await readFile(path.join(root, '_headers'), 'utf8')).split('\n')) {
  if (!line.trim() || line.trimStart().startsWith('#')) continue;
  if (!/^\s/.test(line)) headerRules.push({ pattern: line.trim(), headers: [] });
  else {
    const colon = line.indexOf(':');
    headerRules.at(-1).headers.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()]);
  }
}
const matches = (pattern, name) =>
  pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
// Every matching block applies; a later block overrides an earlier one's header of the same name.
const declaredHeaders = (name) => {
  const headers = new Map();
  for (const rule of headerRules)
    if (matches(rule.pattern, name))
      for (const [key, value] of rule.headers) headers.set(key.toLowerCase(), [key, value]);
  return Object.fromEntries(headers.values());
};
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://localhost:${port}`),
        name = decodeURIComponent(url.pathname);
      let target = name === '/' ? '/index.html' : name;
      const redirect = redirects.find(([source]) => matches(source, name));
      if (redirect) target = redirect[1];
      let file = path.resolve(root, '.' + target);
      if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
      let status = 200;
      try {
        if (!(await stat(file)).isFile()) throw new Error('Not a file');
      } catch {
        file = path.join(root, '404.html');
        status = 404;
      }
      let body = await readFile(file);
      const compressed =
        /\b(?:gzip)\b/.test(req.headers['accept-encoding'] || '') &&
        /\.(html|css|js|json|svg)$/.test(file);
      if (compressed) body = gzipSync(body);
      res.writeHead(status, {
        ...declaredHeaders(name),
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        'Content-Length': body.length,
        ...(compressed ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : {}),
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(400);
      res.end('Bad request');
    }
  })
  .listen(port, '0.0.0.0', () =>
    console.log(
      `Built static preview: http://localhost:${port} (HTTPS/localhost required for safe saves)`,
    ),
  );
