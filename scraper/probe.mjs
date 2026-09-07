import { chromium } from 'playwright';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const TARGETS = [
  ['autotempest',  'https://www.autotempest.com/results?make=porsche&maxprice=40000&zip=92101&radius=any'],
  ['cargurus',     'https://www.cargurus.com/Cars/l-Used-Porsche-San-Diego-m48_L2362'],
  ['autotrader',   'https://www.autotrader.com/cars-for-sale/porsche?searchRadius=0&maxPrice=40000'],
  ['carfax',       'https://www.carfax.com/Used-Porsche_m28'],
  ['cars.com',     'https://www.cars.com/shopping/results/?stock_type=used&makes[]=porsche&maximum_distance=all&zip=92101&list_price_max=40000&sort=mileage'],
  ['autonation',   'https://www.autonation.com/used-cars/porsche'],
  ['carmax',       'https://www.carmax.com/cars/porsche'],
  ['truecar',      'https://www.truecar.com/used-cars-for-sale/listings/porsche/'],
  ['carvana',      'https://www.carvana.com/cars/porsche'],
  ['edmunds',      'https://www.edmunds.com/used-porsche/'],
  ['carsforsale',  'https://www.carsforsale.com/porsche-for-sale'],
  ['porschefinder','https://finder.porsche.com/us/en-US/search'],
  ['echopark',     'https://www.echopark.com/inventory?make=Porsche'],
  ['hemmings',     'https://www.hemmings.com/classifieds/for-sale/porsche'],
];

const b = await chromium.launch({ args:['--disable-blink-features=AutomationControlled'] });
const ctx = await b.newContext({ userAgent: UA, viewport:{width:1440,height:900}, locale:'en-US',
  extraHTTPHeaders:{ 'Accept-Language':'en-US,en;q=0.9' } });
await ctx.addInitScript(() => { Object.defineProperty(navigator,'webdriver',{get:()=>undefined}); });

for (const [name, url] of TARGETS) {
  const p = await ctx.newPage();
  let status = 'ERR', title = '', signal = '';
  try {
    const r = await p.goto(url, { waitUntil:'domcontentloaded', timeout: 35000 });
    status = r ? r.status() : 'no-response';
    await p.waitForTimeout(2500);
    title = (await p.title()).slice(0,55);
    signal = await p.evaluate(() => {
      const t = document.body ? document.body.innerText : '';
      const blocked = /access denied|are you a human|unusual traffic|verify you are|pardon our interruption|blocked|captcha|cf-browser-verification/i.test(t);
      const money = (t.match(/\$\d{2},\d{3}/g)||[]).length;
      const jsonld = document.querySelectorAll('script[type="application/ld+json"]').length;
      return `${blocked?'BLOCKED ':''}price-hits=${money} ldjson=${jsonld} textlen=${t.length}`;
    });
  } catch (e) { signal = e.message.split('\n')[0].slice(0,60); }
  console.log(String(name).padEnd(14), String(status).padEnd(5), signal.padEnd(52), title);
  await p.close();
}
await b.close();
