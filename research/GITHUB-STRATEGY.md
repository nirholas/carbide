# Becoming the #1 automotive repo on GitHub

Researched 7 September 2026 against the live GitHub API. Every star count and total below is
measured, not estimated.

---

## 1. What actually wins in automotive GitHub

I pulled the top repos by stars across every relevant topic. The pattern is unambiguous.

| Repo | Stars | Type | Created | Still maintained |
|---|---|---|---|---|
| traccar/traccar | 7,701 | GPS/telematics platform | n/a | yes |
| jaredthecoder/awesome-vehicle-security | **4,548** | **curated list** | 2016-07 | 2026-05 |
| Ly0n/awesome-robotic-tooling | 3,891 | **curated list** | n/a | 2023-11 (stale) |
| iDoka/awesome-canbus | **3,454** | **curated list** | 2020-11 | 2026-08 |
| commaai/opendbc | 3,394 | CAN signal database | n/a | yes |
| linux-can/can-utils | 2,911 | tooling | n/a | yes |
| microsoft/AutonomousDrivingCookbook | 2,436 | tutorial | n/a | 2025-08 (stale) |
| timdorr/tesla-api | 2,065 | reverse-engineered API docs | n/a | 2026-03 |
| Marcin214/awesome-automotive | **1,136** | **curated list** | 2020-03 | **2025-01 (stale)** |
| iDoka/awesome-automotive-can-id | 981 | **curated list** | n/a | 2026-08 |

**Five of the top ten are curated lists containing no code.** awesome-canbus went from creation in
November 2020 to 3,454 stars and 419 forks. That is the fastest, cheapest path to the top of this
vertical, and it is a path you are already 80% down: the source inventory you assembled is the raw
material for exactly this kind of list.

---

## 2. The gaps, measured

This is where the opportunity is genuinely large. I searched each niche and recorded the ceiling.

| Niche | Repos | Best-in-class | Verdict |
|---|---|---|---|
| **`awesome-automotive-data` (exact name)** | **0** | n/a | **Name is unclaimed** |
| Car listings scrapers | 264 | **6★** (mobile-de-crawler) | Effectively empty |
| `car-listings` in name | 262 | **11★** (from 2014) | Empty |
| `vehicle-listings` in name | 15 | **0★** | Empty |
| VIN decoders | 89 | **44★** | No canonical implementation |
| Used-car price prediction | **10,904** | **59★** | Vast noise, no canonical model |
| Car datasets | 260 | 13★ | Empty |
| Telematics | 30 | 7,701★ (traccar) | Occupied, do not compete |
| CAN bus / vehicle security | 2,508 | 3,454★ / 4,548★ | Occupied, do not compete |

Two findings deserve emphasis.

**The listings and marketplace niche is a vacuum.** The single most-starred car-listings scraper on
GitHub has **six stars**. Searching "autotrader OR cargurus" returns a *stock trading bot* named
AutoTrader (1,270★) as the top result, because no car-listings repo has enough stars to outrank a
naming collision. Meanwhile the adjacent niche one step over has a 4,548-star leader. You are
building in an empty room next to a crowded one.

**10,904 used-car-price-prediction repos and the best has 59 stars.** That is thousands of people
independently writing the same Jupyter notebook against the same stale Kaggle CSV. There is no
canonical, maintained, real-data implementation. Whoever ships one trained on live multi-source
listings owns that entire search term.

---

## 3. The play: three repos, in this order

### Repo 1: `awesome-automotive-data` (ship first, ship this week)

The name returns zero results. The format has a proven 3,454-star ceiling in this exact vertical,
reachable from a standing start in under six years, and the incumbent generalist
(`Marcin214/awesome-automotive`, 1,136★) **has been stale since January 2025**. A well-maintained
list beats a stale one on GitHub's own ranking and in every "is this alive" judgment a visitor makes.

Content you already have, which almost nobody else does:

- **A tested reachability matrix.** Not "here are 200 car sites" but "here is which ones answer a
  plain fetch, which need a real browser, which are behind Cloudflare, tested on this date." Nobody
  has published this. It is the single most useful thing you own.
- Every source from the inventory, organized by region and access method.
- The free government API layer (NHTSA vPIC, NHTSA recalls, EPA) with working example calls.
- Commercial data providers with honest notes on pricing and coverage.
- Sold-price archives, which are distinct from listings and consistently overlooked.

Differentiators that make it more than a link dump: a per-source **access column** (API / feed /
HTML / hard), a **last-verified date** on every entry, and a CI job that pings each source weekly
and opens an issue when one flips. That last item is what turns a list into infrastructure, and no
awesome list in this vertical does it.

### Repo 2: the scraper toolkit

Once the list has traffic, the natural question from every visitor is "how do I actually pull
these?" Answer it with working code. The bar is six stars.

What you have that a newcomer does not: the traps. `innerText` returning empty on unrendered nodes.
Sold cards being structurally different from live cards. Page-wide regex mispairing every record.
Model-aware price floors catching salvage listings that a flat floor misses. Each of those is a
half-day someone else will otherwise lose, and documenting them is what earns trust.

### Repo 3: the canonical price model

Trained on real multi-source listings with real sold comps, not the Kaggle CSV everyone else uses.
This is the highest-effort item and should come last, but it targets a search term with 10,904
competing repos and no leader.

---

## 4. Additional platforms worth ingesting

Beyond the inventory already assembled, these are either verified working or high-value and absent
from most source lists.

### Verified reachable in a real browser (tested 7 Sep 2026)

| Source | Why it matters |
|---|---|
| **BringATrailer** | Sold prices with full comment history. The benchmark for enthusiast comps. |
| **Cars & Bids** | Modern enthusiast cars, clean structure. |
| **PCARMARKET** | Porsche-heavy auctions, plus dealer auction arm. |
| **duPont Registry** | Exotics. |
| **AutoTempest** | Reaches Carvana, TrueCar, eBay, Cars & Bids, PrivateAuto in one pass. |
| **CarMax** | JSON-LD with VIN, the cleanest structured data available free. |

### Free government and standards data (no key, no rate limit observed)

| Source | Endpoint | Gives you |
|---|---|---|
| NHTSA vPIC | `vpic.nhtsa.dot.gov/api` | VIN decode incl. **`Series`** = factory platform code (Type 95B, 991, 992). Solves generation normalization. |
| NHTSA Recalls | `api.nhtsa.gov/recalls` | Open campaigns with a **`parkIt` / `parkOutSide`** fire-risk boolean. |
| NHTSA Complaints / NCAP | `api.nhtsa.gov` | Owner complaints, crash ratings. |
| EPA Fuel Economy | `fueleconomy.gov/ws` | MPG and specs. Patchy on EVs and exotics. |
| NMVTIS | `vehiclehistory.gov` | Federal title-brand data, cheap via approved providers. |

### Connected-car and OEM APIs (existing OSS to build on, not compete with)

`timdorr/tesla-api` (2,065★), `tillsteinbach/CarConnectivity` (213★),
`Hyundai-Kia-Connect/kia_uvo` (930★), `ianjwhite99/connected-car-python-sdk`,
`commaai/opendbc` (3,394★, maps VIN to CAN signals). Linking to these earns goodwill and
cross-traffic; reimplementing them earns neither.

### Underexploited categories

- **Salvage auction archives** (Poctra, stat.vin, bidfax): historical sale prices keyed by VIN.
- **Government fleet auctions** (GSA, GovDeals, Public Surplus, Municibid): public, unprotected,
  and almost nobody aggregates them.
- **Rental defleet** (Hertz, Enterprise, Avis, Sixt): predictable inventory, weak defenses.
- **Lease takeover** (Swapalease, LeaseTrader): an entirely separate supply pool.
- **Dealer website platforms** (Dealer.com, Dealer Inspire, DealerOn, Sincro): one scraper per
  platform reaches thousands of independent dealer sites whose inventory never hits Autotrader.

---

## 5. GitHub mechanics that actually move the needle

- **Topics are the discovery surface.** The leaders carry 10+ (`automotive`, `awesome`,
  `awesome-list`, `cars`, `car-data`, `web-scraping`, `dataset`, `api`). Set them deliberately;
  they drive topic-page ranking.
- **Recency is ranked.** `Marcin214/awesome-automotive` has 1,136 stars and has not been pushed
  since January 2025. A weekly automated verification commit keeps you visibly alive and is honest
  work, not gaming.
- **Get listed on `sindresorhus/awesome`.** It is the top of the funnel for every awesome list.
  It has real submission criteria (age, structure, a proper contribution guide, non-trivial content)
  so read them before submitting.
- **Cross-link from the adjacent leaders.** A PR adding your data list to awesome-canbus and
  awesome-vehicle-security is a legitimate contribution, and those two carry 8,000 stars of traffic.
- **CC0 or MIT.** Every leading list in this vertical is CC0. Do not invent licensing friction.
- **Launch where the audience is:** r/cars, r/dataisbeautiful for the price analysis, Hacker News
  for the reachability matrix specifically (a tested "which car sites block bots" table is a strong
  HN post), and the Kaggle used-car dataset comment threads, where thousands of people are actively
  looking for exactly this.
- **Ship the data, not only the links.** A weekly-refreshed public dataset of real listings gives
  people a reason to return and to cite you. Citations are how a repo compounds.

---

## 6. Honest risk

Publishing scraper code aimed at named commercial sites invites takedown pressure, and some of
these sites' terms prohibit automated access. Three practical mitigations, all of which also make
the project better:

1. Lead with the **catalog and the reachability matrix** rather than turnkey scrapers for hostile
   targets. Facts about which sites block bots are not infringing.
2. Prefer **documented APIs and official feeds** wherever one exists (eBay, NHTSA, Tesla
   inventory), and say so loudly in the README.
3. Ship **polite defaults**: rate limiting, `robots.txt` respect, and clear personal-use framing.

The list is durable and low-risk. The scrapers are the part that attracts attention, which is
another argument for the ordering in section 3.

---

## 7. What I would do Monday

1. Register `awesome-automotive-data`. The name is free today.
2. Seed it from the source inventory plus the tested reachability matrix in
   `scratch/AGGREGATOR-BRIEF.md`. That matrix alone is a differentiator no competing list has.
3. Add the weekly source-verification CI job and the last-verified dates.
4. Submit PRs adding it to awesome-canbus and awesome-vehicle-security.
5. Post the reachability matrix to Hacker News on its own merits.

The scraper toolkit and the price model follow once there is traffic to convert.
