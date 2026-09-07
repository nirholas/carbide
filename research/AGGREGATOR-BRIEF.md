# Car aggregator: field notes from a working prototype

Everything here was **empirically tested on 7 September 2026**, not inferred from documentation.
Reachability claims come from a real headless Chromium session, not a plain HTTP fetch, and the
two differ enormously. Every selector below was read off the live DOM.

Working code referenced at the end.

---

## 1. Reachability matrix (tested, not assumed)

The single most important finding: **plain HTTP fetch and real Chromium get completely different
answers, in both directions.** Do not assume one predicts the other.

| Source | Plain fetch | Real Chromium | Verdict |
|---|---|---|---|
| **AutoTempest** | 403 | **200, full results** | Primary aggregator target |
| **BringATrailer** | blocked | **200, sold archive** | Sold-price backbone |
| **Cars & Bids** | blocked | **200** | Sold + live |
| **CarMax** | 403 | **200, JSON-LD with VIN** | Best structured data |
| **CarGurus** | 403 | **200** | Works |
| **PCARMARKET** | untested | **200** | Porsche-specific |
| **duPont Registry** | untested | **200** | Exotics |
| **Cars.com** | **200** | **403** | Inverted. Fetch works, browser blocked |
| Carvana | 403 | 403 | Only via AutoTempest |
| TrueCar | 403 | 403 | Only via AutoTempest |
| Autotrader | 403 | 403 | Not cracked |
| Carfax | 403 | 403 | Not cracked |
| AutoNation | 403 | 403 | Not cracked |
| Edmunds | 403 | 403 (explicit block page) | Not cracked |
| Hemmings | 403 | 403 | Not cracked |
| CarsForSale | 403 | 403 | Not cracked despite "weak defenses" reputation |
| EchoPark | ERR_HTTP2_PROTOCOL_ERROR | same | Protocol-level failure |
| Porsche Finder | 429 | 429 | Rate-limited, not blocked. Needs backoff |

**Cars.com being backwards is the headline.** It serves a plain request happily and shows headless
Chromium a Cloudflare interstitial. Any single-transport design loses that source. Build the
fetcher with two transports and fall back between them.

---

## 2. AutoTempest is a reachability multiplier, and it tells you its sources

This is why it beats scraping sites individually. Each result tile carries:

```html
<section class="search-result" data-listing-id="pa-6a7146..." data-backend-sitecode="pa">
```

`data-backend-sitecode` names the origin site. Observed codes:

| Code | Source | Directly reachable? |
|---|---|---|
| `cv` | Carvana | No (Cloudflare) |
| `cm` | CarMax | Yes |
| `cgu` | CarGurus | Yes |
| `tc` | TrueCar | No (Akamai) |
| `eb` | eBay Motors | Use the API instead |
| `cab` | Cars & Bids | Yes |
| `pa` | PrivateAuto | Yes |

**One scrape reached Carvana and TrueCar, both of which refuse direct access.** That is the whole
argument for meta-search as an ingestion layer rather than a competitor to route around.

### Working extraction

```js
[...document.querySelectorAll('.result-list-item')].map(li => {
  const sec = li.querySelector('section[data-backend-sitecode]');
  const txt = el => el ? el.innerText.trim() : '';
  const num = s => { const m=(s||'').replace(/,/g,'').match(/\$?\s*(\d{3,})/); return m?+m[1]:null; };
  return {
    title  : txt(li.querySelector('.title-wrap, h2')).split('\n')[0],
    price  : num(txt(li.querySelector('.price-wrap'))),   // NOT .price - that does not exist
    miles  : num(txt(li.querySelector('.mileage'))),
    loc    : txt(li.querySelector('.location .city, .location')).split('(')[0].trim(),
    source : sec?.getAttribute('data-backend-sitecode'),
    id     : sec?.getAttribute('data-listing-id'),
    url    : li.querySelector('a.listing-link[href^="http"]')?.href,
    auction: !!li.querySelector('.description-badges__auction-badge'),
  };
}).filter(Boolean);
```

Results stream in per source asynchronously. Poll `.result-list-item` count until it is stable for
three consecutive checks rather than using a fixed wait; a fixed wait truncates the slower sources.

Query params that work: `make`, `model`, `maxprice`, `minyear`, `maxmiles`, `zip`, `radius=any`, `sort=mileage|price`.

Per-model queries return far more than one broad query: each model gets its own result quota. A
broad Porsche query returned 159; per-model queries returned ~250 unique across the same filters.

---

## 3. The traps that cost real time

Each of these produced **plausible-looking wrong data**, which is worse than an error.

### 3a. `innerText` returns empty for unrendered nodes

BaT sold prices live in `.item-results`. The node is in the DOM but not rendered, so:

```js
res.innerText   // ""        <- silently empty
res.textContent // "Sold for USD $19,450  on 09/04/2026"
```

**Use `textContent` for anything you are not certain is visible.** This one cost four failed attempts.

### 3b. Sold and live cards are structurally different

On BaT the same `.listing-card` class covers both, but:

| | Live auction | Sold |
|---|---|---|
| Card element | `div`, nested `a[title]` | **the `<a>` itself**, `href` on the card |
| Title source | `a[title]` attribute | **`h3` textContent** |
| `.item-results` | present but empty | holds the sold price |

A single extractor written against live cards silently returns zero sold records.

### 3c. Never pair by page-wide regex

First attempt matched `Sold for USD \$([\d,]+)` across `document.body.innerText` and paired results
to listing links by proximity. Every car in a model line got **the same price and date**. A 2019 i8
Roadster was recorded as selling for $2,700.

Anchor on the card element and read price and title from within that card only. If you must climb
the DOM, climb to the ancestor owning **exactly one** listing link, not the first ancestor that has any.

### 3d. Loose price regex catches the wrong number

Scanning tile text for the first `$n,nnn` produced a **"2026 Porsche 911 Targa 4 GTS Cabriolet,
1,000 mi, $25,476."** Opening the listing showed it was dead and the site's own comparables were
$185,069 and $243,475. The figure was a monthly payment or a stale field.

Two defences, use both:
- Read price from a specific element (`.price-wrap`), never a text scan.
- **Model-aware plausibility floors.** A flat $8,000 floor did not catch $25,476. Per-model floors did.

### 3e. JSON-LD includes cars that are not the results

CarMax embeds `@type: Car` blocks for "similar vehicles" alongside real results. A 2018
**Mercedes-Benz SLC300** entered a Porsche dataset. Filter on `brand.name`.

### 3f. Auction listings are bids, not asks

Cars & Bids and BaT rows carry a *current bid*. Mixing those into a price median corrupts it. Flag
and segregate.

### 3g. Non-vehicle lots

BaT sells memorabilia. A **"BMW i8 Full-Scale Display Model"** sold for $2,700 and parsed as an i8.
Filter titles against `display model|scale model|poster|sign|memorabilia|wheels|engine|parts|literature`.

---

## 4. CarMax: the best structured data available for free

CarMax ships clean JSON-LD, one `@type: Car` block per vehicle, **including VIN**:

```json
{"@type":"Car","name":"2020 Porsche Macan S",
 "vehicleIdentificationNumber":"WP1AB2A56LLB33982",
 "offers":{"price":37998},
 "mileageFromOdometer":{"value":55939},
 "model":"Macan","vehicleConfiguration":"S","vehicleModelDate":2020,
 "color":"Black","bodyType":"Sport Utility"}
```

```js
[...document.querySelectorAll('script[type="application/ld+json"]')]
  .map(s => { try { return JSON.parse(s.textContent) } catch { return null } })
  .filter(x => x?.['@type']==='Car' && x.brand?.name==='Porsche')
```

Caveat: CarMax has **no stable per-car URL** in the listing markup. Link via
`https://www.carmax.com/cars?search=<VIN>`.

---

## 5. The free API layer, and it solves trim normalization

Trim normalization is correctly identified as the hard problem. It is partly solved for free.

### NHTSA vPIC, no key, no rate limit observed

```
GET https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/{VIN}?format=json
```

Returns for `WP1AB2A56LLB33982`:

```
ModelYear 2020 | Make PORSCHE | Model Macan | Trim S | Series "Type 95B"
EngineCylinders 6 | DisplacementL 3.0 | BodyClass SUV | PlantCountry GERMANY
```

**`Series` returns the factory platform code.** "Type 95B" distinguishes Macan generations; the
same field separates 991 from 992, 981 from 982. That is generation-accurate normalization, free,
per VIN. It is weaker on option packages, but it gets you the axis that actually moves price.

### NHTSA recalls, no key

```
GET https://api.nhtsa.gov/recalls/recallsByVehicle?make=porsche&model=taycan&modelYear=2021
```

Returned 21 campaigns with `NHTSACampaignNumber`, `Component`, `Summary`, and a **`parkIt` /
`parkOutSide` boolean** for fire-risk campaigns. Surfacing "this model-year has an open do-not-park
recall" next to a listing is a differentiator no incumbent shows.

### EPA fuel economy

`https://www.fueleconomy.gov/ws/rest/vehicle/menu/options?year=&make=&model=` works but returned
empty for Porsche Taycan. Coverage is patchy on EVs and exotics. Verify per segment before relying on it.

---

## 6. Architecture notes worth the money

**Two transports, not one.** Cars.com needs plain fetch; everything else needs a browser. A single
transport silently loses sources.

**Dedupe on VIN first.** Only CarMax gave VINs in listing markup. For the rest I fell back to
`(year, mileage)` which is decent because exact mileage is near-unique, but it collides on
delivery-mileage cars where dozens share `10 mi` or `1,000 mi`. Composite key:
`VIN` → else `(year, mileage, round(price/500))` → else fuzzy.

**Rounded mileage is a real signal.** Values like exactly `1,000` or `3,000` are the site rounding
"1K mi" for display, not the odometer. Flag rather than trust.

**Segregate asks from bids from sold.** Three different quantities. A median across them is meaningless.

**Sold data is the differentiator.** Every incumbent shows asks. In this dataset, recent BaT sales
of 2016-2017 Macans landed $13,800-$19,450 while dealers asked $17,200-$27,000 for comparable
years. Even allowing that auction cars skew enthusiast-spec and the sample was small, that spread
is the most useful number a buyer can see, and nobody surfaces it. Snapshot daily to derive
days-on-market and price drops, which cannot be backfilled.

**Log rejects with a reason.** Silent filtering hides parser rot. Writing rejects to a separate file
with a `why` field is how both the Mercedes and the $25,476 "911" were caught.

**Validate before you trust.** After every extractor change, assert that distinct price count is
close to record count. `19 records, 1 distinct price` is the signature of a mispairing bug and is
otherwise invisible.

---

## 7. Build order

1. **eBay Browse API** (`developer.ebay.com`). Free, documented, real-time, covers Motors. Needs an
   app key. Not done here for lack of credentials. Highest value per hour of work.
2. **CarMax + Cars.com + AutoTempest.** Working code below. Covers seven sources including three
   otherwise unreachable.
3. **BaT + Cars & Bids** for sold comps. Low volume, high signal, weak defenses.
4. **NHTSA vPIC + recalls** enrichment on every VIN. Free, and produces the generation and safety
   facets nobody else shows.
5. **Marketcheck or Auto.dev** if coverage matters more than scraper maintenance. 40M+ listings,
   free tier, replaces the dealer long tail.
6. **Porsche Finder and OEM CPO indexes.** JSON-backed and mostly shared backends, so one scraper
   ports across brands. Needs rate limiting; it returned 429 immediately under naive load.

Skip Autotrader and Carfax unless buying data. Both refuse a fully-fingerprinted real browser.

---

## 8. Code in this repo

| File | What it does |
|---|---|
| `scratch/scraper/run.mjs` | Multi-source pull: AutoTempest per model+sort, CarMax JSON-LD. Filters, dedupes, writes rejects with reasons. |
| `scratch/scraper/bat.mjs` | BaT sold-price scraper. Correct card-first extraction with the `textContent` fix. |
| `scratch/scraper/probe.mjs` | Reachability prober. Re-run to detect when a site's defenses change. |
| `scratch/scraper/final.json` | 232 deduped sub-$40k listings, 7 sources. |
| `scratch/scraper/bat-sold.json` | 166 verified sold records. |

`probe.mjs` is the one to keep in CI. Bot defenses change without notice and you want to know from
a green-to-red transition, not from a silently empty result set.

---

## 9. Honest limits

- Autotrader, Carfax, AutoNation, Edmunds, Hemmings, CarsForSale: not cracked.
- Facebook Marketplace and Craigslist: not attempted. Both carry most US private-party volume and
  both punish automation. Budget residential proxies or accept the gap.
- Sold-price sample is small per model (n=2 for 911). Directional, not authoritative.
- No listing here was verified clean-title or owner-count. Neither is exposed as a filter by any
  source tested; both need a paid history report per VIN.
