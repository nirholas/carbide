import { chromium } from 'playwright';
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const b=await chromium.launch({args:['--disable-blink-features=AutomationControlled']});
const ctx=await b.newContext({userAgent:UA,viewport:{width:1440,height:1200},locale:'en-US'});
await ctx.addInitScript(()=>{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})});

let p=await ctx.newPage();
await p.goto('https://www.autotempest.com/results?make=porsche&maxprice=40000&zip=92101&radius=any',{waitUntil:'domcontentloaded',timeout:40000});
await p.waitForTimeout(9000);
console.log('===== AUTOTEMPEST item =====');
console.log(JSON.stringify(await p.evaluate(()=>{
  const items=[...document.querySelectorAll('.result-list-item')];
  const e=items[0];
  return { n:items.length, cls:e&&e.className, text:e&&e.innerText.slice(0,300),
    html:e&&e.outerHTML.slice(0,1500),
    linkSample:[...document.querySelectorAll('.result-list-item a')].slice(0,3).map(a=>a.href) };
}),null,1).slice(0,3000));
await p.close();

p=await ctx.newPage();
await p.goto('https://www.cargurus.com/Cars/l-Used-Porsche-San-Diego-m48_L2362',{waitUntil:'domcontentloaded',timeout:40000});
await p.waitForTimeout(9000);
console.log('\n===== CARGURUS item =====');
console.log(JSON.stringify(await p.evaluate(()=>{
  const cands=['[data-testid="srp-tile"]','[class*=pazJTsBB]','[class*=cargurus-listing]','div[data-cg-ft]'];
  const counts={}; for(const c of cands) counts[c]=document.querySelectorAll(c).length;
  const tiles=[...document.querySelectorAll('a[href*="/Cars/inventorylisting/"], a[href*="#listing="]')];
  const e=document.querySelector('[data-testid="srp-tile"]')||tiles[0]&&tiles[0].closest('div');
  return { counts, tileLinks:tiles.slice(0,3).map(a=>a.href),
    text:e&&e.innerText.slice(0,300), html:e&&e.outerHTML.slice(0,1200) };
}),null,1).slice(0,3000));
await b.close();
