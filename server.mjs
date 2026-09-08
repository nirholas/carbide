// Local dev server. It exists for parity checking only: the deployed site is
// pure static and runs the same engine in the browser, so any behaviour that
// differs between the two is a bug in one of these two thin shells, never in the
// query logic itself.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepare, search, facets, soldSearch, soldFacets, compsFor } from './public/engine.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4173;

const ctx = prepare(
  JSON.parse(fs.readFileSync(path.join(DIR, 'data/listings.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(DIR, 'data/sold.json'), 'utf8')),
);

const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json' };

http.createServer((req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const q = () => Object.fromEntries(u.searchParams);
  const send = (code, body, type = 'application/json') => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    // Buffers must pass through untouched: JSON.stringify turns a file into
    // {"type":"Buffer","data":[...]} and the browser renders that literally.
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };

  if (u.pathname === '/api/search')       return send(200, search(ctx, q()));
  if (u.pathname === '/api/facets')       return send(200, facets(ctx));
  if (u.pathname === '/api/sold')         return send(200, soldSearch(ctx, q()));
  if (u.pathname === '/api/sold-facets')  return send(200, soldFacets(ctx));
  if (u.pathname === '/api/comps')        return send(200, compsFor(ctx, u.searchParams.get('model') || '', +u.searchParams.get('year') || null) || {});

  // The browser build fetches the corpus straight off disk, so /data must be
  // served alongside /public exactly as the static host will serve it.
  const file = u.pathname === '/' ? '/index.html' : u.pathname;
  const full = path.join(file.startsWith('/data/') ? DIR : path.join(DIR, 'public'), file);
  // Confine to the two served roots. A bare DIR prefix check would expose the
  // scraper sources and .git to a ../ traversal.
  const allowed = [path.join(DIR, 'public'), path.join(DIR, 'data')];
  if (!allowed.some(a => full.startsWith(a + path.sep)) ||
      !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    return send(404, 'not found', 'text/plain');
  }
  send(200, fs.readFileSync(full), MIME[path.extname(full)] || 'text/plain');
}).listen(PORT, () => {
  console.log(`\n  Carbide dev server: http://localhost:${PORT}`);
  console.log(`  ${ctx.listings.length} listings across ${Object.keys(facets(ctx).sources).length} sources`);
  console.log(`  ${ctx.sold.length} verified sold records for comps\n`);
});
