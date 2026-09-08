# AGENTS.md - GrantConnect Grant Awards Scraper & Monitor

Technical notes for whoever (human or AI) touches this actor next. Everything
below was verified live against grants.gov.au on 2026-09-06 unless stated.

## What this actor does

Extracts the Australian Government's whole-of-government **Grant Awards**
register from GrantConnect (`grants.gov.au`) - recipient, ABN, agency, value,
purpose, program, locations, dates, contact - with GrantConnect's own search
filters applied server-side, and a delta engine keyed on the record's
**Last Updated** timestamp so variations and corrections are caught too.

## Site facts that shape the design

### The CloudFront gate is a User-Agent check, not a JS/cookie challenge

Every path on this host (even `/robots.txt`) returns a CloudFront "403
Request blocked" page to a bare request. Isolated by testing headers one at a
time: a request with only a normal browser `User-Agent` succeeds; `Accept-
Language` alone still gets 403. No cookies, no JS, no CAPTCHA. `src/http.ts`
sends a browser UA unconditionally; a 403 is treated as deterministic (no
retry) and fails the run with a message pointing here. `robots.txt`
disallows `/Search/*`, `/Reports/*` and `/admin*` only - `/Ga/ListResult` and
`/Ga/Show/*` are allowed.

### `/Ga/ListResult` accepts the whole Advanced Search form as GET params

`/Ga/List` is a search FORM; submitting it 302-redirects to
`/Ga/ListResult?...`. Parameters confirmed to filter (with result counts at
audit time, full register = 360,066 records):

| param                           | example                                                                                      | notes                                                                                                                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Keyword` + `KeywordTypeSearch` | `aged care`, `AllWord\|AnyWord\|ExactPhrase`                                                 | 59,062 / 178,118 / 58,878                                                                                                                                                                                         |
| `Category`                      | `231` or `231,381`                                                                           | ONE param, codes COMMA-JOINED (26,109 = 15,847 + 10,262). A repeated `Category=` param is ignored beyond the first. 29 top-level codes in `src/urls.ts`. The record's own Category field is a SUB-category label. |
| `RecipientName`                 | `Regional Express`                                                                           | substring, 9 records                                                                                                                                                                                              |
| `RecipientAbn`                  | `46 101 325 642` or `46101325642`                                                            | both accepted                                                                                                                                                                                                     |
| `valueStart` / `valueEnd`       | `1000000`                                                                                    | `>= 1M` = 27,517                                                                                                                                                                                                  |
| `GOID`                          | `GO6105`                                                                                     | awards under one Grant Opportunity                                                                                                                                                                                |
| `isAdHoc` / `isAggregate`       | `1` / `0`                                                                                    | ad hoc = 31,728; aggregate = 851                                                                                                                                                                                  |
| `DateType`                      | `Publish Date`, `Approval Date`, `Start Date`, `End Date`, `Current`, `Closed`               | `Current` (44,860) / `Closed` (315,206) ignore the range                                                                                                                                                          |
| `DateStart` / `DateEnd`         | `DD-Mmm-YYYY` (zero-padded)                                                                  | `DateEnd=31-Dec-2099` is accepted - used so the UTC/Canberra day boundary can never exclude today's awards                                                                                                        |
| `orderBy`                       | `Last Updated`, `Publish Date`, `Relevance`, `Value`, `Agency`, `Category`, `Grant Activity` | `Last Updated` and `Publish Date` are DESCENDING; `Value` is ASCENDING ($0.00 first) so it is not exposed                                                                                                         |
| `page`                          | 1-indexed                                                                                    | 15 rows/page                                                                                                                                                                                                      |

There is NO usable agency parameter (the form only carries a hidden
`AgencySearchType`; the `AgencyUuid` picker is JS-driven and its UUID list is
not public) - `agencyNameContains` is a client-side substring filter on the
listing's Agency field.

### Page anatomy used for termination and block detection

- A results page always has `<h2>Search Results</h2>` and
  `<div class="total-result">Showing 1-15 of 360066 records</div>`; the
  number is the total for the CURRENT filter set (exposed as
  `totalMatching` in the run summary and status message).
- `li.next a[href]` exists whenever a following page exists; the last page
  has none. A zero-result query or a page past the end renders the heading
  with an EMPTY `.total-result` and no articles - a legitimate end.
- Anything without those markers (WAF challenge, maintenance, redirect to
  the form) makes `parseListingPage().isListingPage` false; the walker
  retries twice and then FAILS the run rather than reporting "nothing new".
- The paginator lists `aria-label="Page N"` links; the last page number is
  also derivable from them (not used - `.total-result` is simpler).
- Requesting a page far beyond the end (page=99999) takes ~45 s server-side;
  the walker never does that because it checks `li.next`.

### Variations keep the base award's Publish Date -> delta must use Last Updated

A variation (`GA270901-V1`, value increased / term extended - the most
commercially valuable events) is published with the ORIGINAL award's Publish
Date, so under `orderBy=Publish Date` it lands ~100,000 rows deep and a
Publish-Date-ordered delta never sees it. Under `orderBy=Last Updated` it is
at the top on the day it changes (seen live: `GA478931-V1 pub=24-Jun-2025
upd=4-Sep-2026 11:34 am`). Hence:

- default `sortBy` is `Last Updated`; `onlyNew` + `Publish Date` logs a warning;
- the delta state is a map `gaId -> lastUpdatedIso` (not an id list), which
  is what allows the `UPDATED` event type (known id, later timestamp);
- `Last Updated` renders as `D-Mmm-YYYY h:mm am/pm (ACT Local Time)`;
  `src/normalize.ts` converts Canberra wall-clock to UTC with correct
  AEST/AEDT handling via `Intl` (`Australia/Canberra`), no dependency.
- Pagination under `Last Updated` was checked for continuity: page 1 ends at
  `11:34 am`, page 2 starts at `11:33 am`, no overlap and no gap. Ties are
  common (dozens of variations share a minute), so the walker de-duplicates
  by gaId within a run and the watermark stop keeps a 3-day margin.

### Detail page (`/Ga/Show/<uuid>`) gotchas

- `State/Territory`, `Postcode`, `Country` appear under BOTH "Grant
  Recipient Location" and "Grant Delivery Location", which genuinely differ
  (a Sydney recipient delivering nationally; an aggregate award with
  `ACT, VIC` / `Multiple`). `parseSection()` walks siblings from the section
  `<h2>` until the next `<hr>` OR the next `<h2>`, so a missing `<hr>` can
  never let one section overwrite the other. Both sections are extracted.
- The Contact Details box is duplicated for desktop (`.pc`) and mobile
  (`.sp`); every selector uses `.first()` or `.text()` concatenates both.
  The contact NAME is the first `<p>` after `p.contact-heading` that has no
  `<label>`.
- Absent values render as `-` (e.g. `Recipient ABN: -` on aggregate awards);
  `blankToNull()` maps them to null.
- The detail Value carries a `(GST inclusive where applicable)` suffix that
  the listing does not; `gstInclusive` is derived from it and
  `valueAudNumber` strips it.
- Aggregate awards add `Aggregate Reason` and `Number of Awards Aggregated`;
  confidential awards add `Confidentiality Reason(s) - Contract/Outputs`.
  Fixture: `test/fixtures/grant_award_detail_aggregate.html` (GA575963).
- The detail page's `Agency` is the CURRENT department name after machinery-
  of-government changes; the listing row keeps the name at publication.
  Both are emitted (`agency`, `agencyCurrentName`).

### Rate tolerance

10 concurrent detail fetches returned 15/15 HTTP 200 at ~1 s each with no
throttling. `maxConcurrency` is capped at 10, default 5.

## Architecture

- `src/input.ts` - validates and resolves the input into `ListingFilters`
  (server-side query) + `RunOptions`; computes the filter fingerprint that
  names the delta store; handles relative dates and the legacy `dateRange`.
- `src/urls.ts` - `listingPath(filters, page)`; the 29 category codes.
- `src/http.ts` - `fetch` with timeout, retry policy (network/408/425/429/5xx
  only), `fetchOptional` (404 -> null), `mapWithConcurrency`.
- `src/parsers/listing.ts` - `parseListingPage()`: rows + total + next +
  is-it-a-listing-at-all. `src/parsers/detail.ts` - `parseDetail()`.
  `src/parsers/listDesc.ts` - shared `label: value` extractor.
- `src/fetchGrantAwards.ts` - `walkListing()` (pagination + classification +
  stop rules, no detail fetches), `enrichBatch()` (detail fetches with
  bounded concurrency), `buildRecord()` (all normalisation).
- `src/state.ts` - named-store delta state v2 (`{ seen: {gaId: lastUpdatedIso},
watermark, lastRunAt, filtersSignature }`), v1 migration, 50k-entry prune.
- `src/normalize.ts` - pure helpers (Canberra time, money, ABN checksum,
  financial year, term maths, entity classification, hash).
- `src/main.ts` - orchestration: walk -> deliver in batches oldest-first ->
  persist -> summary. Never pushes anything but records; fails the run on
  error (`Actor.fail`), so alerts fire.

## Delta engine invariants (do not break these)

1. **State is written only for delivered records** (`markSeen` after a
   successful `pushData`), plus, at the END of a successful run, for rows
   that were walked but intentionally excluded (unchanged / filtered).
   `saveState` runs every 50 delivered records, in a `finally`, and on the
   platform `migrating` / `aborting` events.
2. **Delivery is oldest-first** within a run, so a crash leaves the NEWEST
   candidates undelivered - exactly the rows the next walk visits first.
   Consequence: the dataset is an append-only chronological log; the views
   and README tell users to read it with `desc=true`.
3. **Early stop** needs 2 consecutive pages with no new/updated rows;
   additionally, under `Last Updated` order, a page whose rows are all older
   than `watermark - 3 days` stops the walk (bounds the cost even if the seen
   map was pruned or reset).
4. `maxItems` truncation never marks the overflow as seen; it logs a warning
   AND records a **backlog floor** (`state.backlogFloor` = lastUpdatedIso of
   the oldest row the truncated walk reached). While the floor is set, pages
   at or above it never count towards the 2-known-pages early-stop and the
   watermark cutoff is moved below the floor, so the next run walks through
   the block it already delivered down to the rows it never reached. A walk
   that ends naturally (end / no-more-pages / early-stop / watermark) clears
   the floor. Without this, a backlog older than two pages of delivered rows
   would be stranded forever (found by the HSE verifier, fixed fleet-wide).
5. The delta store name defaults to `auto-<hash of filters>` (dates and
   maxItems/fetchDetail excluded from the hash), so distinct schedules never
   share memory unless `deltaStateName` says so.
6. Charging: records with detail are pushed with event `result`, the rest
   with `result-summary`; `chargedCount` from the SDK is the number actually
   stored in PPE mode (outside PPE everything is stored, nothing charged).

## Tests

- `npm test` - offline, ~1 s: real captured fixtures + mocked HTTP; includes
  an end-to-end run of `src/main.ts` with the SDK mocked that asserts the
  persist-after-delivery invariant under a spending limit.
- `npm run test:live` (`LIVE=1`) - five live checks against grants.gov.au
  (~20 s): detail extraction, server-side filters, ABN lookup, zero-result
  termination, variations under Last Updated order.
- Local end-to-end: put an input in `storage/key_value_stores/default/INPUT.json`
  and `apify run --purge`; the delta store appears under
  `storage/key_value_stores/australia-grantconnect-monitor-state-<name>/`.

## Known scope limits (disclosed in the README)

- Grant Opportunities (`/Go/List`, RSS at `/public_data/rss/rss.xml`) are not
  covered - candidate companion actor.
- `/Ga/DownloadResult` returns an XLSX of the whole filtered result in one
  request (no row cap observed: 37,581 rows / 3 MB / 18 s for YTD-2026) and
  carries the aggregate columns; a `listingSource=xlsx` bulk mode is the
  obvious v2.1 for archive-scale pulls.
- `UPDATED` says the record changed, not WHAT changed (no field-level diff;
  would need snapshot storage).
- Recipient entity type is a name-pattern heuristic, not an ABR lookup.
