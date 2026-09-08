// The whole query engine, with no Node and no DOM dependency, so the identical
// code answers a request on the server and a click in the browser. The dataset
// is small enough (2,118 listings) to query in memory, which is what lets the
// site deploy as pure static files with no backend at all.

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

const SOLD_LINES = ['macan','panamera','taycan','cayman','boxster','911','i8'];

export const median = a => {
  const s = [...a].sort((x, y) => x - y); const n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : Math.round((s[n / 2 - 1] + s[n / 2]) / 2)) : 0;
};
const q1 = arr => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 4)] || 0; };

// A car is undominated when nothing else is simultaneously newer, lower-mileage
// and cheaper. With three conflicting goals this is the only honest shortlist.
function undominated(rows) {
  return rows.filter(b => !rows.some(a =>
    a !== b && a.year >= b.year && a.miles <= b.miles && a.price <= b.price &&
    (a.year > b.year || a.miles < b.miles || a.price < b.price)));
}

// Mutates the two arrays in place and returns the lookup structures the queries
// need. Everything derived is computed once here rather than per request.
export function prepare(listings, sold) {
  for (const c of listings) {
    let host = '';
    try { host = new URL(c.url).hostname.replace(/^www\./, ''); } catch { host = ''; }
    const hit = HOSTS.find(([re]) => re.test(host));
    if (hit) c.src = hit[1];
    else if (host) c.src = host;          // never surface a raw sitecode to a user
  }

  // Median asking price per (model, year-bucket) so a car is scored against its
  // own cohort rather than against the whole market.
  const cohortKey = c => `${c.model}|${Math.floor((c.year || 0) / 2) * 2}`;
  const cohorts = new Map();
  const modelPrices = new Map();
  for (const c of listings) {
    const k = cohortKey(c);
    if (!cohorts.has(k)) cohorts.set(k, []);
    cohorts.get(k).push(c.price);
    if (!modelPrices.has(c.model)) modelPrices.set(c.model, []);
    modelPrices.get(c.model).push(c.price);
  }

  for (const c of listings) {
    const cohort = cohorts.get(cohortKey(c)) || [];
    c.cohortMedian = cohort.length >= 4 ? median(cohort) : null;
    // A car far below its cohort is showing a title problem, not a bargain.
    // This rule caught three salvage exotics by hand.
    const floor = q1(modelPrices.get(c.model) || [c.price]);
    c.outlier = modelPrices.get(c.model).length >= 8 && c.price < floor * 0.62;
    if (c.cohortMedian) {
      const d = (c.price - c.cohortMedian) / c.cohortMedian;
      c.deal = d <= -0.15 ? 'great' : d <= -0.05 ? 'good' : d >= 0.15 ? 'high' : 'fair';
      c.vsCohort = Math.round(d * 100);
    }
  }

  // Recover mileage from BaT title conventions ("48k-Mile", "3,500-Mile"). Only a
  // minority of sold records carry a miles field, and a comps median with no
  // mileage context is a half-truth, so the UI states its coverage.
  for (const s of sold) {
    if (s.miles) continue;
    const k = (s.title || '').match(/([\d,]+)k-Mile/i);
    const m = (s.title || '').match(/([\d,]+)-Mile/i);
    if (k) s.miles = Math.round(parseFloat(k[1].replace(/,/g, '')) * 1000);
    else if (m) s.miles = +m[1].replace(/,/g, '');
  }

  const soldByModel = new Map();
  for (const s of sold) {
    const t = (s.title || '').toLowerCase();
    for (const m of SOLD_LINES) {
      if (t.includes(m)) {                 // keep lowercase; compsFor lowercases too
        if (!soldByModel.has(m)) soldByModel.set(m, []);
        soldByModel.get(m).push(s);
        break;
      }
    }
  }

  return { listings, sold, soldByModel };
}

export function compsFor(ctx, model, year) {
  const norm = (/cayman/i.test(model) ? 'cayman'
             : /boxster/i.test(model) ? 'boxster'
             : String(model || '')).toLowerCase();
  let pool = ctx.soldByModel.get(norm) || [];
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

export function search(ctx, q) {
  let r = ctx.listings;
  if (q.make)     r = r.filter(c => c.make === q.make);
  if (q.model)    r = r.filter(c => c.model === q.model);
  if (q.src)      r = r.filter(c => c.src === q.src);
  if (q.minYear)  r = r.filter(c => c.year >= +q.minYear);
  if (q.maxYear)  r = r.filter(c => c.year <= +q.maxYear);
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
  // Each survivor is a copy, so the merge never mutates the shared corpus and a
  // second query starts from clean records.
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
    comps: model ? compsFor(ctx, model, q.minYear ? +q.minYear : null) : null,
    undominatedCount: undominated(r).length,
    results: r.slice(0, +(q.limit || 60)),
  };
}

// Browse the auction archive directly. The comps panel answers "what is this car
// worth"; this answers "show me every sale", which is the BringATrailer half of
// the product and is a different question with different filters.
export function soldSearch(ctx, q) {
  let r = ctx.sold.filter(s => s.price > 0);
  if (q.model)    r = r.filter(s => (s.line || '').toLowerCase() === q.model.toLowerCase());
  if (q.minYear)  r = r.filter(s => s.year && s.year >= +q.minYear);
  if (q.maxYear)  r = r.filter(s => s.year && s.year <= +q.maxYear);
  if (q.minPrice) r = r.filter(s => s.price >= +q.minPrice);
  if (q.maxPrice) r = r.filter(s => s.price <= +q.maxPrice);
  if (q.maxMiles) r = r.filter(s => s.miles && s.miles <= +q.maxMiles);
  if (q.text) {
    const x = q.text.toLowerCase();
    r = r.filter(s => (s.title || '').toLowerCase().includes(x));
  }

  // Dates arrive as MM/DD/YYYY, which sorts wrong as a string. Key on YYYY-MM.
  const monthOf = s => { const [mm, , yy] = (s.date || '').split('/'); return yy && mm ? `${yy}-${mm.padStart(2, '0')}` : null; };
  const buckets = new Map();
  for (const s of r) {
    const k = monthOf(s); if (!k) continue;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(s.price);
  }
  const trend = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, ps]) => ({ month, n: ps.length, median: median(ps) }));

  const sort = q.sort || 'date';
  r = [...r].sort((a, b) => sort === 'price' ? a.price - b.price
                          : sort === 'priceDesc' ? b.price - a.price
                          : sort === 'miles' ? (a.miles || Infinity) - (b.miles || Infinity)
                          : sort === 'year' ? (b.year || 0) - (a.year || 0)
                          : new Date(b.date) - new Date(a.date));

  const prices = r.map(s => s.price);
  const withMiles = r.filter(s => s.miles).length;
  return {
    total: r.length,
    median: median(prices),
    low: prices.length ? Math.min(...prices) : 0,
    high: prices.length ? Math.max(...prices) : 0,
    // Most of the archive has no mileage. Stating the coverage keeps the median
    // honest rather than implying it is mileage-adjusted.
    milesCoverage: r.length ? Math.round((withMiles / r.length) * 100) : 0,
    trend,
    results: r.slice(0, +(q.limit || 60)),
  };
}

export function soldFacets(ctx) {
  const lines = {};
  for (const s of ctx.sold) lines[s.line] = (lines[s.line] || 0) + 1;
  return { lines, total: ctx.sold.length };
}

export function facets(ctx) {
  const makes = {}, models = {}, sources = {};
  for (const c of ctx.listings) {
    makes[c.make] = (makes[c.make] || 0) + 1;
    models[c.model] = (models[c.model] || 0) + 1;
    sources[c.src] = (sources[c.src] || 0) + 1;
  }
  return { makes, models, sources, total: ctx.listings.length, soldTotal: ctx.sold.length };
}
