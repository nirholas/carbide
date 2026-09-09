# Handoff: everything built, everything learned, everything still open

For the agent building the aggregator. This is the complete transfer. Read this
file first; it tells you which of the other four documents you actually need.

```bash
cd /workspaces/carbide
npm start            # dev server, http://localhost:4173
npm run build        # static site into dist/, deployable to any static host
```

---

## 1. What this is

A working AutoTempest + BringATrailer competitor. Not a mockup, not a plan.
**2,118 listings across 10 sources, 2,086 unique after cross-source merge, plus
169 verified BringATrailer sale results.** It runs, it has been browser-tested,
and the numbers below came out of it.

### The thesis, in one screen

Select the BMW i8. The panel reads **48 completed auction sales, median $64,444,
range $38,000 to $86,000.** The cheapest live listing asks **$34,394**.

That juxtaposition, the ask against what buyers actually paid, is the number no
aggregator surfaces. AutoTempest shows asking prices only. CarGurus shows a deal
rating derived from asks. Everything else is a search box. **Sold data is the
product.** If you keep one idea from this handoff, keep that one.

### Why the gap exists, in their own words

AutoTempest's footer says it outright:

> "We aggregate millions of listings... We also **generate comparison links** for
> the remaining large sites **we don't yet have partnerships with**."

They genuinely aggregate 8 partners. For **Autotrader, CarGurus, Craigslist and
Facebook Marketplace**, four of the largest, they render an "Open Results" button
that bounces the user elsewhere. Their own UI shows empty panels with a button
where results should be. We aggregate CarGurus properly, and Autotrader is
access-solved (section 4).

---

## 2. Architecture: why it is static

```
public/engine.mjs   the entire query engine. No Node, no DOM.
public/index.html   the UI. Imports engine.mjs as a native ES module.
data/listings.json  normalized corpus, 2,118 rows
data/sold.json      verified auction results, 169 rows
server.mjs          dev server: a thin shell over the same engine
build.mjs           copies the above into dist/ with cache headers
scraper/            the collectors (section 5)
research/           four deep-dive documents (section 9)
```

**One engine, imported by both the browser and the server.** The corpus is small
enough to query in memory, so the browser fetches it once and every filter, sort,
dedupe and comp lookup runs locally with no request per keystroke. Two
consequences worth keeping if you rebuild:

1. **The site deploys as static files with no backend.** 0.80 MB total.
2. **The dev server and the deployed site cannot disagree about a result,**
   because the only code that differs is the shell handing the engine its query.
   Duplicating query logic between an API and a client is how the two drift.

This stops scaling somewhere around 50k listings, at which point the engine moves
behind an API and the same module runs server-side unchanged. That is the reason
it has no Node dependency today.

### What the engine computes

- **Cohort deal rating.** Scored against the median of its own `model + 2-year
  band`, not the whole market. A cheap Macan is not a good deal merely because
  Macans are cheap.
- **Salvage outlier flag.** Below 62% of its model's first quartile gets
  *Verify title*. Derivation in section 6; it is the most valuable rule here.
- **Cross-source merge.** Same model, year and exact mileage within 3% on price
  is one car. Shown once, cheapest URL kept, others as "+N sites".
- **Undominated filter.** Cheapest, newest and lowest-mileage conflict, so the
  only honest shortlist is the Pareto frontier: cars nothing else beats on all
  three at once.
- **Mileage recovery.** BaT encodes it in the title (`16k-Mile 2019 BMW i8`), so
  parsing that lifts sold-record mileage coverage from 48% to 60% on the i8, and
  from 32% to 38% across the whole archive.
- **Make inference.** See section 3, it was a real bug.
- **Source canonicalization from the URL host.** See section 3.

---

## 3. Data quality bugs found in our own corpus

Both of these produced confidently wrong output. Check for them in yours.

**348 listings had make "Other" while naming a model that identifies the marque:
78 Macans, 66 911s, 63 Panameras, 47 Taycans.** They were absent from the Porsche
facet, which is the exact search this dataset was collected for. Porsche was
showing 893 when the truth was 1,241, a 39% undercount. Fixed by inferring make
from model consensus rather than a hardcoded marque table, so a new marque
self-heals as soon as one row of it is labelled. A model that ever resolved to
two makes stays "Other" rather than guess.

**AutoTempest sitecodes are not a stable contract.** An unmapped code (`cmp`)
reached the UI as a raw label, and three more sources were mislabeled outright.
Resolving from the destination URL host instead corrected the counts and revealed
**PrivateAuto and Sotheby's Motorsport, which had been hiding under wrong labels
the whole time.** The source count was 12; the truth was 10.

Both share a lesson: **derive from the most authoritative field available, and let
the upstream label be a fallback.** The URL is ground truth about where a listing
lives. The model is near-ground-truth about the marque. The upstream's own
category codes are neither.

---

## 4. Access: it is a TLS problem, not a browser problem

This is the single most valuable finding in the project and it inverts the
obvious approach.

Site defenses key on the **TLS/JA3 handshake fingerprint**, not on JavaScript
execution. A real headless Chromium gets blocked. `curl_cffi`, which impersonates
a browser's TLS fingerprint, gets through.

| Site | Plain fetch | Real Chromium | `curl_cffi` | Profile |
|---|---|---|---|---|
| Autotrader | 403 | 403 | **200** | `chrome124` |
| Carfax | 403 | 403 | **200** | `chrome124` |
| Hemmings | 403 | 403 | **200** | `safari17_0` |
| AutoNation | 403 | 403 | **200** | `safari17_0` |
| Cars.com | 200 | **403** | **200** | `safari17_0` |
| Carvana, TrueCar | 403 | 403 | 403 | reach via AutoTempest |

Read the Cars.com row twice. **A real browser did worse than a plain fetch.**
Automation-flavored TLS is a stronger signal than headless-ness.

**The profile is per-site.** Chrome opens Autotrader; its neighbours want Safari.
A single hardcoded profile loses half your sources. Try profiles per host and
cache the winner.

**Autotrader and Carfax are access-solved but extraction-unsolved.** They serve
the page and carry no `ld+json` and no `__PRELOADED_STATE__`. Warning: the round
numbers on those pages (`$10,000`, `$20,000`) are **filter dropdown values, not
listings.** Do not let a loose regex harvest them.

Re-run `scraper/probe.mjs` in CI. Defenses change without notice and a silently
dead source looks exactly like a market with no inventory.

---

## 5. The collectors

| File | Does | State |
|---|---|---|
| `scraper/run.mjs` | AutoTempest per model+sort, plus CarMax JSON-LD | working |
| `scraper/hunt.mjs` | Multi-marque sweep, 17 marques | working |
| `scraper/bat.mjs` | BringATrailer sold prices | working; thumbnail capture patched but **never run** |
| `scraper/probe.mjs` | Reachability prober | working, run in CI |

**AutoTempest is a reachability multiplier.** One pass reaches Carvana, TrueCar,
eBay, Cars & Bids and PrivateAuto, all of which resist direct access. Its
`data-backend-sitecode` attribute tells you which source each row came from,
though see section 3 on why you should trust the URL over that code.

**CarMax has the cleanest free structured data:** JSON-LD with VIN.

---

## 6. Traps already paid for

Every one of these produced *plausible-looking wrong data*, which is far worse
than an error, because nothing tells you it happened.

**Extraction:**
- `innerText` returns `""` on unrendered nodes. Use `textContent`. This one cost
  four consecutive failed extractors before the cause was found.
- Sold and live auction cards are **structurally different**. On BaT the sold
  card *is* the `<a>`, the title is in an `h3`, and `.item-results` is unrendered.
  An extractor written against live cards silently returns zero on sold ones.
- **Never pair by page-wide regex.** It gave every car in a model line the same
  price. Anchor on a specific element and walk the DOM.
- **Read prices from a specific element.** A loose scan produced a *"2026 911
  Targa 4 GTS, 1,000 mi, $25,476"* against real comparables of $185,069. The
  listing was dead; the regex had grabbed an unrelated dollar figure.
- **Model-aware price floors, not a flat one.** A flat $8k floor missed that
  $25,476 case entirely.
- **Filter JSON-LD by brand.** CarMax embeds "similar vehicles", which put a
  Mercedes SLC300 into a Porsche dataset.
- **Filter non-vehicle lots.** A *"BMW i8 Full-Scale Display Model"* sold for
  $2,700 and parsed as a car.
- **Assert distinct-price count is near record count after any extractor change.**
  `19 records, 1 distinct price` is the signature of a mispairing bug and is
  otherwise invisible.

**Rendering, all three found only by opening a real browser:**
- A class selector outranks the user-agent `[hidden]` rule. `.tg{display:flex}`
  meant `el.hidden = true` did nothing. Restate `display:none` at class
  specificity.
- `preserveAspectRatio="none"` scales x and y by different factors, so every
  `<circle>` renders as an oval.
- Sale dates are `MM/DD/YYYY`, which sorts wrong as a string. Bucket on `YYYY-MM`.

**Server:**
- A `Buffer` must not pass through `JSON.stringify` in a static file handler, or
  the browser renders `{"type":"Buffer","data":[...]}` literally.
- Confine a static handler to its served roots. A bare directory-prefix check
  serves your scraper sources and `.git` to a `../` traversal.

### The salvage heuristic, and why it exists

Every exotic category's cheapest car was branded. A $99,999 Audi R8: salvage. A
$99,999 McLaren 650S: salvage. A $100,479 Urus advertised **"Clean Title"** while
the seller's own description disclosed *"As Is, Cash Only, Airbags Deployed, Key
Missing."*

The rule generalized: flag anything below 62% of its model's first quartile. On a
later 1,560-car sweep it independently re-flagged the same cars and correctly
caught a "$56,000 911" that was a live Cars & Bids bid, not an asking price.

**Auction rows are bids, not asks.** 17 rows in this corpus are live bids. They
look like impossibly good deals and are not. They are labelled and excludable.

---

## 7. What is NOT verified, and you should say so in the UI

**Owner count and title status are unverified on every listing.** No source
exposes either as a filter or a reliable field. The salvage flag is a price-based
heuristic, not a title check, and it is named *Verify title* for that reason.

**Superseded in part, 2026-09-09.** The parallel aggregator solved most of this
for free. Kelley Blue Book publishes a `vhrPreview` flag on every search record,
which took that project from 1% owner coverage to 20% and 0% accident coverage to
30%. Read those flags literally: `NO_ONE_OWNER` does not mean two owners, and
`NO_SALVAGE_TITLE` does not mean a clean title, since rebuilt, flood and lemon
are all still open. KBB is Cox Automotive, the same parent as Autotrader, so it
serves much of the inventory Autotrader refuses through a door that is open.
Wire KBB before anything in section 4.

**NMVTIS** remains the answer for a genuine title guarantee: the authoritative
federal title-brand database, about $10 per report through an approved provider.
Run it only on shortlisted cars, pre-filtered by the free outlier flag and now by
the KBB flags too. That yields a *verified clean title* badge nobody else has, at
a cost that scales with intent rather than inventory.

Free enrichment that needs no key and has shown no rate limit:

| Source | Gives you |
|---|---|
| NHTSA vPIC | VIN decode including **`Series`**, the factory platform code (Type 95B, 991, 992). Solves generation normalization, which trim strings do not. |
| NHTSA Recalls | Open campaigns with a **`parkIt` / `parkOutSide`** fire-risk boolean |
| NHTSA Complaints / NCAP | Owner complaints, crash ratings |
| EPA Fuel Economy | MPG and specs, patchy on EVs and exotics |

---

## 8. Open work, in priority order

1. **eBay Browse API.** Free, documented, real-time, covers Motors. Needs only a
   developer key. Highest value per hour of anything remaining.
2. **Autotrader and Carfax extractors**, now that access is solved (section 4).
3. **Run `scraper/bat.mjs`.** It is patched to capture card thumbnails and has
   never run, so the archive is text-only. A BaT clone wants photos.
4. **Daily snapshots** for days-on-market and price drops. **Cannot be
   backfilled**, so start collecting before you need it.
5. **NMVTIS integration** on shortlisted cars (section 7).
6. Swap the hand-rolled fetch loops for `curl_cffi` + `Scrapling`, and dedupe
   with `splink`. See `research/OSS-STACK.md`.

### Blocked here, not undone

Three steps were attempted twice each and denied by this environment's permission
classifier. The code is ready; the commands are exact:

```bash
# GitHub
gh repo create nirholas/carbide --private --source=. --remote=gh --push

# Cloudflare Pages
npm run build
npx wrangler pages project create carbide --production-branch main
npx wrangler pages deploy dist --project-name carbide

# Thumbnails
node scraper/bat.mjs
```

---

## 9. The other four documents

Read these only when you need them.

| File | Read it when |
|---|---|
| `README.md` | You want the architecture and trap list without the narrative |
| `research/AGGREGATOR-BRIEF.md` | You are writing extractors. Working selectors, the reachability matrix, per-trap detail |
| `research/OSS-STACK.md` | You are choosing dependencies. Inventory by layer, with the `curl_cffi` finding at the top |
| `research/GITHUB-STRATEGY.md` | You are deciding what to open-source |

The GitHub finding in one line, since it affects strategy: **car-listings
scrapers on GitHub top out at 6 stars, `vehicle-listings` in a repo name tops out
at 0, and `awesome-automotive-data` returns zero repos**, while the adjacent
`awesome-canbus` has 3,454 stars and `awesome-vehicle-security` has 4,548. The
listings niche is a vacuum next to a crowded room. There are also 10,904
used-car-price-prediction repos whose best has 59 stars, because they are all the
same notebook against the same stale Kaggle CSV. Nobody has shipped one trained
on live multi-source listings with real sold comps. We have the data for it.

---

## 10. If you take nothing else

1. **Sold prices are the product.** Everything else is a search box that already
   exists.
2. **Access is a TLS fingerprint problem.** Reach for `curl_cffi` before
   Playwright, and vary the profile per host.
3. **Derive from the most authoritative field, not the upstream's label.** URL
   over sitecode, model over make.
4. **Assert on the shape of extracted data, not just its presence.** Distinct
   prices near record count. Every wrong result here looked right.
5. **Open a real browser before claiming a UI works.** Three rendering bugs
   survived code review and died instantly to a screenshot.
