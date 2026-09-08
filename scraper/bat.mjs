import { chromium } from 'playwright';
import fs from 'fs';
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PATHS=[['Macan','porsche/macan'],['911','porsche/911'],['Panamera','porsche/panamera'],
 ['Taycan','porsche/taycan'],['Cayman','porsche/cayman'],['Boxster','porsche/boxster'],['i8','bmw/i8']];

// anchor on .item-results (the sold-price leaf) and walk UP to the container
// that owns the listing link. Pairing by page-wide regex produced identical
// prices for every car in a line.
// Sold cards differ structurally from live ones: the .listing-card IS the <a>,
// the title lives in an h3, and .item-results is unrendered so its text is only
// reachable via textContent (innerText returns ""). Live cards nest an a[title]
// and have an empty .item-results. All three details cost a wrong result first.
const EXTRACT=()=>[...document.querySelectorAll('.listing-card')].map(card=>{
  const res=card.querySelector('.item-results');
  if(!res) return null;
  const m=(res.textContent||'').match(/Sold for USD \$([\d,]+)\s+on\s+(\d+\/\d+\/\d+)/);
  if(!m) return null;                                    // live, or bid-to-not-sold
  const h3=card.querySelector('h3');
  const title=(h3?h3.textContent:'').trim();
  const href=card.tagName==='A' ? card.getAttribute('href')
           : (card.querySelector('a[href*="/listing/"]')||{}).href;
  if(!title||!href) return null;
  // Card thumbnails are lazy-loaded: src is often a 1px placeholder while the
  // real asset sits in data-src or the srcset. Take the widest srcset candidate
  // when present, since BaT serves several sizes and the default is the smallest.
  const img=card.querySelector('img');
  let image=null;
  if(img){
    const set=img.getAttribute('srcset')||img.getAttribute('data-srcset')||'';
    if(set){
      const best=set.split(',').map(s=>s.trim().split(/\s+/))
        .map(([u,w])=>({u,w:parseInt(w)||0})).sort((a,b)=>b.w-a.w)[0];
      if(best) image=best.u;
    }
    if(!image) image=img.getAttribute('data-src')||img.getAttribute('src')||null;
    if(image&&/^data:/.test(image)) image=null;          // placeholder, not a photo
  }
  return { title, price:+m[1].replace(/,/g,''), date:m[2], url:String(href).split('?')[0], image };
}).filter(Boolean);

const b=await chromium.launch({args:['--disable-blink-features=AutomationControlled']});
const ctx=await b.newContext({userAgent:UA,viewport:{width:1440,height:1400},locale:'en-US'});
await ctx.addInitScript(()=>{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})});
const out=[];
for(const [line,path] of PATHS){
  const p=await ctx.newPage();
  try{
    await p.goto(`https://bringatrailer.com/${path}/`,{waitUntil:'domcontentloaded',timeout:45000});
    await p.waitForTimeout(3500);
    for(let i=0;i<8;i++){
      const btn=p.locator('button:has-text("Show More"), a:has-text("Show More")').first();
      if(await btn.count()){ try{ await btn.click({timeout:3000}); await p.waitForTimeout(2000);}catch(e){break} } else break;
    }
    const rows=await p.evaluate(EXTRACT);
    const uniq=new Map(); rows.forEach(r=>uniq.set(r.url,r));
    const vals=[...uniq.values()];
    const distinct=new Set(vals.map(v=>v.price)).size;
    vals.forEach(r=>out.push({...r,line}));
    console.log(`${line.padEnd(9)} ${String(vals.length).padStart(3)} sold, ${distinct} distinct prices ${distinct<=1&&vals.length>1?' <-- SUSPECT':''}`);
  }catch(e){ console.log(`${line} FAILED`); }
  await p.close();
}
await b.close();
const seen=new Set(); const final=out.filter(r=>seen.has(r.url)?false:(seen.add(r.url),true));
fs.writeFileSync(new URL('bat-sold.json', import.meta.url).pathname,JSON.stringify(final,null,1));
console.log('\nunique sold records:',final.length);
console.log('distinct prices overall:',new Set(final.map(r=>r.price)).size);
