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
- `src/fetchGrantAwards.ts` - paginates the listing, optionally enriches
  each item with its detail page, merges into the final record shape.

## Known scope limits (disclosed, not hidden)

- Only the Recipient's own location is captured; "Grant Delivery
  Location" (relevant mainly for Aggregate Grant Awards covering multiple
  recipients/locations) is not extracted as a separate field.
- `purpose`, `title` and `grantActivity` are plain text, not reformatted
  or summarized.
- The Grant Opportunities register (`/Go/List`, distinct from Grant
  Awards) is not covered by this actor.
