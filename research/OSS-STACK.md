# Open-source stack for the aggregator: what to take, and from where

Researched 7 September 2026 against the live GitHub API, npm registry and PyPI. Star counts,
licenses and last-push dates are measured. The headline finding at the top was tested on this
machine, not read in a README.

---

## 0. The breakthrough: TLS impersonation beats sites a real browser cannot

I previously reported Autotrader and Carfax as uncrackable. That was wrong, and the reason is
instructive: **their defense keys on the TLS/JA3 handshake fingerprint, not on JavaScript
execution.** A full headless Chromium with a perfect UA still gets 403 because its TLS stack is
Go/Node, not Chrome. `curl_cffi` replays a real browser's TLS fingerprint and walks straight in.

Tested just now, same machine, same IP:

| Site | Plain fetch | Real Chromium | **curl_cffi** | Working profile |
|---|---|---|---|---|
| **Autotrader** | 403 | 403 | **200, 126 prices** | `chrome124` |
| **Carfax** | 403 | 403 | **200, 133 prices** | `chrome124` |
| **Hemmings** | 403 | 403 | **200, 52 prices** | `safari17_0` |
| **AutoNation** | 403 | 403 | **200, 36 prices** | `safari17_0` |
| **Cars.com** | 200 | 403 | **200, 85 prices** | `safari17_0` |
| CarsForSale | 403 | 403 | 403 / 404 | none yet |
| TrueCar | 403 | 403 | 403 | none yet |
| Carvana | 403 | 403 | 403 | none yet |

Two things matter here beyond the raw win:

1. **The impersonation profile is per-site.** `chrome124` opens Autotrader and Carfax; those same
   two sites' neighbours want `safari17_0`. A single hardcoded profile loses half the sources.
   Iterate profiles per host and cache which one worked.
2. **Autotrader and Carfax are the two largest sources in the US market.** Cracking them changes
   the coverage story completely.

Caveat, stated plainly: access is solved, **extraction is not**. Autotrader serves the page but has
no `ld+json` and no `__PRELOADED_STATE__`; the listing data sits in a different embedded structure
that still needs selector work. Also beware that many round numbers on those pages
(`$10,000`, `$20,000`, `$30,000`) are **filter dropdown values, not listings**, exactly the class
of parse error that produced a fake "$25,476 Porsche 911" earlier in this project.

---

## 1. The stack, by layer

### Layer 1: Fetch and anti-bot

| Package | Stars | License | Take this because |
|---|---|---|---|
| **`curl_cffi`** (PyPI 0.16.3) | n/a | MIT | **The single highest-value dependency.** TLS fingerprint impersonation. Cracked Autotrader, Carfax, Hemmings, AutoNation above. |
| `lwthiker/curl-impersonate` | 6,960 | MIT | The C library `curl_cffi` wraps. Use directly for non-Python. Last push 2024-07. |
| **`D4Vinci/Scrapling`** | **79,092** | BSD-3 | Adaptive scraping framework with impersonation and **self-healing selectors** that survive DOM changes. Directly addresses the brittleness that cost this project four failed extractors. |
| `CloakHQ/CloakBrowser` | 31,263 | MIT | Drop-in stealth Chromium for the cases where JS execution genuinely is required. |
| `jo-inc/camofox-browser` | 9,576 | MIT | Stealth headless browser, explicitly targets Cloudflare. |
| `omkarcloud/botasaurus` | 5,704 | MIT | All-in-one scraping framework, good defaults for rotation and caching. |
| `ultrafunkamsterdam/undetected-chromedriver` | 12,825 | **GPL-3.0** | Widely used, but **GPL: check this against your licensing intent before adopting.** |
| `techinz/browsers-benchmark` | 383 | MIT | Benchmarks bypass rates across engines. Read before choosing; saves guessing. |

**Recommended combination:** `curl_cffi` first for everything (cheapest, fastest, cracks the most),
fall back to a stealth browser only for sites that genuinely need JS. That ordering is the opposite
of what most projects do and it is why this project initially concluded Autotrader was impossible.

### Layer 2: Crawl orchestration

| Package | Stars | License | Notes |
|---|---|---|---|
| `unclecode/crawl4ai` | **81,905** | Apache-2.0 | LLM-friendly crawler, very active. |
| `scrapy/scrapy` | 64,235 | BSD-3 | The mature default: scheduling, retries, pipelines, throttling. Boring and correct. |
| **`apify/crawlee`** | 25,683 | Apache-2.0 | If the stack is TypeScript. Built-in proxy rotation, session pools, adaptive concurrency. |
| `gocolly/colly` | 25,502 | Apache-2.0 | Go, extremely fast, good if throughput dominates. |
| `projectdiscovery/katana` | 17,403 | MIT | Discovery and spidering rather than extraction. |

Do not hand-roll the scheduler. Everything in this project so far has been hand-rolled loops with
`waitForTimeout`, which does not survive contact with 50 sources.

### Layer 3: Deduplication and entity resolution

**The hard problem, and the one an aggregator lives or dies on.** The same car appears on
Autotrader, Cars.com, CarGurus and the dealer's own site simultaneously.

| Package | Stars | License | Notes |
|---|---|---|---|
| **`moj-analytical-services/splink`** | 2,388 | MIT | **Best fit.** Probabilistic linkage at scale, runs on DuckDB/Spark, actively maintained (pushed 2026-09), designed for exactly this shape of problem. |
| `dedupeio/dedupe` | 4,510 | MIT | More stars, active learning workflow, but last push 2025-07. |
| `recordlinkage` (PyPI 0.16) | n/a | BSD-3 | Lighter-weight toolkit, good for a first pass. |

Match on VIN first where available, then fall back to probabilistic linkage on
`(year, model, trim, mileage, price, dealer geo)`.

### Layer 4: Vehicle data and VIN

The car-specific field is thin, which is the opportunity.

| Package | Stars | License | Notes |
|---|---|---|---|
| **`cardog-ai/corgi`** (npm `@cardog/corgi`) | 330 | ISC | Best VIN library found. **Offline** decode + validation, TypeScript, runs in browser/Workers. v2.0.4, Apr 2026. |
| `ShaggyTech/nhtsa-api-wrapper` (npm `@shaggytools/nhtsa-api-wrapper`) | 41 | MIT | Typed NHTSA vPIC client. |
| `vininfo` (PyPI 1.11.0) | n/a | n/a | Python VIN parsing, manufacturer/region detail. |
| `vin-iso3779-validator` (npm) | n/a | n/a | Tiny check-digit validator, Mar 2026. |
| `@pipeworx/mcp-nhtsa` (npm) | n/a | n/a | NHTSA vPIC as an MCP server. Interesting if the site is agent-facing. |
| `opencars/vin-decoder-api` | 44 | MIT | Go service. |

**The whole VIN niche tops out at 330 stars.** Combine offline decode (corgi) with the free NHTSA
vPIC call and you exceed every existing option, because vPIC returns `Series` (the factory platform
code: Type 95B, 991, 992) which is the field that actually separates generations and moves price.

### Layer 5: Adjacent car OSS, link don't rebuild

| Package | Stars | License | What it gives |
|---|---|---|---|
| `traccar/traccar` | 7,701 | Apache-2.0 | GPS/telematics, 200+ device protocols. The category king. |
| `commaai/opendbc` | 3,394 | MIT | VIN to CAN signal mapping. "A Python API for your car." |
| `timdorr/tesla-api` | 2,065 | MIT | Tesla JSON API documentation and client. |
| `tillsteinbach/CarConnectivity` | 213 | MIT | Multi-brand telemetry retrieval, active. |
| `Hyundai-Kia-Connect/kia_uvo` | 930 | MIT | Hyundai/Kia connected services. |

---

## 2. What does not exist, measured

I searched each niche and recorded the ceiling. These are build targets, not adoption targets.

| Niche | Repos | Best-in-class |
|---|---|---|
| Car listings scrapers | 264 | **6★** |
| `car-listings` in name | 262 | 11★ (2014) |
| `vehicle-listings` in name | 15 | **0★** |
| VIN decoders | 89 | 44★ (330★ for corgi under a different term) |
| Used-car price prediction | **10,904** | **59★** |
| Car datasets | 260 | 13★ |

The listings space is empty. The most-starred car-listings scraper on GitHub has six stars, while
the adjacent CAN-bus and vehicle-security niches have 3,454 and 4,548-star leaders. Nothing here
needs to be beaten; it needs to be built.

The 10,904 price-prediction repos with a 59-star ceiling are thousands of copies of the same
notebook against the same stale Kaggle CSV. A model trained on live multi-source listings with real
sold comps would have no peer.

---

## 3. Recommended assembly

```
curl_cffi (per-host impersonation profile, cached)
   └─ fallback: CloakBrowser / camofox for JS-required sites
Scrapling or Scrapy for orchestration, retries, throttling
   └─ Scrapling's self-healing selectors specifically
splink for cross-source dedupe (VIN first, probabilistic second)
corgi + NHTSA vPIC for VIN decode and generation normalization
NHTSA recalls API for the safety facet nobody else surfaces
DuckDB for the listing store, daily snapshots for price history
```

Everything above is MIT/BSD/Apache except `undetected-chromedriver` (GPL-3.0), which should be
avoided unless the project intends to be GPL.

---

## 4. Carry the hard-won lessons into the new codebase

These cost this project real time and each produced *plausible-looking wrong data*, which is far
worse than an error:

- **`innerText` returns `""` on unrendered nodes.** Use `textContent`. Cost four failed extractors.
- **Sold and live cards are structurally different** on auction sites; one extractor silently
  returns zero.
- **Never pair by page-wide regex.** It gave every car in a model line the same price.
- **Read prices from a specific element, never a text scan.** A loose scan produced a "2026 911
  Targa 4 GTS for $25,476" against real comparables of $185,069.
- **Model-aware plausibility floors,** not a flat floor. A flat $8k floor missed the $25,476 case.
- **Filter JSON-LD to the target brand.** CarMax's "similar vehicles" put a Mercedes in a Porsche
  dataset.
- **Segregate asks, bids and sold prices.** Auction rows are live bids.
- **Filter non-vehicle lots.** A "BMW i8 Full-Scale Display Model" sold for $2,700 and parsed as a car.
- **A price far below the model's cluster is a salvage signal, not a bargain.** Verified on three
  exotics: two salvage titles, one advertised "Clean Title" while the seller disclosed
  "Airbags Deployed, Key Missing."
- **Assert distinct-price count is near record count after every extractor change.** `19 records,
  1 distinct price` is the signature of a mispairing bug and is otherwise invisible.

---

## 5. Legal and operational defaults

Several of these sites' terms prohibit automated access, and TLS impersonation is a sharper tool
than a normal scraper. Non-negotiable defaults:

- Respect `robots.txt` and publish that you do.
- Rate limit hard and identify the project honestly in a contact header.
- Prefer documented APIs wherever one exists: **eBay Browse API** (free, real-time, covers Motors)
  is still the highest-value unclaimed integration and needs only a developer key.
- Free government sources (NHTSA vPIC, NHTSA recalls, EPA) have no terms problem at all and should
  carry as much of the enrichment as possible.
- Cache aggressively so a refresh is one request per listing per day, not per page view.

---

## 6. Broad-term sweep: what the whole automotive space actually looks like

Searched the plain terms rather than niche ones, to catch anything the specific queries missed.
Sorted by stars, measured 7 Sep 2026.

### Where the stars actually are

| Repo | Stars | What it is |
|---|---|---|
| commaai/openpilot | **63,597** | Driver assistance OS. The biggest automotive repo on GitHub. |
| microsoft/AirSim | 18,458 | Autonomous vehicle simulator |
| carla-simulator/carla | 14,369 | Autonomous driving simulator |
| traccar/traccar | 7,701 | GPS / telematics platform |
| udacity/self-driving-car | 6,313 | Course project (stale 2021) |
| jaredthecoder/awesome-vehicle-security | 4,548 | Curated list |
| Ly0n/awesome-robotic-tooling | 3,891 | Curated list |
| iDoka/awesome-canbus | 3,454 | Curated list |
| autorope/donkeycar | 3,501 | RC self-driving platform |
| commaai/opendbc | 3,395 | VIN to CAN signal mapping |
| linux-can/can-utils | 2,911 | SocketCAN tooling |
| **hargata/lubelog** | **2,812** | **Vehicle maintenance and fuel tracking, web app, MIT, active** |
| barracuda-fsh/pyobd | 1,251 | OBD-II diagnostics (GPL-2.0) |
| okcar-os/android | 1,080 | In-car entertainment OS |
| osclass/Osclass | 654 | Generic classifieds platform (PHP, stale 2022) |

**The entire automotive OSS world is four things:** autonomous driving and simulation, CAN bus and
vehicle security, telematics, and diagnostics. Consumer car *buying* is absent from all of it.

### The proof, from the plain searches

- **`used cars`**: 59,974 repos. The top result is **`matomo-org/device-detector`**, a user-agent
  parsing library. Nothing about used-car listings appears anywhere in the top ten.
- **`dealership`**: 17,014 repos, top result **253★** and it is a *BeamNG.drive game mod*. The
  highest real dealership software is 86★, a sample API from 2024.
- **`classifieds`**: 10,480 repos, and the top eight are about *classification* (ML), not
  classified ads. The only genuine classifieds platform is `osclass/Osclass` at 654★, PHP,
  unmaintained since 2022.
- **`car price`**: 59,773 repos, top is `nicolas-gervais/predicting-car-price` at **415★**, and it
  is a picture-and-spec scraper rather than a pricing service.

### One repo worth studying rather than competing with

`hargata/lubelog` (2,812★, MIT, actively pushed) is the closest thing to a successful
consumer-facing car web app in open source. It solves *ownership* (maintenance, fuel, reminders),
not *acquisition*. It is proof the consumer-car audience will star a well-made practical web app,
and it is a natural integration partner rather than a competitor: a buyer who finds a car in your
aggregator becomes an owner who logs it in LubeLogger.

### Conclusion for the build

Every plain-term search lands in the same place: **the acquisition side of car ownership has no
open-source presence at all.** Not a weak leader to displace, an empty category. The nearest
adjacent successes are a curated list at 4,548 stars and a maintenance tracker at 2,812, which
brackets what a good aggregator plus its data catalog could reach.
