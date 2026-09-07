import { chromium } from 'playwright';
import fs from 'fs';

const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAXPRICE = 40000;
const MINYEAR  = 2016;
const MAXMILES = 70000;

const EXTRACT = () => [...document.querySelectorAll('.result-list-item')].map(li => {
  const sec = li.querySelector('section');
  const txt = li.innerText || '';
  const L   = txt.split('\n').map(s=>s.trim()).filter(Boolean);
  const a   = li.querySelector('a.listing-link[href], a[href^="http"]');
  const price = (txt.match(/\$([\d,]+)/)||[])[1];
  const miles = (txt.match(/([\d,]+)\s*mi\./)||[])[1];
  const loc   = (txt.match(/\n\s*([A-Za-z .'-]+,\s*[A-Z]{2})\s*(?:\(|\n|$)/)||[])[1];
  return {
    title : L[0] || '',
    price : price ? +price.replace(/,/g,'') : null,
    miles : miles ? +miles.replace(/,/g,'') : null,
    loc   : loc ? loc.trim() : '',
    source: sec ? sec.getAttribute('data-backend-sitecode') : null,
    id    : sec ? sec.getAttribute('data-listing-id') : null,
    url   : a ? a.href : null,
  };
});

const b = await chromium.launch({args:['--disable-blink-features=AutomationControlled']});
const ctx = await b.newContext({userAgent:UA, viewport:{width:1440,height:1200}, locale:'en-US',
  extraHTTPHeaders:{'Accept-Language':'en-US,en;q=0.9'}});
await ctx.addInitScript(()=>{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})});

const url = `https://www.autotempest.com/results?make=porsche&maxprice=${MAXPRICE}&minyear=${MINYEAR}`
          + `&maxmiles=${MAXMILES}&zip=92101&radius=any&sort=mileage`;
const p = await ctx.newPage();
console.log('GET', url);
await p.goto(url,{waitUntil:'domcontentloaded',timeout:60000});

// results stream in per source; wait for the count to stabilise
let last=-1, stable=0;
for (let i=0;i<24;i++){
  await p.waitForTimeout(2500);
  await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  const n = await p.evaluate(()=>document.querySelectorAll('.result-list-item').length);
  if (n===last) { if(++stable>=3) break; } else { stable=0; }
  last=n;
  process.stdout.write(`  ${n} results...\r`);
}
console.log(`\nsettled at ${last} raw items`);

const rows = await p.evaluate(EXTRACT);
await b.close();

const bySource = {};
for (const r of rows) bySource[r.source||'?'] = (bySource[r.source||'?']||0)+1;
console.log('sources:', JSON.stringify(bySource));

const clean = rows.filter(r =>
  r.price && r.miles && r.title &&
  r.price <= MAXPRICE && r.miles <= MAXMILES &&
  !/cayenne/i.test(r.title) &&
  (+(r.title.match(/\b(19|20)\d{2}\b/)||[0])[0]) >= MINYEAR
);
clean.sort((a,b)=>a.miles-b.miles);
fs.writeFileSync('/workspaces/three.ws/scratch/scraper/autotempest.json', JSON.stringify(clean,null,1));
console.log(`kept ${clean.length} after filters (2016+, <=${MAXMILES} mi, <=$${MAXPRICE}, no Cayenne)`);
console.log('\nlowest-mileage 15:');
for (const c of clean.slice(0,15))
  console.log(`  ${String(c.miles).padStart(7)} mi  $${String(c.price).padStart(6)}  ${c.title.slice(0,42).padEnd(42)} ${String(c.source).padEnd(9)} ${c.loc}`);
