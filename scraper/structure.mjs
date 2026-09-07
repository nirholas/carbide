import { chromium } from 'playwright';
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const b=await chromium.launch({args:['--disable-blink-features=AutomationControlled']});
const ctx=await b.newContext({userAgent:UA,viewport:{width:1440,height:1200},locale:'en-US'});
await ctx.addInitScript(()=>{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})});

async function look(name,url,fn){
  const p=await ctx.newPage();
  try{
    await p.goto(url,{waitUntil:'domcontentloaded',timeout:40000});
    await p.waitForTimeout(6000);
    console.log('\n===== '+name+' =====');
    console.log(JSON.stringify(await p.evaluate(fn),null,1).slice(0,2600));
  }catch(e){ console.log('\n===== '+name+' ===== ERR '+e.message.split('\n')[0].slice(0,80)); }
  await p.close();
}

await look('autotempest','https://www.autotempest.com/results?make=porsche&maxprice=40000&zip=92101&radius=any',()=>{
  const sel=['.result','.result-list-item','[class*=resultItem]','[class*=listing]','article'];
  const out={};
  for(const s of sel) out[s]=document.querySelectorAll(s).length;
  const first=document.querySelector('.result')||document.querySelector('[class*=resultItem]');
  return {counts:out, sampleClass:first&&first.className, sampleText:first&&first.innerText.slice(0,260),
          sampleHTML:first&&first.outerHTML.slice(0,900)};
});

await look('cargurus','https://www.cargurus.com/Cars/l-Used-Porsche-San-Diego-m48_L2362',()=>{
  const ld=[...document.querySelectorAll('script[type="application/ld+json"]')].map(s=>s.textContent.slice(0,700));
  return {ldCount:ld.length, ld0:ld[0],
    cards:document.querySelectorAll('[data-cg-ft="car-blade"]').length,
    anyCard:document.querySelectorAll('[class*=cargurus-listing], [data-testid*=listing]').length};
});

await look('carmax','https://www.carmax.com/cars/porsche',()=>{
  const ld=[...document.querySelectorAll('script[type="application/ld+json"]')].map(s=>{try{return JSON.parse(s.textContent)}catch(e){return null}}).filter(Boolean);
  const car=ld.find(x=>x['@type']==='Car'||x['@type']==='Vehicle'||(Array.isArray(x)&&x[0]&&x[0]['@type']));
  return {ldCount:ld.length, types:ld.map(x=>x['@type']).slice(0,8), sample:JSON.stringify(car).slice(0,900)};
});
await b.close();
