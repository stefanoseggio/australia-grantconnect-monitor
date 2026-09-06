# GrantConnect Grant Awards Scraper & Monitor

**The Australian Government grants API that GrantConnect never shipped.** This Actor turns the whole-of-government **Grant Awards register on GrantConnect (grants.gov.au)** - every grant a Commonwealth entity has awarded since December 2017, 360,000+ records - into clean JSON/CSV with **recipient, ABN, agency, value, purpose, program, locations, dates and agency contact**, and keeps it fresh: put it on a schedule with _Only new_ switched on and each run returns just the awards that were **published, varied or updated since the last run**, in seconds.

[![GrantConnect Grant Awards Scraper & Monitor](https://apify.com/actor-badge?actor=stefano_seggio/australia-grantconnect-monitor)](https://apify.com/stefano_seggio/australia-grantconnect-monitor)

- **Search like the site, at API speed** - keyword, 29 categories, recipient name or ABN, value range, Grant Opportunity ID, ad hoc / aggregate flags and any date window are applied by GrantConnect itself, so a narrow run touches a handful of pages.
- **See what nobody else sees** - variations and corrections keep their original publish date on GrantConnect, so date-ordered scrapers and email alerts miss them. This Actor orders by _Last Updated_ and tags every row `NEW_LISTING`, `AWARD_VARIATION` or `UPDATED`.
- **Warehouse-ready, not screen-scraped** - every raw site string comes with a normalised twin: ISO dates, numeric AUD value, 11-digit ABN with checksum and ABR link, grant term in days, days until expiry, Australian financial year, recipient entity type, delivery location.
- **No browser, no proxy, no login.** Plain HTTP, 256 MB of memory, pay per record.

## What is GrantConnect and who won Australian Government grants?

GrantConnect is run by the Department of Finance. Under the Commonwealth Grants Rules and Principles every non-corporate Commonwealth entity must publish each grant it awards - and each variation - within 21 days of the agreement taking effect. The result is the only complete, official record of _who received Commonwealth grant money, from which agency, under which program and for how much_: ANAO counts 215,000+ grants worth $118 billion (plus $36 billion in variations) on the register.

The site has a search form and a capped manual report (50,000 rows), but **no API, no CSV feed of the awards register, no RSS for awards and no email alert for awards** (its notifications only cover _opportunities_). This Actor is that missing layer. Start from the register at [grants.gov.au/Ga/List](https://www.grants.gov.au/Ga/List).

## Quick start

1. Click **Try for free**. The default input returns the 100 most recently updated awards with full detail - about 30 seconds and $0.30.
2. Open the **Output** tab: five ready-made views (Overview, Recipient directory, Programs & opportunities, Grant terms & expiry, Variations & updates) or export **JSON, CSV or Excel**.
3. Narrow it: pick categories, set _Minimum value_, type a recipient name or ABN, or set _Date from_ to `30 days`.
4. Monitor it: keep **Only new** on, add an [Apify Schedule](https://docs.apify.com/platform/schedules) (every 6 or 24 hours) and a [webhook](https://docs.apify.com/platform/integrations/webhooks) or the Slack / Make / Zapier integration. From the second run on, you only pay for what actually changed.

## Who uses Australian grant award data

| Team                                      | Question they ask                                                                                        | Fields that answer it                                                                                | Decision                                                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Grant consultants & bid writers           | Which agency just funded organisations like my client, under which program?                              | `agency`, `grantProgram`, `goId`, `valueAudNumber`, `selectionProcess`                               | Pitch the next round of that program; approach fresh winners for variation and re-application work |
| University & research-office intelligence | Which MRFF / DISR / CRC awards went to peer institutions this week?                                      | categories 231 + 381, `recipientName`, `purpose`                                                     | Share-of-wallet dashboards, partner scouting                                                       |
| NFP fundraising & prospect research       | Which programs fund peers in my sector, and when do their grants expire?                                 | `category`, `goId`, `grantEndDateIso`, `daysUntilGrantEnd`                                           | Grants calendar, consortium targets, CRM enrichment keyed on ABN                                   |
| Suppliers to grant recipients             | Who just received money to build, buy or deliver something in my region?                                 | `deliveryState`, `deliveryPostcode`, `valueBand`, `purpose`                                          | Account-based outreach within days of the award, not months                                        |
| Government relations & lobbying           | Did a competitor, an ABN or a portfolio agency get a new or varied award?                                | `recipientAbn`, `agency`, `event_type`, `isOneOffAdHoc`                                              | Client alerts and Estimates briefings                                                              |
| Journalists & integrity researchers       | Which large, closed, non-competitive or ad hoc grants landed this week, and how late were they reported? | `selectionProcess`, `isOneOffAdHoc`, `approvalDateIso` vs `publishDateIso`, `isContractConfidential` | Stories, FOI requests, audits                                                                      |
| Data vendors, credit & KYB                | Does this ABN receive Commonwealth funding, how much, since when?                                        | `recipientAbnNormalized`, `valueAudNumber`, `grantStartDateIso`                                      | Enrichment attribute on company profiles                                                           |

## Sample output

One real record (fields trimmed for length; every record carries all 80+ fields listed below):

```json
{
    "record_id": "GA578886",
    "event_type": "NEW_LISTING",
    "scraped_at": "2026-09-06T10:15:57.202Z",
    "is_new": true,
    "source_url": "https://www.grants.gov.au/Ga/Show/937de059-5cbb-415f-bc83-bcb5619e1379",
    "data_source": "GrantConnect (grants.gov.au), Australian Government Department of Finance, CC BY 3.0 AU",
    "gaId": "GA578886",
    "gaUuid": "937de059-5cbb-415f-bc83-bcb5619e1379",
    "isVariation": false,
    "baseGaId": "GA578886",
    "title": "The Activity is to support low volume and/or new commercial airline routes to regional and remote communities...",
    "agency": "Department of Infrastructure, Transport, Regional Development, Communications, Sport and the Arts",
    "category": "Transport",
    "publishDate": "4-Sep-2026",
    "publishDateIso": "2026-09-04",
    "lastUpdated": "4-Sep-2026 4:16 pm (ACT Local Time)",
    "lastUpdatedIso": "2026-09-04T06:16:00.000Z",
    "valueAud": "$225,000.00",
    "valueAudNumber": 225000,
    "valueBand": "100k-1M",
    "grantTerm": "4-Sep-2026 to 30-Nov-2027",
    "grantStartDateIso": "2026-09-04",
    "grantEndDateIso": "2027-11-30",
    "grantTermDays": 453,
    "daysUntilGrantEnd": 450,
    "isCurrent": true,
    "financialYear": "2026-27",
    "recipientName": "Regional Express Pty Ltd",
    "recipientEntityType": "company",
    "recipientAbn": "46 101 325 642",
    "recipientAbnNormalized": "46101325642",
    "recipientAbnValid": true,
    "abrLookupUrl": "https://abr.business.gov.au/ABN/View?abn=46101325642",
    "recipientSuburb": "MASCOT",
    "recipientState": "NSW",
    "recipientPostcode": "2020",
    "deliveryState": "NSW",
    "deliveryPostcode": "2020",
    "approvalDateIso": "2026-08-21",
    "selectionProcess": "Demand Driven",
    "isOneOffAdHoc": false,
    "isAggregate": false,
    "isContractConfidential": false,
    "pbsProgramName": "ITRDCSA 26/27 2.3 Air Transport",
    "grantProgram": "Airservices Australia Enroute Charges Payment Scheme",
    "purpose": "To provide regional and remote communities with access to essential air services...",
    "goId": "GO6105",
    "goTitle": "Airservices Australia Enroute Charges Payment Scheme",
    "goUrl": "https://www.grants.gov.au/Go/Show?GoUuid=706c1e7b-90df-4e26-b6e3-757c464a717f",
    "agencyContactEmail": "EGMO@infrastructure.gov.au",
    "detailFetched": true
}
```

A variation looks the same with `"event_type": "AWARD_VARIATION"`, `"gaId": "GA270901-V1"`, `"variationNumber": 1`, `"baseGaId": "GA270901"`, `"variesUrl": "https://www.grants.gov.au/Ga/Show/..."`, `"variationDateIso": "2023-11-22"` and a fresh `lastUpdatedIso`.

## Output fields

**Integration envelope** (identical across all of this developer's public-register Actors, so one webhook parser serves them all):

| Field         | Type    | Description                                                                                                                                                                        |
| ------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `record_id`   | string  | Same as `gaId` - stable across runs                                                                                                                                                |
| `event_type`  | string  | `NEW_LISTING` (fresh award), `AWARD_VARIATION` (an amendment record such as `GA270901-V1`), `UPDATED` (a previously delivered award whose _Last Updated_ stamp moved - delta mode) |
| `scraped_at`  | string  | ISO-8601 UTC timestamp of the extraction                                                                                                                                           |
| `is_new`      | boolean | `true` if never delivered by a previous run of this delta memory                                                                                                                   |
| `source_url`  | string  | The official GrantConnect record page                                                                                                                                              |
| `data_source` | string  | Attribution string (CC BY 3.0 AU)                                                                                                                                                  |

**Award** - raw site strings are kept verbatim; normalised twins sit next to them:

| Group                        | Fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity                     | `gaId`, `gaUuid`, `isVariation`, `variationNumber`, `baseGaId`, `variesGaId`, `variesUrl`, `title`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Listing                      | `agency`, `category` (sub-category label), `publishDate` / `publishDateIso`, `lastUpdated` / `lastUpdatedIso` (Canberra time converted to UTC), `valueAud` / `valueAudNumber` / `valueBand`, `grantTerm` / `grantStartDate` / `grantEndDate` / `grantStartDateIso` / `grantEndDateIso` / `grantTermDays` / `daysUntilGrantEnd` / `isCurrent`, `financialYear`, `grantStartFinancialYear`, `recipientName`, `recipientEntityType`                                                                                                                                              |
| Detail (`fetchDetail: true`) | `agencyCurrentName`, `approvalDate` / `approvalDateIso`, `variationPublishDate(Iso)`, `variationDate(Iso)`, `oneOffAdHoc` / `isOneOffAdHoc`, `aggregateGrantAward` / `isAggregate`, `aggregateReason`, `numberOfAwardsAggregated`, `gstInclusive`, `pbsProgramName`, `grantProgram`, `grantActivity`, `purpose`, `goId`, `goUuid`, `goTitle`, `goUrl`, `internalReferenceId`, `selectionProcess`, `confidentialityContract` / `isContractConfidential` / `confidentialityReasonContract`, `confidentialityOutputs` / `isOutputsConfidential` / `confidentialityReasonOutputs` |
| Recipient                    | `recipientAbn`, `recipientAbnNormalized` (11 digits), `recipientAbnValid` (ABR checksum), `abrLookupUrl`, `recipientSuburb`, `recipientTownCity`, `recipientPostcode`, `recipientState`, `recipientCountry`                                                                                                                                                                                                                                                                                                                                                                   |
| Delivery location            | `deliverySuburb`, `deliveryTownCity`, `deliveryPostcode`, `deliveryState`, `deliveryCountry` (where the money is spent - often differs from the recipient's address, e.g. `ACT, VIC` / `Multiple`)                                                                                                                                                                                                                                                                                                                                                                            |
| Contact                      | `agencyContactName`, `agencyContactPhone`, `agencyContactEmail`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Provenance                   | `detailFetched`, `detailError` (`NOT_FOUND` when an award page was withdrawn between listing and detail)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Records are appended **oldest-first within a run** (that is what makes delta mode crash-safe - see _How monitoring works_). The Output views show newest first; on the API add `?desc=true`.

## Input

Every filter is applied server-side by GrantConnect unless marked otherwise.

| Field                                | Type     | Default                    | Description                                                                                                                                                                  |
| ------------------------------------ | -------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keyword`, `keywordMatch`            | string   | - / `AllWord`              | Full-text search; `AllWord`, `AnyWord` or `ExactPhrase`                                                                                                                      |
| `categories`                         | string[] | `[]`                       | Any of the 29 official category codes (`231` Health, Wellbeing and Medical Research; `381` Academic Research; `211` Environment, Energy and Resources; ...). Several = union |
| `agencyNameContains`                 | string   | -                          | Substring on the awarding agency (**client-side**; combine with another filter)                                                                                              |
| `recipientName`                      | string   | -                          | Substring on the recipient's legal name                                                                                                                                      |
| `recipientAbn`                       | string   | -                          | Exact 11-digit ABN, spaces optional                                                                                                                                          |
| `minValueAud`, `maxValueAud`         | integer  | -                          | Value range in AUD                                                                                                                                                           |
| `goId`                               | string   | -                          | All awards under one Grant Opportunity, e.g. `GO6105`                                                                                                                        |
| `dateType`                           | string   | `Publish Date`             | Which date the window applies to: `Publish Date`, `Approval Date`, `Start Date`, `End Date`, or `Current` / `Closed` (running / ended grants, no window)                     |
| `dateFrom`, `dateTo`                 | string   | -                          | `2026-07-01` or relative `7 days`, `3 months`, `1 year` (Canberra calendar)                                                                                                  |
| `oneOffAdHoc`, `aggregateGrantAward` | string   | `any`                      | `any`, `yes`, `no`                                                                                                                                                           |
| `eventTypes`                         | string[] | all three                  | Which of `NEW_LISTING`, `AWARD_VARIATION`, `UPDATED` to deliver                                                                                                              |
| `onlyNew`                            | boolean  | `false`                    | Delta mode - see below                                                                                                                                                       |
| `sortBy`                             | string   | `Last Updated`             | `Last Updated` (recommended), `Publish Date`, `Relevance` (needs a keyword)                                                                                                  |
| `deltaStateName`                     | string   | fingerprint of the filters | Name of the delta memory; share it between tasks on purpose, never by accident                                                                                               |
| `resetState`                         | boolean  | `false`                    | Forget delivered awards and re-baseline                                                                                                                                      |
| `maxItems`                           | integer  | `100`                      | Cap on delivered records per run (and on cost). Max 100,000                                                                                                                  |
| `fetchDetail`                        | boolean  | `true`                     | Open each award page for ABN, locations, purpose, program, GO link, selection process, confidentiality, contact                                                              |
| `maxConcurrency`                     | integer  | `5`                        | Parallel award-page requests (1-10)                                                                                                                                          |

### Ready-to-run examples

**Daily monitor of everything new, varied or updated**

```json
{ "onlyNew": true, "maxItems": 500 }
```

**Health & medical research awards over $500k, monitored**

```json
{ "categories": ["231"], "minValueAud": 500000, "onlyNew": true, "maxItems": 500 }
```

**Everything one organisation has ever received (lookup by ABN)**

```json
{ "recipientAbn": "46 101 325 642", "maxItems": 1000 }
```

**Ad hoc (non-competitive) grants approved in the last 30 days, no detail pages**

```json
{ "oneOffAdHoc": "yes", "dateType": "Approval Date", "dateFrom": "30 days", "fetchDetail": false, "maxItems": 2000 }
```

**Grants expiring in the next financial year (renewal pipeline)**

```json
{ "dateType": "End Date", "dateFrom": "2027-07-01", "dateTo": "2028-06-30", "maxItems": 5000 }
```

**Only variations / amendments, across the register**

```json
{ "eventTypes": ["AWARD_VARIATION"], "maxItems": 200 }
```

## How monitoring works (delta mode)

1. The first run with `onlyNew: true` delivers up to `maxItems` of the most recently updated awards that match your filters and remembers each one's _Last Updated_ timestamp in a private, named key-value store (`australia-grantconnect-monitor-state-<deltaStateName>`).
2. Every later run walks the register in _Last Updated_ order, stops as soon as it meets two consecutive pages it already knows (or rows older than its watermark), and delivers only rows that are new (`NEW_LISTING` / `AWARD_VARIATION`) or whose timestamp moved (`UPDATED`). A quiet day costs two page fetches and a few cents of start fee.
3. Memory is written **only for records that were actually stored** - and records are delivered oldest-first - so a spending limit, a timeout or a platform migration half-way never loses an award: the next run simply picks it up. The memory holds about a year of activity (50,000 entries).
4. Different filter sets get different memories automatically; set `deltaStateName` to share one deliberately, `resetState: true` to start over.

Why _Last Updated_ and not _Publish Date_? Because GrantConnect publishes a variation (`GA270901-V1`) with the **original** award's publish date. Ordered by publish date it sits 100,000 rows deep on the day it appears; ordered by last updated it is on page one.

## Scheduling and alerts: Slack, email, Make, Zapier, n8n, Google Sheets

- **Apify Schedule + webhook** - schedule the task, add a webhook on `ACTOR.RUN.SUCCEEDED` pointing at your endpoint; the payload links the dataset and every item already carries the envelope, so no parser is needed. Read the items newest-first with `?desc=true`.
- **Slack** - the native [Apify Slack integration](https://apify.com/integrations/slack) posts each run's results to a channel.
- **Make** - _Apify > Watch Actor Runs_ -> _Get Dataset Items_ -> Slack / Gmail / Google Sheets ([apify.com/integrations/make](https://apify.com/integrations/make)).
- **Zapier** - _Apify: Finished Actor Run_ -> _Get Dataset Items_ -> anything ([apify.com/integrations/zapier](https://apify.com/integrations/zapier)).
- **n8n** - the Apify node, same pattern.
- **Google Sheets** - the [Apify Google Sheets integration](https://apify.com/integrations/google-sheets), or `=IMPORTDATA("https://api.apify.com/v2/datasets/<datasetId>/items?format=csv&desc=true&token=<token>")` (the token is then visible in the sheet - use a read-only token).

## Use it from code

**Node.js**

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: 'YOUR_TOKEN' });
const run = await client.actor('stefano_seggio/australia-grantconnect-monitor').call({
    categories: ['231'],
    minValueAud: 500000,
    onlyNew: true,
    maxItems: 500,
});
const { items } = await client.dataset(run.defaultDatasetId).listItems({ desc: true });
for (const award of items) {
    console.log(award.event_type, award.recipientName, award.valueAudNumber, award.source_url);
}
```

**Python**

```python
from apify_client import ApifyClient

client = ApifyClient("YOUR_TOKEN")
run = client.actor("stefano_seggio/australia-grantconnect-monitor").call(
    run_input={"recipientAbn": "46 101 325 642", "maxItems": 1000}
)
for award in client.dataset(run["defaultDatasetId"]).iterate_items():
    print(award["gaId"], award["agency"], award["valueAudNumber"], award["grantEndDateIso"])
```

**cURL (synchronous, up to 300 s - fine for delta runs and small pulls)**

```bash
curl -X POST "https://api.apify.com/v2/acts/stefano_seggio~australia-grantconnect-monitor/run-sync-get-dataset-items?token=YOUR_TOKEN&desc=true" \
  -H "Content-Type: application/json" \
  -d '{"onlyNew": true, "maxItems": 500}'
```

For large backfills start the run asynchronously (`/runs`) and read the dataset when the webhook fires.

**Apify CLI**

```bash
apify call stefano_seggio/australia-grantconnect-monitor --input '{"keyword":"solar","keywordMatch":"AnyWord","maxItems":200}' --output-dataset
```

**AI agents (MCP)** - add `https://mcp.apify.com/?tools=stefano_seggio/australia-grantconnect-monitor` as an MCP server and ask: _"List Australian Government grants over $1M in Health published in the last 7 days."_

## How much does it cost to scrape GrantConnect?

Pay per event, platform usage included - you pay only for records, never for compute:

| Event            | Price                | When                                                                                   |
| ---------------- | -------------------- | -------------------------------------------------------------------------------------- |
| `result`         | **$0.003** per award | A record with the full detail page (80+ fields)                                        |
| `result-summary` | **$0.001** per award | Listing-only record (`fetchDetail: false`, or an award page that could not be fetched) |
| Actor start      | $0.00005             | Once per run                                                                           |

Worked examples: a daily monitor that finds 40 new or varied awards costs about **$0.12/day**; a 500-record filtered pull with detail **$1.50**; a 10,000-record listing-only backfill **$10**. A quiet monitoring run with nothing new costs the start fee only. The Apify free plan's monthly credit covers well over a thousand detailed records.

Compare: a subscription grants directory costs A$29-A$85 per month and does not carry awarded-grant data at all; an analyst copying 500 awards by hand from the site takes most of a day.

## This Actor vs. the alternatives

|                      | This Actor                                                                               | Manual GrantConnect search                   | GrantConnect reports             | AusTender scrapers                |
| -------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------- | --------------------------------- |
| Coverage             | Entire Grant Awards register, all agencies, since Dec 2017                               | Same, 15 rows per screen                     | Capped at 50,000 rows per report | Procurement contracts, not grants |
| Export               | JSON, CSV, Excel, API, webhooks                                                          | Screen only                                  | Manual form, no automation       | JSON/CSV                          |
| New-award alerts     | Delta mode + schedule + Slack/webhook                                                    | None (email alerts cover opportunities only) | None                             | Varies                            |
| Variations & updates | Detected and tagged (`AWARD_VARIATION`, `UPDATED`)                                       | Buried under the original publish date       | Not distinguished                | n/a                               |
| Fields               | 80+ incl. ABN (validated), delivery location, contact, ISO dates, numeric value          | 7 listing columns                            | ~20 columns                      | Contract fields                   |
| Filters              | Keyword, 29 categories, recipient / ABN, value, GO ID, ad hoc, aggregate, any date field | Same form, by hand                           | Agency, dates, category          | Varies                            |
| Time for 500 records | ~1-2 minutes                                                                             | Hours                                        | Minutes + manual cleanup         | n/a                               |

## Where the data comes from, legality and attribution

The Actor reads the public, logged-out GrantConnect website operated by the Department of Finance. It bypasses no login, CAPTCHA or access control (it sends a normal browser `User-Agent`, which the site's CDN requires), respects `robots.txt` (`/Ga/*` is permitted), and paces requests politely. GrantConnect content is published under the [Creative Commons Attribution 3.0 Australia licence](https://creativecommons.org/licenses/by/3.0/au/): reuse and redistribution, including commercial, are allowed with attribution - every record carries a `data_source` string for that purpose. Recipient names, ABNs and locations are published by law under the Commonwealth Grants Rules and Principles; some recipients are individuals or sole traders, so handle the data in line with the Privacy Act 1988 and do not enrich individuals with third-party personal data. This Actor is not affiliated with or endorsed by the Department of Finance or the Australian Government.

## Honest limits

- Grant **Opportunities** (open funding rounds, `/Go/List`) are a different register and are not covered here.
- `UPDATED` tells you a known award changed, not which field changed (no snapshot diff yet).
- `category` is the sub-category label GrantConnect shows on the record; the 29 codes are an input filter, not an output field.
- There is no server-side agency filter on the public site; `agencyNameContains` is applied after fetching each listing page.
- `recipientEntityType` is a heuristic on the legal name, not an ABR lookup.
- A full-archive pull (360,000 records) is possible but is 24,000 listing pages; slice it by category or date instead, or ask for the bulk export mode on the roadmap.
- Site markup changes can break extraction; the Actor fails loudly (never "0 results, success") and is monitored.

## FAQ

### Is there a GrantConnect API?

No public one. GrantConnect offers a search form, capped reports and opportunity-only notifications. This Actor is the programmable interface to the awards register.

### How do I get alerts when new Australian Government grants are awarded?

Run this Actor on a schedule with `onlyNew: true` and connect a webhook, Slack, Make or Zapier. Each run delivers only the awards that appeared, were varied or were updated since the previous run.

### Can I filter by agency, recipient, ABN, category or value?

Yes - recipient name, ABN, categories, value range, Grant Opportunity, ad hoc / aggregate flags and any date field are applied by GrantConnect itself; agency is matched client-side on the listing.

### How far back does the data go?

Mandatory reporting started on 31 December 2017. Use `dateFrom` / `dateTo` (any of Publish, Approval, Start or End date) to slice the archive.

### How often is GrantConnect updated?

Agencies must report within 21 days of an agreement taking effect; in practice dozens to a few hundred awards and variations land every business day. Running every 6-24 hours is plenty.

### What is the difference between NEW_LISTING, AWARD_VARIATION and UPDATED?

`NEW_LISTING` is a brand-new award. `AWARD_VARIATION` is a separate amendment record GrantConnect publishes when value or term changes (`GA270901-V1` varies `GA270901`). `UPDATED` is an award you already received whose _Last Updated_ stamp moved (a correction, a republished record).

### Can I export GrantConnect data to CSV or Excel?

Yes - every run's dataset can be downloaded as JSON, CSV, Excel or XML from the Output tab or the API.

### Do I need a proxy?

No. The site is reachable from Apify's datacenter IPs; the only requirement (a browser `User-Agent`) is built in.

### What happens if the site changes?

The Actor validates every page it reads and fails the run instead of silently returning nothing, so your schedule alerts you. Report anything odd in the Issues tab.

### Is scraping GrantConnect legal?

The data is public, published by law and licensed CC BY 3.0 AU; the paths used are allowed by `robots.txt`. See _Where the data comes from_ above.

## Related Actors and roadmap

Same envelope, same delta engine, other registers by the same developer: [UK HSE Enforcement Monitor](https://apify.com/stefano_seggio/uk-hse-enforcement-monitor) (prosecutions and enforcement notices), [Florida Tenders Monitor](https://apify.com/stefano_seggio/florida-tenders-monitor), and public-procurement monitors for Argentina and Chile.

Coming next for GrantConnect: a **Grant Opportunities monitor** (open rounds with closing-date countdown), a **bulk export mode** for archive-scale pulls, and **field-level change diffs** for `UPDATED` events. Ask for features in the Issues tab.

## Support

Report problems or request fields in the **Issues** tab of this Actor - typical response within one business day. Versioned changes are listed in the Changelog tab.
