import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { apiHandler } from './api.mjs';
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.woff2':'font/woff2', '.jpg':'image/jpeg' };
export function webHandler(database, dist = resolve('dist')) {
  const root = resolve(dist);
  const api = apiHandler(database);
  return async (req, res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    try {
      await api(req, res, async () => {
        if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
        const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        if (pathname === '/health') { res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}); return res.end(req.method === 'HEAD' ? undefined : '{"status":"ready"}'); }
        let file = resolve(root,'.'+pathname);
        if (!file.startsWith(root+sep) && file !== root) { res.writeHead(403); return res.end(); }
        if (pathname.split('/').some(part=>part.startsWith('.'))) { res.writeHead(404); return res.end(); }
        try { if (!(await stat(file)).isFile()) file = resolve(root,'index.html'); }
        catch { if (extname(pathname)) { res.writeHead(404); return res.end(); } file = resolve(root,'index.html'); }
        const data = await readFile(file);
        res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable' });
        res.end(req.method === 'HEAD' ? undefined : data);
      });
    } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
  };
}
