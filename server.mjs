import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4173;

const listings = JSON.parse(fs.readFileSync(path.join(DIR, 'data/listings.json'), 'utf8'));
const sold     = JSON.parse(fs.readFileSync(path.join(DIR, 'data/sold.json'), 'utf8'));

/* ---------- source canonicalization ---------- */

// AutoTempest sitecodes are not a stable contract: an unmapped one ("cmp") shipped
// as a raw source label in the UI. The URL host is the ground truth, so resolve
// from it and let the sitecode be a fallback. A new sitecode now self-heals.
const HOSTS = [
  [/(^|\.)cars\.com$/,          'Cars.com'],
  [/(^|\.)cargurus\.com$/,      'CarGurus'],
  [/(^|\.)carmax\.com$/,        'CarMax'],
  [/(^|\.)autotrader\.com$/,    'Autotrader'],
  [/(^|\.)truecar\.com$/,       'TrueCar'],
  [/(^|\.)carvana\.com$/,       'Carvana'],
  [/(^|\.)ebay\.com$/,          'eBay Motors'],
  [/(^|\.)bringatrailer\.com$/, 'BringATrailer'],
  [/(^|\.)carsandbids\.com$/,   'Cars & Bids'],
  [/(^|\.)hemmings\.com$/,      'Hemmings'],
  [/(^|\.)autonation\.com$/,    'AutoNation'],
  [/(^|\.)pcarmarket\.com$/,    'PCARMARKET'],
  [/(^|\.)dupontregistry\.com$/,'duPont Registry'],
  [/(^|\.)craigslist\.org$/,    'Craigslist'],
  [/(^|\.)privateauto\.com$/,   'PrivateAuto'],
  [/(^|\.)sothebysmotorsport\.com$/, "Sotheby's Motorsport"],
];

for (const c of listings) {
  let host = '';
  try { host = new URL(c.url).hostname.replace(/^www\./, ''); } catch { host = ''; }
  const hit = HOSTS.find(([re]) => re.test(host));
  if (hit) c.src = hit[1];
  else if (host) c.src = host;          // never surface a raw sitecode to a user
}

/* ---------- derived intelligence, computed once at boot ---------- */

// Median asking price per (model, year-bucket) so we can score a car against
// its own cohort rather than against the whole market.
const cohortKey = c => `${c.model}|${Math.floor((c.year || 0) / 2) * 2}`;
const cohorts = new Map();
for (const c of listings) {
  const k = cohortKey(c);
  if (!cohorts.has(k)) cohorts.set(k, []);
  cohorts.get(k).push(c.price);
}
const median = a => { const s = [...a].sort((x, y) => x - y); const n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : Math.round((s[n / 2 - 1] + s[n / 2]) / 2)) : 0; };

// Model-level price floors. A car far below its cohort is showing a title
// problem, not a bargain: this rule caught three salvage exotics by hand.
const modelPrices = new Map();
for (const c of listings) {
  if (!modelPrices.has(c.model)) modelPrices.set(c.model, []);
  modelPrices.get(c.model).push(c.price);
}
const q1 = arr => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 4)] || 0; };

for (const c of listings) {
  const cohort = cohorts.get(cohortKey(c)) || [];
  c.cohortMedian = cohort.length >= 4 ? median(cohort) : null;
  const floor = q1(modelPrices.get(c.model) || [c.price]);
  c.outlier = modelPrices.get(c.model).length >= 8 && c.price < floor * 0.62;
  if (c.cohortMedian) {
    const d = (c.price - c.cohortMedian) / c.cohortMedian;
    c.deal = d <= -0.15 ? 'great' : d <= -0.05 ? 'good' : d >= 0.15 ? 'high' : 'fair';
    c.vsCohort = Math.round(d * 100);
  }
}

// Sold comps by model. This is the differentiator: AutoTempest shows asks only.
const soldByModel = new Map();
for (const s of sold) {
  const t = (s.title || '').toLowerCase();
  for (const m of ['macan','panamera','taycan','cayman','boxster','911','i8']) {
    if (t.includes(m)) {
      const key = m;                     // keep lowercase; compsFor lowercases too
      if (!soldByModel.has(key)) soldByModel.set(key, []);
      soldByModel.get(key).push(s);
      break;
    }
  }
}

function compsFor(model, year) {
  const norm = (/cayman/i.test(model) ? 'cayman'
             : /boxster/i.test(model) ? 'boxster'
             : String(model || '')).toLowerCase();
  let pool = soldByModel.get(norm) || [];
  if (year) {
    const near = pool.filter(s => s.year && Math.abs(s.year - year) <= 3);
    if (near.length >= 3) pool = near;
  }
  if (!pool.length) return null;
  const prices = pool.map(s => s.price);
  return {
    n: pool.length,
    median: median(prices),
    low: Math.min(...prices),
    high: Math.max(...prices),
    recent: [...pool].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6),
  };
}

// A car is undominated when nothing else is simultaneously newer, lower-mileage
// and cheaper. With three conflicting goals this is the only honest shortlist.
function undominated(rows) {
  return rows.filter(b => !rows.some(a =>
    a !== b && a.year >= b.year && a.miles <= b.miles && a.price <= b.price &&
    (a.year > b.year || a.miles < b.miles || a.price < b.price)));
}

/* ---------- api ---------- */

function search(q) {
  let r = listings;
  if (q.make)   r = r.filter(c => c.make === q.make);
  if (q.model)  r = r.filter(c => c.model === q.model);
  if (q.src)    r = r.filter(c => c.src === q.src);
  if (q.minYear) r = r.filter(c => c.year >= +q.minYear);
  if (q.maxYear) r = r.filter(c => c.year <= +q.maxYear);
  if (q.maxMiles) r = r.filter(c => c.miles <= +q.maxMiles);
  if (q.minPrice) r = r.filter(c => c.price >= +q.minPrice);
  if (q.maxPrice) r = r.filter(c => c.price <= +q.maxPrice);
  if (q.hideOutliers === '1') r = r.filter(c => !c.outlier);
  if (q.hideAuctions === '1') r = r.filter(c => !c.auction);
  if (q.text) {
    const t = q.text.toLowerCase();
    r = r.filter(c => (c.title || '').toLowerCase().includes(t) || (c.loc || '').toLowerCase().includes(t));
  }
  if (q.undominated === '1') r = undominated(r);

  // Merge duplicates across sources before sorting. The same car syndicated to
  // Cars.com, CarGurus and CarMax is one car, not three: same model, year and
  // exact mileage with a price within 3%. Without this the counts lie.
  const merged = [];
  const byCar = new Map();
  for (const c of r) {
    const k = `${c.model}|${c.year}|${c.miles}`;
    const prev = byCar.get(k);
    if (prev && Math.abs(prev.price - c.price) / Math.max(prev.price, 1) < 0.03) {
      prev.alsoOn = prev.alsoOn || [];
      if (c.src !== prev.src && !prev.alsoOn.includes(c.src)) prev.alsoOn.push(c.src);
      if (c.price < prev.price) { prev.price = c.price; prev.url = c.url; prev.src = c.src; }
      continue;
    }
    const copy = { ...c };
    byCar.set(k, copy);
    merged.push(copy);
  }
  r = merged;

  const sort = q.sort || 'price';
  const dir  = sort === 'year' ? -1 : 1;
  r = [...r].sort((a, b) => (a[sort] - b[sort]) * dir);

  const bySource = {};
  for (const c of r) bySource[c.src] = (bySource[c.src] || 0) + 1;
  const model = q.model || (r[0] && r[0].model);

  return {
    total: r.length,
    bySource,
    comps: model ? compsFor(model, q.minYear ? +q.minYear : null) : null,
    undominatedCount: undominated(r).length,
    results: r.slice(0, +(q.limit || 60)),
  };
}

function facets() {
  const makes = {}, models = {}, sources = {};
  for (const c of listings) {
    makes[c.make] = (makes[c.make] || 0) + 1;
    models[c.model] = (models[c.model] || 0) + 1;
    sources[c.src] = (sources[c.src] || 0) + 1;
  }
  return { makes, models, sources, total: listings.length, soldTotal: sold.length };
}

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json' };

http.createServer((req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const send = (code, body, type = 'application/json') => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    // Buffers must pass through untouched: JSON.stringify turns a file into
    // {"type":"Buffer","data":[...]} and the browser renders that literally.
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };

  if (u.pathname === '/api/search')  return send(200, search(Object.fromEntries(u.searchParams)));
  if (u.pathname === '/api/facets')  return send(200, facets());
  if (u.pathname === '/api/comps')   return send(200, compsFor(u.searchParams.get('model') || '', +u.searchParams.get('year') || null) || {});

  const file = u.pathname === '/' ? '/index.html' : u.pathname;
  const full = path.join(DIR, 'public', file);
  if (!full.startsWith(path.join(DIR, 'public')) || !fs.existsSync(full)) return send(404, 'not found', 'text/plain');
  send(200, fs.readFileSync(full), MIME[path.extname(full)] || 'text/plain');
}).listen(PORT, () => {
  console.log(`\n  Aggregator running: http://localhost:${PORT}`);
  console.log(`  ${listings.length} listings across ${Object.keys(facets().sources).length} sources`);
  console.log(`  ${sold.length} verified sold records for comps\n`);
});
