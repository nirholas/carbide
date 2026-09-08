// Assemble the deployable static site. There is no bundler and no transform:
// the browser loads engine.mjs as a native ES module, so a "build" is only a
// copy of the three things the page needs plus a cache manifest.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'dist');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });

for (const f of fs.readdirSync(path.join(DIR, 'public'))) {
  fs.copyFileSync(path.join(DIR, 'public', f), path.join(OUT, f));
}
for (const f of ['listings.json', 'sold.json']) {
  fs.copyFileSync(path.join(DIR, 'data', f), path.join(OUT, 'data', f));
}

// The corpus is immutable per deploy and the shell is not, so they get opposite
// cache policies. Without this the browser re-downloads 800KB on every visit.
fs.writeFileSync(path.join(OUT, '_headers'),
`/data/*
  Cache-Control: public, max-age=31536000, immutable

/engine.mjs
  Content-Type: text/javascript; charset=utf-8

/
  Cache-Control: public, max-age=0, must-revalidate
`);

const size = d => fs.readdirSync(d, { withFileTypes: true })
  .reduce((n, e) => n + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log(`dist/ built: ${(size(OUT) / 1024 / 1024).toFixed(2)} MB`);
for (const f of fs.readdirSync(OUT)) console.log('  ' + f);
