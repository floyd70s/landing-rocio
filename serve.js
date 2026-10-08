'use strict';
// Servidor estático mínimo (sin dependencias) para desarrollo o para correr la landing en un VPS.
// La landing es 100 % estática: también puede subirse tal cual a Netlify, Cloudflare Pages, S3, nginx, etc.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 4000;
// Origen de SGA para la CSP: API_ORIGIN, o el que figura en js/config.js (así nunca quedan desalineados)
const API = process.env.API_ORIGIN || (() => { try { return new URL((fs.readFileSync(path.join(__dirname, 'js/config.js'), 'utf8').match(/^\s*API_URL:\s*'([^']+)'/m) || [])[1]).origin; } catch { return ''; } })(); // origen de SGA (para la CSP), p. ej. https://sga.rociozacconi.cl
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
const PUBLICO = new Set(['index.html', 'robots.txt', 'sitemap.xml', 'favicon.ico']);
const DIRS = ['css', 'js', 'fonts', 'img'];

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const rel = path.normalize(p).replace(/^([/\\])+/, '');
  const ok = PUBLICO.has(rel) || DIRS.includes(rel.split(path.sep)[0]);
  const file = path.join(ROOT, rel);
  if (!ok || !file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
  res.writeHead(200, {
    'content-type': TIPOS[path.extname(file)] || 'application/octet-stream',
    'cache-control': rel.startsWith('fonts') || rel.startsWith('img') ? 'public, max-age=604800' : 'no-cache',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'content-security-policy': `default-src 'self'; connect-src 'self' ${API || 'http://localhost:3100'}; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'`,
  });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Landing de Rocío en http://localhost:${PORT}`));
