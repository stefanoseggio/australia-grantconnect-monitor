# Australian Government Grants Monitor - GrantConnect Awards Tracker (Grant Intelligence)

[![Built for Apify](https://img.shields.io/badge/Built%20for-Apify-FF9012?logo=apify&logoColor=white)](https://apify.com)
[![Pay-Per-Event](https://img.shields.io/badge/Pay--Per--Event-from%20%240.001-brightgreen)](https://apify.com/stefano_seggio/australia-grantconnect-monitor)
[![TypeScript](https://img.shields.io/badge/TypeScript-Actor-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Apache 2.0 License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)

[![Run on Apify](https://apify.com/ext/run-on-apify.png)](https://apify.com/stefano_seggio/australia-grantconnect-monitor)

**This Actor monitors GrantConnect (grants.gov.au) — Australia's official, 360,000+ record register of Commonwealth grant awards, which has no public API — on a schedule you configure, delivering only what's new, varied or updated since your last run.**

## Executive Value Proposition

GrantConnect (grants.gov.au) is the only complete, official record of who received Commonwealth grant money, from which agency, under which program and for how much - but the public site offers only a 15-rows-per-screen search form and a manual report capped at 50,000 rows, with no API, no CSV feed, no RSS and no email alert for awards (GrantConnect's own notifications cover funding *opportunities*, not awards already made). This Actor replaces that page-by-page browsing with structured JSON, CSV or Excel in minutes: the same filters as GrantConnect's Advanced Search run server-side, so a narrow query touches a handful of pages instead of the whole 360,000-record register, and every value arrives normalised (ISO dates, numeric AUD, checksummed ABN) instead of needing manual cleanup. Put it on a schedule with delta mode on and each run after the first returns only the awards that were published, varied or updated since the previous one - the ongoing monitoring GrantConnect itself does not offer.

## Who uses this

- **Grant-writing and consulting firms** track which agency just funded organisations like their client, under which program, using `agency`, `grantProgram`, `goId` and `selectionProcess` - the basis for pitching the next funding round or approaching a fresh winner about variation and re-application work.
- **Nonprofit and university funding-intelligence teams** scout which programs are funding peers in their sector this week (filter by `categories` and `recipientName`), and use `grantEndDateIso` / `daysUntilGrantEnd` to build a grants renewal calendar and spot consortium targets before a program's next round opens.
- **Government-relations and market-intelligence teams** watch a specific competitor, ABN or portfolio agency for a new or varied award (`recipientAbn`, `agency`, `event_type`, `isOneOffAdHoc`) to brief clients or prepare for Senate Estimates, and journalists use the same fields plus `selectionProcess` / `isContractConfidential` to flag large, closed or non-competitive grants worth a story or an FOI request.

## Cost & BYOK Disclosure

**Pricing model:** pay-per-event. You are billed only for delivered records plus a small flat per-run start fee — never for idle compute, and never for a record whose content hasn't changed since your last run.

| Event | What it means | Price |
| --- | --- | --- |
| `result` | A Grant Award record delivered with full award-page detail (`fetchDetail: true`, 80+ fields) | Pay-per-result — see the [live Store pricing tab](https://apify.com/stefano_seggio/australia-grantconnect-monitor) for the current exact rate |
| `result-summary` | A listing-only Grant Award record (`fetchDetail: false`, or a detail page that could not be fetched) | Pay-per-result — see the live Store pricing tab for the current exact rate |
| Actor start | Charged once per run, regardless of how many records are delivered | See the live Store pricing tab for the current exact rate |

Specific per-event rates have appeared in this Actor's own Store listing and in earlier README revisions; the Store's **Pricing** tab is the single, always-current source of truth, so it's linked above rather than a number restated here that could drift out of date. As a rule of thumb: a daily monitor that finds a few dozen new or varied awards costs a few cents a day, and a quiet run with nothing new costs only the start fee — always confirm the live rate before estimating cost at scale.

**Delta suppression, never a refund.** In delta mode (`onlyNew: true`), this Actor keeps a persisted watermark per filter set (see "Reliability & Delta Engine" below): a Grant Award whose `lastUpdatedIso` hasn't moved past what was already delivered is never pushed to the dataset and therefore never billed. That check happens *before* delivery on every run — it is not a refund applied after an unchanged record was already charged.

**BYOK:** This Actor requires no third-party API key. GrantConnect is a public Australian Government register with no login wall or provider key of any kind — every dependency it uses is free and already included in the Actor's price.

## Quickstart

Run it from the [Apify Console](https://apify.com/stefano_seggio/australia-grantconnect-monitor), the CLI, the REST API, or the `apify-client` SDK in Python or Node.js. Every example below pulls Health, Wellbeing and Medical Research awards worth $500k+, in delta mode - the first run baselines, every scheduled run after it delivers only what GrantConnect published, varied or updated since.

### Apify CLI

```bash
apify call australia-grantconnect-monitor --input '{
  "categories": ["231"],
  "minValueAud": 500000,
  "onlyNew": true,
  "maxItems": 500
}'
```

### cURL (instant, synchronous)

Runs synchronously and returns the resulting dataset items directly in the response - no polling needed. Get your token from [console.apify.com/settings/integrations](https://console.apify.com/settings/integrations).

```bash
curl -X POST "https://api.apify.com/v2/acts/gt7wS4T0uFRXDz49n/run-sync-get-dataset-items?token=<YOUR_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
  "maxItems": 50,
  "onlyNew": true
}'
```

### Python (`apify-client`)

```python
import os
from apify_client import ApifyClient

client = ApifyClient(os.environ["APIFY_TOKEN"])

run = client.actor("stefano_seggio/australia-grantconnect-monitor").call(
    run_input={
        "categories": ["231"],
        "minValueAud": 500000,
        "onlyNew": True,
        "maxItems": 500,
        "fetchDetail": True,
    }
)

dataset_items = client.dataset(run["defaultDatasetId"]).list_items().items
for item in dataset_items:
    print(f"{item['gaId']} | {item['recipientName']} | {item['valueAud']} | {item['agency']}")
```

A full runnable version of this script is at `examples/quickstart.py` in this repo.

### Node.js (`apify-client`)

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

const run = await client.actor('stefano_seggio/australia-grantconnect-monitor').call({
  categories: ['231'],
  minValueAud: 500000,
  onlyNew: true,
  maxItems: 500,
  fetchDetail: true,
});

const { items } = await client.dataset(run.defaultDatasetId).listItems();
for (const item of items) {
  console.log(`${item.gaId} | ${item.recipientName} | ${item.valueAud} | ${item.agency}`);
}
```

A full runnable version (CommonJS) is at `examples/quickstart.js` in this repo.

## Use this from Claude Desktop, Cursor, or Windsurf (via MCP)

This Actor is also reachable through Apify's own hosted `@apify/actors-mcp-server` at `https://mcp.apify.com`, scoped to just this one Actor via a `?tools=stefano_seggio/australia-grantconnect-monitor` query string - your MCP client gets tool access to this Actor alone, not the rest of the fleet. Get your own token from [Apify Console → Settings → Integrations](https://console.apify.com/settings/integrations) first.

**Claude Desktop** (`claude_desktop_config.json`) - uses the `mcp-remote` stdio bridge, not a direct URL. Note: `mcp-remote` does not expand shell environment variables inside this JSON string, so paste your real token literally in place of `${APIFY_TOKEN}` below, and keep this file out of version control:

```json
{
  "mcpServers": {
    "delta-registry-australia-grantconnect-monitor": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.apify.com/?tools=stefano_seggio/australia-grantconnect-monitor",
        "--header",
        "Authorization: Bearer ${APIFY_TOKEN}"
      ]
    }
  }
}
```

**Cursor** (`.cursor/mcp.json` or `~/.cursor/mcp.json`) - native HTTP transport:

```json
{
  "mcpServers": {
    "delta-registry-australia-grantconnect-monitor": {
      "url": "https://mcp.apify.com/?tools=stefano_seggio/australia-grantconnect-monitor",
      "headers": {
        "Authorization": "Bearer ${APIFY_TOKEN}"
      }
    }
  }
}
```

**Windsurf** (`~/.codeium/windsurf/mcp_config.json`) - uses `serverUrl`, not `url`. Unlike Claude Desktop's `mcp-remote` bridge, Windsurf's `${env:...}` syntax genuinely resolves from your environment at runtime:

```json
{
  "mcpServers": {
    "delta-registry-australia-grantconnect-monitor": {
      "serverUrl": "https://mcp.apify.com/?tools=stefano_seggio/australia-grantconnect-monitor",
      "headers": {
        "Authorization": "Bearer ${env:APIFY_TOKEN}"
      }
    }
  }
}
```

Want every actor in the fleet available to one MCP client instead of just this one? See [`delta-registry-website/MCP_INTEGRATION.md`](https://github.com/stefanoseggio/delta-registry-website/blob/main/MCP_INTEGRATION.md) for the full 28-actor closed-scope config.

## Input & Output Schema

### Input

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
| `eventTypes` | string[] | all four | Which of `NEW_LISTING`, `AWARD_VARIATION`, `UPDATED`, `UNCHANGED` to deliver. `UNCHANGED` only ever appears in full mode (`onlyNew: false`) - a previously delivered award re-served as-is because Last Updated hasn't moved; delta mode never delivers these at all |
| `onlyNew` | boolean | `false` | Delta mode - see Reliability below |
| `sortBy` | string | `Last Updated` | `Last Updated` (recommended and required for reliable monitoring), `Publish Date`, `Relevance` (needs a keyword) |
| `deltaStateName` | string | fingerprint of the filters | Name of the delta memory; share it between tasks on purpose, never by accident |
| `resetState` | boolean | `false` | Forget delivered awards for this delta state and re-baseline |
| `maxItems` | integer | `100` | Hard cap on delivered records per run (max `100000`); anything beyond the cap is delivered by the next run in delta mode |
| `fetchDetail` | boolean | `true` | Opens each award's page for recipient ABN, locations, purpose, program, GO link, selection process, confidentiality flags and agency contact. Off = cheaper listing-only records |
| `maxConcurrency` | integer | `5` | Parallel detail-page requests, 1-10 |

More ready-to-run examples: a full-archive daily monitor (`{ "onlyNew": true, "maxItems": 500 }`), an ABN lookup (`{ "recipientAbn": "46 101 325 642", "maxItems": 1000 }`), or ad hoc grants only (`{ "oneOffAdHoc": "yes", "dateType": "Approval Date", "dateFrom": "30 days", "fetchDetail": false }`).

### Output

One item per Grant Award record (fields trimmed for length here; every detail-fetched record carries 80+ fields). This is a real record from this Actor's own dataset, matching `.actor/dataset_schema.json`:

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

A variation record looks the same with `"event_type": "AWARD_VARIATION"`, `"gaId": "GA270901-V1"`, `"variationNumber": 1`, `"baseGaId": "GA270901"` and a fresh `lastUpdatedIso"`.

Run with `onlyNew: false` (the default) against a filter set you've already run before, and the same award comes back with `"event_type": "UNCHANGED"`, `"is_new": false` once its `lastUpdatedIso` stops advancing - it is being re-served as part of that run's full matching set, not re-announced as new. Delta mode (`onlyNew: true`) never delivers `UNCHANGED` rows at all; they're suppressed before delivery (see "Reliability & Delta Engine").

| Field | Description |
| --- | --- |
| `record_id`, `event_type`, `scraped_at`, `is_new`, `source_url`, `data_source` | Integration envelope, identical across this developer's public-register Actors |
| `gaId` | GrantConnect's own award identifier; suffixed `-V1`, `-V2` etc. for a variation record |
| `title`, `purpose`, `grantProgram`, `grantActivity` | The award's own title, funded purpose, and the program/activity it was made under |
| `agency`, `category` | The Commonwealth agency that made the award, and its GrantConnect category |
| `publishDateIso`, `lastUpdatedIso`, `approvalDateIso` | When the award was published, last changed on GrantConnect, and approved |
| `valueAud`, `valueAudNumber`, `valueBand` | The award's value as GrantConnect displays it, as a plain number, and bucketed into a value band |
| `grantStartDateIso`, `grantEndDateIso`, `daysUntilGrantEnd`, `isCurrent`, `financialYear` | The grant's term and how much of it remains |
| `recipientName`, `recipientEntityType` | The recipient's legal name and entity type (e.g. company, individual) |
| `recipientAbn`, `recipientAbnNormalized`, `recipientAbnValid`, `abrLookupUrl` | The recipient's Australian Business Number as displayed, digits-only, whether it passes ABN checksum validation, and a ready link to the Australian Business Register |
| `recipientState`, `recipientSuburb`, `recipientPostcode` | The recipient's registered location |
| `deliveryState`, `deliveryPostcode`, `deliverySuburb`, `deliveryCountry` | Where the grant money is actually spent, which can differ from the recipient's own address |
| `selectionProcess`, `isOneOffAdHoc`, `isAggregate` | How the award was selected, and whether it's a one-off/ad hoc or a multi-recipient aggregate award |
| `isContractConfidential` | Whether GrantConnect flags the award's contract terms as confidential |
| `goId`, `goTitle`, `goUrl` | The Grant Opportunity (funding round) this award was made under, and a link to it |
| `agencyContactName`, `agencyContactPhone`, `agencyContactEmail` | The awarding agency's published contact for this grant |
| `detailFetched` | Whether the award's detail page was actually opened this run (`fetchDetail: true`) or this is a listing-only summary |

The Output tab also exposes five ready-made dataset views (Overview, Recipient directory, Programs & opportunities, Grant terms & expiry, Variations & updates) plus CSV, Excel and newest-first JSON links.

## Reliability & Delta Engine

Delta mode (`onlyNew: true`) is a stateful watermark walk, not a page diff:

- Full mode (`onlyNew: false`, the default) re-walks and re-delivers every award matching your filters on every run, up to `maxItems` - it is a snapshot, not a diff. It shares the same delta memory as delta mode (so a later `onlyNew: true` run on the same `deltaStateName` knows what's already gone out), which is why a previously delivered award whose `lastUpdatedIso` hasn't moved comes back labeled `UNCHANGED` rather than `NEW_LISTING`/`AWARD_VARIATION` - it truthfully reflects that nothing changed, it was just re-served.
- Each delta configuration keeps its own memory in a named key-value store (`australia-grantconnect-monitor-state-<deltaStateName>`, defaulting to a hash of your filters so unrelated schedules never share state). The memory maps every delivered `gaId` to the `lastUpdatedIso` it carried, plus a watermark of the newest timestamp seen.
- The **first** run with `onlyNew: true` is the baseline: it delivers up to `maxItems` of the most recently updated matching awards and records a *baseline floor* if it was cut short, so older activity is treated as history rather than triggering a slow archive drain on every later run.
- Every **later** run walks the register in Last Updated order and stops once it reaches two consecutive already-known pages (or rows older than the watermark), so a quiet day costs only a couple of page fetches. If a run is itself truncated by `maxItems`, it records a *backlog floor* - the next run keeps walking through the already-known block down to that floor instead of stopping early and stranding undelivered rows.
- Records are pushed to the dataset **oldest-first** within a run, and the seen-map is written only for records actually stored (and, in pay-per-event mode, actually charged) - flushed immediately, and again on the platform's `migrating` / `aborting` events. So a spending limit, timeout or platform migration mid-run can never mark an undelivered award as "seen": the next run simply picks up where delivery stopped.
- The memory is capped at 50,000 timestamped entries (roughly a year of activity at typical volumes) and prunes the oldest first.
- Sorting by **Last Updated** rather than Publish Date is what makes variations and corrections visible at all: GrantConnect publishes a variation record (e.g. `GA270901-V1`) under the *original* award's publish date, so a publish-date-ordered walk would find it 100,000+ rows deep on the day it appears; ordered by Last Updated it is on page one and tagged `UPDATED` or `AWARD_VARIATION`.
- The Actor validates that every page it reads is a genuine listing page and fails the run loudly on a blocked, maintenance or unrecognised page, rather than reporting a false "0 results, success" - so a scheduled monitor alerts you if GrantConnect's markup changes instead of silently going quiet.

## Contributing & Local Setup

This repository contains the Actor's real, buildable TypeScript source (`src/`), not just documentation - so local development against real data is genuinely possible:

```bash
git clone https://github.com/stefanoseggio/australia-grantconnect-monitor.git
cd australia-grantconnect-monitor
npm install
apify login              # paste your Apify API token
npm run start:dev        # tsx src/main.ts - runs the Actor locally against the real GrantConnect site
npm test                 # vitest run
```

`npm run build` compiles with `tsc`, and `npm run lint` / `npm run format` run this repo's ESLint/Prettier config. Found a bug, or want a new filter, output field or jurisdiction covered? Open an issue or pull request on this GitHub repo, or use the **Issues** tab on the [Apify Store listing](https://apify.com/stefano_seggio/australia-grantconnect-monitor) for operational reports against the live Actor.

## Support & Enterprise SLA

This is an independently developed and maintained Actor, not a vendor product with a contracted enterprise SLA - please size expectations accordingly. Bug reports and feature requests go through the **Issues** tab on the Apify Store listing; issues are typically triaged within about a business day to two (roughly 48 hours), and versioned fixes are listed in the Actor's Changelog tab. Known scope limits are disclosed rather than hidden: Grant Opportunities (open funding rounds) are a separate register not covered here, `UPDATED` flags that a record changed without a field-level diff of what changed, and a full 360,000-record archive pull is possible but large enough that slicing by category or date is recommended instead.

---

This Actor is part of **Delta Registry** - pay-per-event regulatory & compliance data infrastructure built and operated by Stefano Seggio. For professional inquiries or enterprise licensing, connect on [LinkedIn](https://www.linkedin.com/in/stefanoseggio-deltaregistry); for the rest of the fleet, see [github.com/stefanoseggio](https://github.com/stefanoseggio).
