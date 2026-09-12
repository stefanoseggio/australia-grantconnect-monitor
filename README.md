# Australian Government Grants Monitor - GrantConnect Awards Tracker (Grant Intelligence)

[![Built for Apify](https://img.shields.io/badge/Built%20for-Apify-FF9012?logo=apify&logoColor=white)](https://apify.com)
[![Pay-Per-Event](https://img.shields.io/badge/Pay--Per--Event-from%20%240.001-brightgreen)](https://apify.com/stefano_seggio/australia-grantconnect-monitor)
[![TypeScript](https://img.shields.io/badge/TypeScript-Actor-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Apache 2.0 License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)

[![Run on Apify](https://apify.com/ext/run-on-apify.png)](https://apify.com/stefano_seggio/australia-grantconnect-monitor)

## Executive Value Proposition

GrantConnect (grants.gov.au) is the only complete, official record of who received Commonwealth grant money, from which agency, under which program and for how much - but the public site offers only a 15-rows-per-screen search form and a manual report capped at 50,000 rows, with no API, no CSV feed, no RSS and no email alert for awards (GrantConnect's own notifications cover funding *opportunities*, not awards already made). This Actor replaces that page-by-page browsing with structured JSON, CSV or Excel in minutes: the same filters as GrantConnect's Advanced Search run server-side, so a narrow query touches a handful of pages instead of the whole 360,000-record register, and every value arrives normalised (ISO dates, numeric AUD, checksummed ABN) instead of needing manual cleanup. Put it on a schedule with delta mode on and each run after the first returns only the awards that were published, varied or updated since the previous one - the ongoing monitoring GrantConnect itself does not offer.

## Who uses this

- **Grant-writing and consulting firms** track which agency just funded organisations like their client, under which program, using `agency`, `grantProgram`, `goId` and `selectionProcess` - the basis for pitching the next funding round or approaching a fresh winner about variation and re-application work.
- **Nonprofit and university funding-intelligence teams** scout which programs are funding peers in their sector this week (filter by `categories` and `recipientName`), and use `grantEndDateIso` / `daysUntilGrantEnd` to build a grants renewal calendar and spot consortium targets before a program's next round opens.
- **Government-relations and market-intelligence teams** watch a specific competitor, ABN or portfolio agency for a new or varied award (`recipientAbn`, `agency`, `event_type`, `isOneOffAdHoc`) to brief clients or prepare for Senate Estimates, and journalists use the same fields plus `selectionProcess` / `isContractConfidential` to flag large, closed or non-competitive grants worth a story or an FOI request.

## Input

Every filter is applied server-side by GrantConnect itself unless marked client-side, so a narrow run is fast and cheap. Leave everything empty to walk the whole register, most recently updated first.

```json
{
  "categories": ["231"],
  "minValueAud": 500000,
  "onlyNew": true,
  "maxItems": 500
}
```

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `keyword`, `keywordMatch` | string | `""` / `AllWord` | Full-text search over title, purpose and activity (also accepts a GA ID like `GA578886`); match `AllWord`, `AnyWord` or `ExactPhrase` |
| `categories` | string[] | `[]` | Any of GrantConnect's 29 official category codes (e.g. `231` Health, Wellbeing and Medical Research; `381` Academic Research; `211` Environment, Energy and Resources). Several = union |
| `agencyNameContains` | string | - | Case-insensitive substring on the awarding agency - **applied client-side** (the public form has no agency parameter), so combine it with another filter |
| `recipientName` | string | - | Substring match on the recipient's legal name |
| `recipientAbn` | string | - | Exact 11-digit ABN, spaces optional - every Commonwealth grant that entity has received |
| `minValueAud`, `maxValueAud` | integer | - | Value range in AUD |
| `goId` | string | - | All awards under one Grant Opportunity (funding round), e.g. `GO6105` |
| `dateType` | string | `Publish Date` | Which date the window applies to: `Publish Date`, `Approval Date`, `Start Date`, `End Date`, or `Current` / `Closed` (running / ended grants, ignores the window) |
| `dateFrom`, `dateTo` | string | - | Absolute (`2026-07-01`) or relative (`7 days`, `3 months`, `1 year`) from today, Canberra time |
| `oneOffAdHoc`, `aggregateGrantAward` | string | `any` | `any`, `yes`, `no` |
| `eventTypes` | string[] | all three | Which of `NEW_LISTING`, `AWARD_VARIATION`, `UPDATED` to deliver |
| `onlyNew` | boolean | `false` | Delta mode - see Reliability below |
| `sortBy` | string | `Last Updated` | `Last Updated` (recommended and required for reliable monitoring), `Publish Date`, `Relevance` (needs a keyword) |
| `deltaStateName` | string | fingerprint of the filters | Name of the delta memory; share it between tasks on purpose, never by accident |
| `resetState` | boolean | `false` | Forget delivered awards for this delta state and re-baseline |
| `maxItems` | integer | `100` | Hard cap on delivered records per run (max `100000`); anything beyond the cap is delivered by the next run in delta mode |
| `fetchDetail` | boolean | `true` | Opens each award's page for recipient ABN, locations, purpose, program, GO link, selection process, confidentiality flags and agency contact. Off = cheaper listing-only records |
| `maxConcurrency` | integer | `5` | Parallel detail-page requests, 1-10 |

More ready-to-run examples: a full-archive daily monitor (`{ "onlyNew": true, "maxItems": 500 }`), an ABN lookup (`{ "recipientAbn": "46 101 325 642", "maxItems": 1000 }`), or ad hoc grants only (`{ "oneOffAdHoc": "yes", "dateType": "Approval Date", "dateFrom": "30 days", "fetchDetail": false }`).

## Quick start

Run it from the [Apify Console](https://apify.com/stefano_seggio/australia-grantconnect-monitor), the API, or the CLI:

```bash
apify call australia-grantconnect-monitor --input '{
  "categories": ["231"],
  "minValueAud": 500000,
  "onlyNew": true,
  "maxItems": 500
}'
```

That pulls Health, Wellbeing and Medical Research awards worth $500k+, in delta mode - the first run baselines, every scheduled run after it delivers only what GrantConnect published, varied or updated since. Swap the CLI for the `apify-client` SDK ([JS](https://docs.apify.com/api/client/js/) / [Python](https://docs.apify.com/api/client/python/)) to run it from your own code - see `examples/quickstart.js` and `examples/quickstart.py` in this repo for both.

## Output

One item per Grant Award record (fields trimmed for length here; every detail-fetched record carries 80+ fields):

```json
{
    "record_id": "GA578886",
    "event_type": "NEW_LISTING",
    "scraped_at": "2026-09-06T10:15:57.202Z",
    "is_new": true,
    "source_url": "https://www.grants.gov.au/Ga/Show/937de059-5cbb-415f-bc83-bcb5619e1379",
    "data_source": "GrantConnect (grants.gov.au), Australian Government Department of Finance, CC BY 3.0 AU",
    "gaId": "GA578886",
    "title": "The Activity is to support low volume and/or new commercial airline routes to regional and remote communities...",
    "agency": "Department of Infrastructure, Transport, Regional Development, Communications, Sport and the Arts",
    "category": "Transport",
    "publishDateIso": "2026-09-04",
    "lastUpdatedIso": "2026-09-04T06:16:00.000Z",
    "valueAud": "$225,000.00",
    "valueAudNumber": 225000,
    "valueBand": "100k-1M",
    "grantStartDateIso": "2026-09-04",
    "grantEndDateIso": "2027-11-30",
    "daysUntilGrantEnd": 450,
    "recipientName": "Regional Express Pty Ltd",
    "recipientEntityType": "company",
    "recipientAbn": "46 101 325 642",
    "recipientAbnNormalized": "46101325642",
    "recipientAbnValid": true,
    "abrLookupUrl": "https://abr.business.gov.au/ABN/View?abn=46101325642",
    "recipientState": "NSW",
    "deliveryState": "NSW",
    "deliveryPostcode": "2020",
    "approvalDateIso": "2026-08-21",
    "selectionProcess": "Demand Driven",
    "isOneOffAdHoc": false,
    "purpose": "To provide regional and remote communities with access to essential air services...",
    "grantProgram": "Airservices Australia Enroute Charges Payment Scheme",
    "goId": "GO6105",
    "goUrl": "https://www.grants.gov.au/Go/Show?GoUuid=706c1e7b-90df-4e26-b6e3-757c464a717f",
    "agencyContactEmail": "EGMO@infrastructure.gov.au",
    "detailFetched": true
}
```

A variation record looks the same with `"event_type": "AWARD_VARIATION"`, `"gaId": "GA270901-V1"`, `"variationNumber": 1`, `"baseGaId": "GA270901"` and a fresh `lastUpdatedIso`.

Fields group into: an **integration envelope** (`record_id`, `event_type`, `scraped_at`, `is_new`, `source_url`, `data_source` - identical across this developer's public-register Actors); **identity and listing data** (`gaId`, `title`, `agency`, `category`, `publishDateIso`, `lastUpdatedIso`, `valueAud` / `valueAudNumber` / `valueBand`, `grantStartDateIso` / `grantEndDateIso` / `grantTermDays` / `daysUntilGrantEnd` / `isCurrent`, `financialYear`, `recipientName`); **recipient data** (`recipientAbn` / `recipientAbnNormalized` / `recipientAbnValid` / `abrLookupUrl`, `recipientSuburb`, `recipientState`, `recipientPostcode`, `recipientEntityType`); **detail fields** fetched from the award page when `fetchDetail` is on (`approvalDateIso`, `purpose`, `grantProgram`, `grantActivity`, `goId` / `goTitle` / `goUrl`, `selectionProcess`, `isOneOffAdHoc`, `isAggregate`, confidentiality flags, `agencyContactName` / `Phone` / `Email`); and **delivery location** (`deliveryState`, `deliveryPostcode`, `deliverySuburb`, `deliveryCountry` - where the money is spent, which can differ from the recipient's own address). The Output tab also exposes five ready-made dataset views (Overview, Recipient directory, Programs & opportunities, Grant terms & expiry, Variations & updates) plus CSV, Excel and newest-first JSON links.

## Reliability

Delta mode (`onlyNew: true`) is a stateful watermark walk, not a page diff:

- Each delta configuration keeps its own memory in a named key-value store (`australia-grantconnect-monitor-state-<deltaStateName>`, defaulting to a hash of your filters so unrelated schedules never share state). The memory maps every delivered `gaId` to the `lastUpdatedIso` it carried, plus a watermark of the newest timestamp seen.
- The **first** run with `onlyNew: true` is the baseline: it delivers up to `maxItems` of the most recently updated matching awards and records a *baseline floor* if it was cut short, so older activity is treated as history rather than triggering a slow archive drain on every later run.
- Every **later** run walks the register in Last Updated order and stops once it reaches two consecutive already-known pages (or rows older than the watermark), so a quiet day costs only a couple of page fetches. If a run is itself truncated by `maxItems`, it records a *backlog floor* - the next run keeps walking through the already-known block down to that floor instead of stopping early and stranding undelivered rows.
- Records are pushed to the dataset **oldest-first** within a run, and the seen-map is written only for records actually stored (and, in pay-per-event mode, actually charged) - flushed immediately, and again on the platform's `migrating` / `aborting` events. So a spending limit, timeout or platform migration mid-run can never mark an undelivered award as "seen": the next run simply picks up where delivery stopped.
- The memory is capped at 50,000 timestamped entries (roughly a year of activity at typical volumes) and prunes the oldest first.
- Sorting by **Last Updated** rather than Publish Date is what makes variations and corrections visible at all: GrantConnect publishes a variation record (e.g. `GA270901-V1`) under the *original* award's publish date, so a publish-date-ordered walk would find it 100,000+ rows deep on the day it appears; ordered by Last Updated it is on page one and tagged `UPDATED` or `AWARD_VARIATION`.
- The Actor validates that every page it reads is a genuine listing page and fails the run loudly on a blocked, maintenance or unrecognised page, rather than reporting a false "0 results, success" - so a scheduled monitor alerts you if GrantConnect's markup changes instead of silently going quiet.

## Pricing (Pay-Per-Event)

Pay per event, platform usage included - you pay only for delivered records, never for compute:

| Event | Title | Price | When |
| --- | --- | --- | --- |
| `result` | Grant Award (full detail) | $0.003 per event | A record with the full detail page (80+ fields, `fetchDetail: true`) |
| `result-summary` | Grant Award (listing summary) | $0.001 per event | Listing-only record (`fetchDetail: false`, or a detail page that could not be fetched) |
| Actor start | - | $0.00005 | Once per run |

A daily monitor that finds a few dozen new or varied awards costs a few cents a day; a quiet run with nothing new costs only the start fee. A 500-record filtered pull with full detail runs to a few dollars; a large listing-only backfill (`fetchDetail: false`) is proportionally cheaper per record. Check the Actor's pricing tab for the current rate card before running at scale.

## Support & Enterprise SLA

This is an independently developed and maintained Actor, not a vendor product with a contracted enterprise SLA - please size expectations accordingly. Bug reports and feature requests go through the **Issues** tab on the Apify Store listing; issues are typically triaged within about a business day to two (roughly 48 hours), and versioned fixes are listed in the Actor's Changelog tab. Known scope limits are disclosed rather than hidden: Grant Opportunities (open funding rounds) are a separate register not covered here, `UPDATED` flags that a record changed without a field-level diff of what changed, and a full 360,000-record archive pull is possible but large enough that slicing by category or date is recommended instead.

---

This Actor is part of **Delta Registry** - pay-per-event regulatory & compliance data infrastructure built and operated by Stefano Seggio. For professional inquiries or enterprise licensing, connect on [LinkedIn](https://www.linkedin.com/in/stefanoseggio-deltaregistry); for the rest of the fleet, see [github.com/stefanoseggio](https://github.com/stefanoseggio).
