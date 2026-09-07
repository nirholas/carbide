# Carbide: a working car aggregator prototype

```bash
cd scratch/site && node server.mjs      # http://localhost:4173
```

Zero dependencies. Node 18+. Data ships in `data/`.

**2,118 listings across 10 sources, deduped to 2,086 unique cars, plus 169 verified sold records.**

---

## What this does that AutoTempest does not

AutoTempest's own footer states it: *"We aggregate millions of listings… We also generate
comparison links for the remaining large sites we don't yet have partnerships with."*

They truly aggregate 8 partner sources. For **Autotrader, CarGurus, Craigslist and Facebook
Marketplace** (four of the largest) they render an "Open Results" button that bounces you to the
other site. That is the gap.

| | AutoTempest | Carbide |
|---|---|---|
| Sold prices | none | **169 verified auction sales, shown inline** |
| Autotrader | link-out only | reachable via TLS impersonation (see below) |
| CarGurus | link-out only | **aggregated** |
| Deal rating | CarGurus' rating, passed through | computed against same model + year cohort |
| Salvage detection | none | **automatic outlier flag** |
| Cross-source dedupe | "+2 sites" | same, plus keeps the cheapest URL |
| Undominated filter | none | **hides cars beaten on year, miles and price at once** |

### The differentiator, concretely

Search the i8 and the panel reads: **48 completed auction sales, median $64,444, range
$38,000 to $86,000.** Underneath, the cheapest listing asks $34,394. That juxtaposition, ask against
what buyers actually paid, is the number no aggregator surfaces, and it is the whole product
thesis.

---

## Architecture

```
server.mjs          node:http only, no framework
  /api/facets       makes, models, sources, counts
  /api/search       filters, cross-source merge, cohort deal rating, undominated
  /api/comps        sold comps for a model, narrowed to ±3 model years
public/index.html   single-file frontend, no build step
data/listings.json  normalized corpus
data/sold.json      verified auction results
```

Everything derived (cohort medians, outlier flags, deal ratings, sold index) is computed once at
boot, so search is a filter over memory.

### Intelligence built in

- **Cohort deal rating.** Each car is scored against the median of its own `model + 2-year band`,
  not the whole market. A cheap Macan is not a good deal because Macans are cheap.
- **Salvage outlier flag.** A car below 62% of its model's first quartile is flagged *Verify title*.
  This rule was derived by hand-checking three exotics: two carried salvage titles, and one
  advertised "Clean Title" while the seller disclosed *"As Is, Cash Only, Airbags Deployed, Key
  Missing."* It correctly flags the $100,099 McLaren 650S and leaves legitimate cars alone.
- **Cross-source merge.** Same model, year and exact mileage within 3% on price is one car. Shown
  once, cheapest URL kept, other sources listed as "+N sites".
- **Undominated filter.** With cheapest, newest and lowest-mileage in conflict, the only honest
  shortlist is the Pareto frontier: cars nothing else beats on all three.
- **Auctions segregated.** Cars & Bids rows are live bids, labelled *Bid, not ask*, and excludable.

---

## Getting more data in

`../scraper/` holds the collectors:

| File | Does |
|---|---|
| `run.mjs` | AutoTempest per model+sort, plus CarMax JSON-LD |
| `hunt.mjs` | Multi-marque sweep |
| `bat.mjs` | BringATrailer sold prices |
| `probe.mjs` | **Reachability prober. Run in CI, defenses change without notice** |

Re-run any of them, then regenerate `data/` and restart.

### Reachability, tested 7 Sep 2026

Access is **not** a browser-versus-fetch question. It is a TLS fingerprint question, and getting
this backwards is why Autotrader looked impossible for most of this project.

| Site | Plain fetch | Real Chromium | `curl_cffi` | Profile |
|---|---|---|---|---|
| Autotrader | 403 | 403 | **200** | `chrome124` |
| Carfax | 403 | 403 | **200** | `chrome124` |
| Hemmings | 403 | 403 | **200** | `safari17_0` |
| AutoNation | 403 | 403 | **200** | `safari17_0` |
| Cars.com | 200 | **403** | **200** | `safari17_0` |
| Carvana, TrueCar | 403 | 403 | 403 | via AutoTempest |

**The impersonation profile is per-site.** Chrome opens Autotrader; its neighbours want Safari. A
single hardcoded profile loses half the sources. Try profiles per host and cache the winner.

Autotrader and Carfax are **access-solved, extraction-unsolved**: they serve the page but carry no
`ld+json` and no `__PRELOADED_STATE__`. Note also that round numbers on those pages
(`$10,000`, `$20,000`) are **filter dropdown values, not listings**.

---

## Traps already paid for

Every one produced *plausible-looking wrong data*, which is far worse than an error.

- `innerText` returns `""` on unrendered nodes. Use `textContent`. Cost four failed extractors.
- Sold and live auction cards are structurally different; one extractor silently returns zero.
- Never pair by page-wide regex. It gave every car in a model line the same price.
- Read prices from a specific element. A loose scan produced a *"2026 911 Targa 4 GTS, $25,476"*
  against real comparables of $185,069.
- Model-aware price floors, not a flat one. A flat $8k floor missed that $25,476 case.
- Filter JSON-LD by brand: CarMax's "similar vehicles" put a Mercedes in a Porsche dataset.
- Filter non-vehicle lots: a *"BMW i8 Full-Scale Display Model"* sold for $2,700 and parsed as a car.
- `Buffer` must not pass through `JSON.stringify` in the static file handler, or the browser renders
  `{"type":"Buffer","data":[...]}` literally. That bug is in this repo's history.
- AutoTempest sitecodes are not a stable contract. An unmapped code (`cmp`) reached the UI as a
  raw label, and three others were mislabeled outright. Resolve the source from the destination
  URL host instead; the sitecode is a fallback. This corrected the source counts and revealed
  PrivateAuto and Sotheby's Motorsport, which had been hiding under wrong labels.
- **After any extractor change, assert distinct-price count is near record count.** `19 records,
  1 distinct price` is the signature of a mispairing bug and is otherwise invisible.

---

## Next

1. **eBay Browse API**: free, documented, real-time, covers Motors. Needs only a developer key.
   Highest value per hour of work remaining.
2. **Autotrader and Carfax extractors** now that access is solved.
3. **NMVTIS title verification** (~$10/report via an approved provider) on shortlisted cars only,
   pre-filtered by the free outlier flag. Yields a *verified clean title* badge nobody else has.
4. **Daily snapshots** for days-on-market and price drops. Cannot be backfilled, so start early.
5. Swap the hand-rolled fetch loops for `curl_cffi` + `Scrapling`, and dedupe with `splink`.

Respect `robots.txt`, rate limit, prefer documented APIs, and keep the free NHTSA layer
(vPIC decode, recalls with the `parkIt` flag) doing as much enrichment as it can.
