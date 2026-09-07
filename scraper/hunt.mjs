import { chromium } from 'playwright';
import fs from 'fs';
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MINYEAR=2016, MAXMILES=70000;
const SOURCE={pa:'PrivateAuto',cab:'Cars & Bids',cv:'Carvana',cm:'CarMax',eb:'eBay Motors',
  cgu:'CarGurus',tc:'TrueCar',ct:'Cars.com',at:'Autotrader',hm:'Hemmings',cx:'Carfax'};

// [label, make, model, minYear, floorPrice]  floor = model-aware plausibility guard
const HUNTS=[
  ['Macan 2019+',      'porsche','macan',      2019, 12000],
  ['Macan 2016-2018',  'porsche','macan',      2016, 12000],
  ['911',              'porsche','911',        2016, 45000],
  ['Panamera',         'porsche','panamera',   2016, 15000],
  ['Taycan',           'porsche','taycan',     2019, 30000],
  ['Cayman',           'porsche','cayman',     2016, 18000],
  ['Boxster',          'porsche','boxster',    2016, 18000],
  ['BMW i8',           'bmw','i8',             2016, 30000],
  ['G-Wagon',          'mercedes-benz','g-class', 2016, 45000],
  ['McLaren',          'mclaren','',           2016, 60000],
  ['Lamborghini',      'lamborghini','',       2016, 90000],
  ['Ferrari',          'ferrari','',           2016, 90000],
  ['Aston Martin',     'aston-martin','',      2016, 45000],
  ['Bentley',          'bentley','',           2016, 45000],
  ['Audi R8',          'audi','r8',            2016, 60000],
  ['AMG GT',           'mercedes-benz','amg-gt',2016, 45000],
  ['Corvette',         'chevrolet','corvette', 2020, 45000],
];

const EXTRACT=()=>[...document.querySelectorAll('.result-list-item')].map(li=>{
  const sec=li.querySelector('section[data-backend-sitecode]');
  const t=el=>el?el.innerText.trim():'';
  const num=s=>{const m=(s||'').replace(/,/g,'').match(/\$?\s*(\d{3,})/);return m?+m[1]:null;};
  return {
    title:t(li.querySelector('.title-wrap, h2')).split('\n')[0],
    price:num(t(li.querySelector('.price-wrap'))),
    miles:num(t(li.querySelector('.mileage'))),
    loc:t(li.querySelector('.location .city, .location')).split('(')[0].trim(),
    source:sec?sec.getAttribute('data-backend-sitecode'):null,
    id:sec?sec.getAttribute('data-listing-id'):null,
    url:(li.querySelector('a.listing-link[href^="http"]')||{}).href||null,
    auction:!!li.querySelector('.description-badges__auction-badge'),
  };
}).filter(r=>r.id);

const b=await chromium.launch({args:['--disable-blink-features=AutomationControlled']});
const ctx=await b.newContext({userAgent:UA,viewport:{width:1440,height:1200},locale:'en-US',
  extraHTTPHeaders:{'Accept-Language':'en-US,en;q=0.9'}});
await ctx.addInitScript(()=>{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})});

const pool=new Map();
for(const [label,make,model,minYear,floor] of HUNTS){
  for(const sort of ['mileage','price']){
    const u=`https://www.autotempest.com/results?make=${make}`
      +(model?`&model=${model}`:'')
      +`&minyear=${minYear}&maxmiles=${MAXMILES}&zip=92101&radius=any&sort=${sort}`;
    const p=await ctx.newPage();
    try{
      await p.goto(u,{waitUntil:'domcontentloaded',timeout:60000});
      let last=-1,stable=0;
      for(let i=0;i<13;i++){
        await p.waitForTimeout(2200);
        await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
        const n=await p.evaluate(()=>document.querySelectorAll('.result-list-item').length);
        if(n===last){if(++stable>=3)break;}else stable=0;
        last=n;
      }
      const rows=await p.evaluate(EXTRACT);
      rows.forEach(r=>{ if(!pool.has(r.id)) pool.set(r.id,{...r,hunt:label,floor}); });
      console.log(`${label.padEnd(17)} ${sort.padEnd(8)} +${String(rows.length).padStart(3)}  pool ${pool.size}`);
    }catch(e){ console.log(`${label.padEnd(17)} ${sort.padEnd(8)} FAILED`); }
    await p.close();
  }
}
await b.close();

const rej=[];
const rows=[...pool.values()].map(r=>{
  const y=+((r.title||'').match(/\b(20\d{2})\b/)||[0,0])[1];
  return {...r,year:y,sourceName:SOURCE[r.source]||r.source};
}).filter(r=>{
  const why = !r.price||!r.miles||!r.year ? 'missing field'
    : /cayenne/i.test(r.title) ? 'Cayenne (excluded)'
    : r.price < r.floor ? `below ${r.hunt} plausibility floor $${r.floor}`
    : r.miles>MAXMILES ? 'over mileage'
    : r.year<MINYEAR ? 'too old' : null;
  if(why){rej.push({...r,why});return false;}
  return true;
});
fs.writeFileSync('/workspaces/three.ws/scratch/scraper/hunt.json',JSON.stringify(rows,null,1));
fs.writeFileSync('/workspaces/three.ws/scratch/scraper/hunt.rejected.json',JSON.stringify(rej,null,1));
const byHunt={}; rows.forEach(r=>byHunt[r.hunt]=(byHunt[r.hunt]||0)+1);
console.log('\n==== KEPT',rows.length,'| REJECTED',rej.length,'====');
console.log(JSON.stringify(byHunt,null,1));
