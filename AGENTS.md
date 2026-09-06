# AGENTS.md - Australia GrantConnect Monitor

Technical notes for whoever (human or AI) touches this actor next.

## What this actor does

Extracts the Australian Government's whole-of-government **Grant Awards**
register from GrantConnect (`grants.gov.au`) - recipient, agency, value,
purpose, program, ABN and location, sorted newest-first by Publish Date.

## The CloudFront gate is a User-Agent check, not a JS/cookie challenge

Every path on this host - `/Ga/List`, `/Ga/ListResult`, `/Ga/Show/<id>`,
even `/robots.txt` itself - returns a CloudFront "403 Request blocked"
page to a bare request. Verified live 2026-09-06 by isolating exactly
which header matters: a request with **only** a normal browser
`User-Agent` succeeds (200); a request with only `Accept-Language` (no
User-Agent) still gets blocked (403). It is specifically curl's own
default `curl/x.y.z` User-Agent string being blocked, not "requests
without enough headers" in general - no cookies, no JS execution, no
CAPTCHA involved once a real-looking UA is sent. `src/http.ts` sends this
header unconditionally on every request for this reason.

## Finding the real listing endpoint: `/Ga/List` is a search FORM, not a listing

`/Ga/List` renders two separate forms: a "View by Publish Date" weekly
picker (`GET /Ga/ViewByPublishDate?Weekly=<start>,<end>`, the source of
the original swarm audit's "226 records in one week" finding) and a much
more useful "Advanced Search" form with a `DateType`/`DateStart`/`DateEnd`
range plus a required `SearchButton=true` field. Submitting the advanced
form with a broad range (`DateStart=01-Jan-2010`) 302-redirects to the
**real** results endpoint:

```
/Ga/ListResult?Type=Ga&AgencyStatus=-1&DateType=Publish+Date&DateStart=<start>&DateEnd=<end>&orderBy=Publish+Date&page=<n>
```

This single broad-range query returns the entire archive (360,066 records
at audit time 2026-09-06) rather than one week at a time, `orderBy=Publish
Date` sorts newest-first by default (verified: page 1's dates matched the
current date at fetch time, no separate asc/desc toggle needed), and
`page=<n>` (1-indexed, 15 records/page) paginates cleanly - verified page
2 continues the same sort order with no gaps or duplicates.

## The listing already carries the commercially-relevant fields

Each result is one `<article role="article">` block containing the same
`<div class="list-desc"><span>Label:</span><div class="list-desc-inner">Value</div></div>`
shape used throughout the site (listing rows and the full detail page
share this exact markup pattern) - Agency, Publish Date, Category, Grant
Term, Value (AUD), Recipient Name and Last Updated are all present without
a detail fetch. The detail page (`/Ga/Show/<uuid>`, linked from the "GA
ID" field) adds Approval Date, Purpose, Grant Program, Grant Activity,
recipient ABN and location, the originating Grant Opportunity (GO
ID/Title), Selection Process, confidentiality flags, and agency contact
phone/email.

## A real bug found and fixed before shipping: duplicate location sections

The detail page repeats `State/Territory`, `Postcode` and `Country` under
**two** different `<h2>` sections - "Grant Recipient Location" and "Grant
Delivery Location" - which can genuinely differ (e.g. a nationally-
delivered program with a Sydney-based recipient). A flat, whole-page
label-to-value lookup (the same approach that works fine for HSE's
detail pages, which have no such duplication) would have the second
section silently overwrite the first, attributing the wrong location to
the recipient. Fixed in `src/parsers/detail.ts`'s `parseSection()`: find
the specific `<h2>` heading, then only read the `.list-desc` rows between
it and the next `<hr>` (sections are `<hr>`-separated on this page). This
is the same class of "verify the real markup section boundaries, don't
assume a flat structure" lesson as HSE's own `<td>`-pairing parser.

A second, smaller instance of the same lesson: the entire "Contact
Details" sidebar box is duplicated once for desktop (`.pc`) and once for
mobile (`.sp`) - the same responsive-duplication pattern as HSE's
paginator markup. `$('label[for="AgencyContactPhone"]').closest('p')`
without `.first()` matches both copies and `.text()` silently
concatenates them into `"1800 020 283Phone:1800 020 283"` - caught by a
fixture test, fixed by adding `.first()` before `.closest('p')`.

## Architecture

- `src/http.ts` - plain `fetch()` with retry, unconditionally sends a
  browser `User-Agent` (the actual CloudFront gate, see above), no proxy.
- `src/urls.ts` - the hardcoded broad-date-range, `orderBy=Publish Date`
  query that returns the full archive newest-first; `formatSiteDate()`
  matches the site's required `DD-Mmm-YYYY` input format.
- `src/parsers/listDesc.ts` - `parseListDesc()`, the shared label/value
  extractor for the `.list-desc`/`.list-desc-inner` pattern used by both
  listing articles and the detail page; `linkIn()` resolves a specific
  field's embedded link (GA ID, Varies, GO ID all carry one).
- `src/parsers/listing.ts` - one `ListingItem` per `<article>` on
  `/Ga/ListResult`.
- `src/parsers/detail.ts` - `parseDetail()` for `/Ga/Show/<uuid>`,
  including the section-scoped `parseSection()` fix above.
- `src/fetchGrantAwards.ts` - paginates the listing (`fetchListingItems`,
  applying the delta engine's early-stop below), optionally enriches each
  item with its detail page, merges into the final record shape.
- `src/state.ts` / `src/dateFilter.ts` - delta engine support, see below.

## Delta engine (2026-09-06 retrofit)

Added `onlyNew`/`dateRange` input + a standardized B2B output envelope
(`record_id`, `event_type`, `scraped_at`, `is_new`, `source_url`) across
this portfolio's fleet, matching the contract shipped and cloud-verified
on the UK HSE Enforcement Monitor actor. GrantConnect-specific
implementation notes:

- **Early-stop pagination was implemented (not a safe post-filter)**,
  because this actor's own listing is genuinely, reliably sorted
  newest-first: `src/urls.ts`'s `listingPath()` hardcodes
  `orderBy=Publish Date`, and this was verified live during the original
  build (page 1's dates matched the current date at fetch time, page 2
  continued the same order with no gaps or duplicates - see the endpoint
  notes above). Unlike a cursor-paginated or unstable-order source, this
  is exactly the condition the spec requires before short-circuiting
  pagination.
- `src/fetchGrantAwards.ts`'s `fetchListingItems()`: since the listing is
  already newest-first, `onlyNew=true` walks pages and stops after **2**
  consecutive pages contain zero unseen `gaId`s (not 1) - the same
  one-page safety margin HSE uses against minor reordering between runs.
  Verified against real fixture HTML with a mocked http layer
  (`test/fetchListingItems.test.ts`, `vi.mock('../src/http.js', ...)`,
  matching HSE's own `test/fetchListingIds.test.ts` pattern): seeding the
  seen-set with every id on a fixture page and re-running with
  `onlyNew=true` stops after exactly 2 fetches rather than walking to
  "no more results".
- `src/state.ts` opens a **named** key-value store
  (`australia-grantconnect-monitor-delta-state`) rather than the run's
  default one - Apify's default KV store is isolated per run and would
  not survive between scheduled runs, which defeats the whole point of a
  delta. Unlike HSE (convictions/notices are independent id spaces, so
  its state is keyed per dataset), Grant Awards has a single id space
  (`gaId`), so state here is a flat `{ seenIds: string[], lastRunAt }`
  rather than keyed per sub-dataset. `seenIds` is capped at 2000 entries,
  newest-first (matching the source's own order).
- `record_id` reuses the existing `gaId` field verbatim (already the
  site's own natural identifier, e.g. `GA578886` or `GA270901-V1` for a
  variation) rather than hashing anything or introducing a new id shape.
  `gaId` itself is kept alongside `record_id` (not removed) - the same
  choice HSE made for `caseNumber`/`noticeNumber` - since it's a
  meaningful domain field in its own right, not merely a duplicate of the
  portfolio-wide envelope field.
- `event_type` is set structurally, not by diffing fields: a listing row
  that carries a "Varies" link is GrantConnect's own way of marking a
  record as an amendment of an earlier award (a distinct `gaId` like
  `GA270901-V1` varying base award `GA270901`) - this is classified as
  `'AWARD_VARIATION'`; every other record is `'NEW_LISTING'`. This is the
  same kind of structural (not field-diffed) signal HSE uses for
  `SANCTION` vs `NEW_LISTING` - it does not detect field-level changes to
  a previously-seen record (e.g. a "Last Updated" bump with no new
  `gaId`), which would need full snapshot storage and is disclosed as a
  known limitation in the README.
- `gaUrl` (the record's own official detail-page link) was renamed to
  `source_url` and `scrapedAt` to `scraped_at`, rather than kept alongside
  the new envelope fields - both were exact duplicates of what the new
  fields represent, and this portfolio has no real paying customers yet,
  so there is no backward-compatibility cost to eliminating the
  duplication. `goUrl` and `variesUrl` were left alone: those point at
  _other_ records (the originating Grant Opportunity, the base award being
  varied), not this record's own page, so they are not duplicates of
  `source_url`.
- `dateRange` filters on `publishDate` via `src/dateFilter.ts`'s
  `parseGrantConnectDate()` - the site renders this field as `D-Mmm-YYYY`
  with the day **not** zero-padded (e.g. `6-Jan-2022`, `28-Oct-2022`,
  confirmed against every date in the real listing fixtures), distinct
  from the zero-padded `DD-Mmm-YYYY` the site's own search inputs require
  (`formatSiteDate()` in `urls.ts`) - two different formats for the same
  site, verified against real fixture content rather than assumed
  symmetric. Publish Date is also the field `orderBy` sorts by and it
  matched the real current date on page 1 at original-build verification
  time, so - unlike HSE's Offence Date, which is dated to when a breach
  happened rather than when it was prosecuted and so lags real
  publication by months - there is no known systematic lag between this
  field and real publication for Grant Awards; `dateRange` is disclosed in
  the README on that basis rather than with a lag caveat.
- Delta-engine tests (`test/fetchListingItems.test.ts`,
  `test/fetchGrantAwards.delta.test.ts`, `test/dateFilter.test.ts`) all
  run against real captured fixture HTML with a mocked http layer, so they
  run in CI. The pre-existing live checks in `test/fetchGrantAwards.test.ts`
  (skipped in CI, same as every other actor in this portfolio) were
  updated for the new `fetchGrantAwards()` signature and extended with
  live `is_new`/`onlyNew`/`dateRange` assertions, mirroring HSE's
  `test/fetchRecords.test.ts`.

## Known scope limits (disclosed, not hidden)

- Only the Recipient's own location is captured; "Grant Delivery
  Location" (relevant mainly for Aggregate Grant Awards covering multiple
  recipients/locations) is not extracted as a separate field.
- `purpose`, `title` and `grantActivity` are plain text, not reformatted
  or summarized.
- The Grant Opportunities register (`/Go/List`, distinct from Grant
  Awards) is not covered by this actor.
- `event_type` does not yet detect field-level updates to a previously-
  seen record (e.g. a "Last Updated" change with no new `gaId`) - only
  whether the `gaId` itself is new or a variation. See "Delta engine"
  above.
