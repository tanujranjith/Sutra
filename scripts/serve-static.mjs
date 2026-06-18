#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.cwd());
const port = Number(process.env.PORT || process.argv[2] || 5173);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function resolveRequestPath(urlPath) {
  const cleanPath = decodeURIComponent(String(urlPath || '/').split('?')[0]);
  const target = normalize(join(root, cleanPath === '/' ? 'index.html' : cleanPath));
  if (!target.startsWith(root)) return null;
  if (!existsSync(target)) return null;
  const info = statSync(target);
  if (info.isDirectory()) return join(target, 'index.html');
  return target;
}

const server = createServer((req, res) => {
  const filePath = resolveRequestPath(req.url);
  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const type = types[extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://unpkg.com https://accounts.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://i.ytimg.com; font-src 'self'; connect-src 'self' https://api.groq.com https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://openrouter.ai https://www.googleapis.com https://accounts.google.com https://YOUR-PROJECT-REF.supabase.co http://localhost:* http://127.0.0.1:*; frame-src 'self' https://accounts.google.com https://docs.google.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://open.spotify.com https://w.soundcloud.com https://codepen.io https://www.figma.com data: blob:; media-src 'self' data: blob: https://open.spotify.com https://w.soundcloud.com; worker-src 'self' blob:; form-action 'self' https://docs.google.com; frame-ancestors 'none'"
  });
  // Stream the file, but never let an aborted request (the browser cancels
  // in-flight resource loads constantly during rapid navigation in the e2e
  // suite) throw an UNHANDLED stream error that would crash the whole server
  // and cascade `page.goto` timeouts into unrelated tests. Fail the single
  // response quietly instead.
  const stream = createReadStream(filePath);
  stream.on('error', () => { try { res.destroy(); } catch (_) {} });
  res.on('error', () => { try { stream.destroy(); } catch (_) {} });
  req.on('aborted', () => { try { stream.destroy(); } catch (_) {} });
  stream.pipe(res);
});

// Don't let a malformed/early-closed client connection throw at the server level.
server.on('clientError', (err, socket) => {
  try { socket.destroy(); } catch (_) {}
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Sutra static server listening on http://127.0.0.1:${port}`);
});
