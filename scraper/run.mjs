import { chromium } from 'playwright';
import fs from 'fs';

const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAXPRICE=40000, MINYEAR=2016, MAXMILES=70000, MINPLAUSIBLE=8000;
const OUT='/workspaces/three.ws/scratch/scraper/all.json';
const SOURCE={pa:'PrivateAuto',cab:'Cars & Bids',cv:'Carvana',cm:'CarMax',eb:'eBay Motors',
  cgu:'CarGurus',tc:'TrueCar',ct:'Cars.com',at:'Autotrader',hm:'Hemmings',cx:'Carfax'};
const MODELS=['911','macan','panamera','taycan','cayman','boxster'];   // Cayenne excluded by brief
const SORTS=['mileage','price'];

// exact selectors, no loose innerText regex: that produced a $25,476 "911 Targa 4 GTS"
const EXTRACT=()=>[...document.querySelectorAll('.result-list-item')].map(li=>{
  const sec=li.querySelector('section[data-backend-sitecode]');
  const txt=el=>el?el.innerText.trim():'';
  const num=s=>{const m=(s||'').replace(/,/g,'').match(/\$?\s*(\d{3,})/);return m?+m[1]:null;};
  const isAuction=!!li.querySelector('.description-badges__auction-badge');
  const a=li.querySelector('a.listing-link[href^="http"]');
  return {
    title : txt(li.querySelector('.title-wrap, h2')).split('\n')[0],
    price : num(txt(li.querySelector('.price-wrap'))),
    miles : num(txt(li.querySelector('.mileage'))),
    loc   : txt(li.querySelector('.location .city, .location')).split('(')[0].trim(),
    source: sec?sec.getAttribute('data-backend-sitecode'):null,
    id    : sec?sec.getAttribute('data-listing-id'):null,
    url   : a?a.href:null,
    auction: isAuction,
  };
});

const b=await chromium.launch({args:['--disable-blink-features=AutomationControlled']});
const ctx=await b.newContext({userAgent:UA,viewport:{width:1440,height:1200},locale:'en-US',
  extraHTTPHeaders:{'Accept-Language':'en-US,en;q=0.9'}});
await ctx.addInitScript(()=>{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})});
const seen=new Map();
const add=r=>{const k=r.id||('vin:'+r.vin);if(k&&!seen.has(k))seen.set(k,r);};

for (const model of MODELS){
  for (const sort of SORTS){
    const u=`https://www.autotempest.com/results?make=porsche&model=${model}&maxprice=${MAXPRICE}`
          + `&minyear=${MINYEAR}&maxmiles=${MAXMILES}&zip=92101&radius=any&sort=${sort}`;
    const p=await ctx.newPage();
    try{
      await p.goto(u,{waitUntil:'domcontentloaded',timeout:60000});
      let last=-1,stable=0;
      for(let i=0;i<14;i++){
        await p.waitForTimeout(2200);
        await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
        const n=await p.evaluate(()=>document.querySelectorAll('.result-list-item').length);
        if(n===last){if(++stable>=3)break;}else stable=0;
        last=n;
      }
      const rows=await p.evaluate(EXTRACT);
      rows.forEach(add);
      console.log(`autotempest ${model.padEnd(10)} ${sort.padEnd(8)} +${String(rows.length).padStart(3)} raw  (pool ${seen.size})`);
    }catch(e){console.log(`autotempest ${model} ${sort} FAILED`);}
    await p.close();
  }
}

for (const path of ['porsche/911','porsche/macan','porsche/panamera','porsche/taycan','porsche/cayman','porsche/boxster','porsche/718-cayman']){
  const p=await ctx.newPage();
  try{
    await p.goto(`https://www.carmax.com/cars/${path}`,{waitUntil:'domcontentloaded',timeout:45000});
    await p.waitForTimeout(5000);
    await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    await p.waitForTimeout(3000);
    const cars=await p.evaluate(()=>[...document.querySelectorAll('script[type="application/ld+json"]')]
      .map(s=>{try{return JSON.parse(s.textContent)}catch(e){return null}})
      .filter(x=>x&&x['@type']==='Car'&&x.brand&&x.brand.name==='Porsche')   // was pulling in a Mercedes
      .map(x=>({title:x.name,price:x.offers&&+x.offers.price,
        miles:x.mileageFromOdometer&&+x.mileageFromOdometer.value,
        vin:x.vehicleIdentificationNumber,model:x.model,trim:x.vehicleConfiguration,
        year:+x.vehicleModelDate,source:'cm',loc:'nationwide (CarMax ships)',url:null,auction:false})));
    cars.forEach(add);
    console.log(`carmax      ${path.padEnd(19)} +${String(cars.length).padStart(3)} raw  (pool ${seen.size})`);
  }catch(e){console.log(`carmax ${path} FAILED`);}
  await p.close();
}
await b.close();

const rejected=[];
const rows=[...seen.values()].map(r=>{
  const y=r.year||+((r.title||'').match(/\b(20\d{2})\b/)||[0,0])[1];
  return {...r,year:y,sourceName:SOURCE[r.source]||r.source};
}).filter(r=>{
  const t=((r.title||'')+' '+(r.model||''));
  const why =
    !r.price||!r.miles||!r.year ? 'missing field'
  : !/porsche/i.test(t) && !/911|macan|panamera|taycan|cayman|boxster/i.test(t) ? 'not a Porsche'
  : /cayenne/i.test(t) ? 'Cayenne (excluded)'
  : r.price<MINPLAUSIBLE ? 'price below plausible floor (bad parse)'
  : r.price>MAXPRICE ? 'over budget'
  : r.miles>MAXMILES ? 'over mileage'
  : r.year<MINYEAR ? 'too old' : null;
  if(why){rejected.push({...r,why});return false;}
  return true;
});
rows.sort((a,b)=>a.miles-b.miles);
fs.writeFileSync(OUT,JSON.stringify(rows,null,1));
fs.writeFileSync(OUT.replace('.json','.rejected.json'),JSON.stringify(rejected,null,1));
const bySrc={};rows.forEach(r=>bySrc[r.sourceName]=(bySrc[r.sourceName]||0)+1);
const byWhy={};rejected.forEach(r=>byWhy[r.why]=(byWhy[r.why]||0)+1);
console.log('\n==== FINAL ====');
console.log('kept    ', rows.length);
console.log('rejected', rejected.length, JSON.stringify(byWhy));
console.log('by source:', JSON.stringify(bySrc));
console.log('auctions (bid, not asking price):', rows.filter(r=>r.auction).length);
