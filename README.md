# Australia GrantConnect Monitor

Extracts the Australian Government's whole-of-government **Grant Awards**
register from GrantConnect (`grants.gov.au`) - the mandatory public record
of every grant an Australian Government entity has awarded since December
2017 - with recipient, agency, value, purpose, program, ABN and location
detail, sorted newest-first.

## 🔔 Delta mode - daily/hourly monitoring, not just a dump

Set `onlyNew: true` and this actor persists which GA IDs it has already
returned (in its own private key-value store) and, on every subsequent
run, returns **only what's genuinely new since the last run** - pagination
stops the moment it reaches already-seen records instead of walking the
360,000+ record archive every time, since the listing is verified sorted
newest-first by Publish Date.

```json
{ "maxItems": 100, "onlyNew": true }
```

```python
from apify_client import ApifyClient

client = ApifyClient("YOUR_TOKEN")

# Daily monitoring run - only genuinely new grant awards come back
run = client.actor("stefano_seggio/australia-grantconnect-monitor").call(run_input={"onlyNew": True})
for item in client.dataset(run["defaultDatasetId"]).iterate_items():
    print(f"[{item['event_type']}] {item['recipientName']} - {item['source_url']}")
    # -> forward `item` as-is to your webhook/Slack/CRM; the record_id/
    #    event_type/scraped_at/source_url envelope needs no reshaping.
```

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: 'YOUR_TOKEN' });

// Daily monitoring run
const run = await client.actor('stefano_seggio/australia-grantconnect-monitor').call({ onlyNew: true });
const { items } = await client.dataset(run.defaultDatasetId).listItems();
for (const item of items) {
    // item.record_id / item.event_type / item.scraped_at / item.source_url
    // are already webhook/Zapier/Make-ready - post `item` straight through.
}
```

Run this on an Apify schedule (e.g. every 6 hours) and pipe the output
straight into Slack/Email/Zapier/Make/your own endpoint via [Apify's native
dataset webhooks](https://docs.apify.com/platform/integrations/webhooks) -
configure one on `ACTOR.RUN.SUCCEEDED` and point it at your endpoint; every
record already carries the standardized `record_id`/`event_type`/
`scraped_at`/`is_new`/`source_url` envelope, so no intermediate parser is
needed.

Prefer filtering by Publish Date directly instead of run-history? Use
`dateRange` (`"24h"`, `"7d"`, or `"30d"`) - independent of `onlyNew`.
Publish Date is the field this register is ordered by, and it matched the
live fetch date for the newest records when verified, so - unlike some
other registers in this portfolio where the natural date field lags real
publication - it is not known to lag here; `onlyNew` remains the more
exact signal for "what's new" since it's based on run history rather than
a rolling time window, but `dateRange` is there when you specifically want
the source's own date semantics.

## What you get

Every record carries this standardized B2B integration envelope:

| Field        | Type    | Description                                                         |
| ------------ | ------- | ------------------------------------------------------------------- |
| `record_id`  | string  | Same value as `gaId` - stable across runs                           |
| `event_type` | string  | `NEW_LISTING`, or `AWARD_VARIATION` when it varies an earlier award |
| `scraped_at` | string  | ISO-8601 timestamp of this extraction                               |
| `is_new`     | boolean | `true` if not seen in a prior run (delta mode)                      |
| `source_url` | string  | Direct link to the official GrantConnect record                     |

Plus the full domain detail:

| Field                                                                                                                              | Description                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `gaId`                                                                                                                             | e.g. `GA578886`                                                   |
| `title`                                                                                                                            | Grant Activity title                                              |
| `variesGaId` / `variesUrl`                                                                                                         | Set when this record is a variation/amendment of an earlier award |
| `agency`, `category`, `publishDate`, `grantTerm`, `valueAud`                                                                       | Core listing fields                                               |
| `recipientName`, `recipientAbn`, `recipientSuburb`, `recipientTownCity`, `recipientPostcode`, `recipientState`, `recipientCountry` | Recipient identity and location                                   |
| `purpose`, `grantProgram`, `grantActivity`, `pbsProgramName`                                                                       | What the grant is actually for                                    |
| `goId` / `goTitle` / `goUrl`                                                                                                       | The originating Grant Opportunity, when linked                    |
| `selectionProcess`, `oneOffAdHoc`, `aggregateGrantAward`, `confidentialityContract`, `confidentialityOutputs`                      | Compliance/process metadata                                       |
| `agencyContactPhone` / `agencyContactEmail`                                                                                        | Agency contact for follow-up                                      |
| `approvalDate`, `variationPublishDate`, `variationDate`, `lastUpdated`                                                             | Key dates                                                         |

## Input

| Field         | Type    | Default | Description                                                                                     |
| ------------- | ------- | ------- | ----------------------------------------------------------------------------------------------- |
| `maxItems`    | integer | `100`   | Hard cap on Grant Awards returned this run                                                      |
| `fetchDetail` | boolean | `true`  | Fetch each award's detail page for Purpose, ABN, location, selection process and agency contact |
| `onlyNew`     | boolean | `false` | Delta mode - see above                                                                          |
| `dateRange`   | string  | (none)  | `"24h"` \| `"7d"` \| `"30d"` - filter by Publish Date                                           |

```json
{ "maxItems": 100, "fetchDetail": true, "onlyNew": false }
```

Results are sorted **newest first** by Publish Date, so a small
`maxItems` run on a recurring schedule is a reasonable poor-man's monitor
even without `onlyNew` - but `onlyNew` is what makes scheduled runs cheap
and exact.

## Usage

```bash
# One-off extraction
curl "https://api.apify.com/v2/acts/stefano_seggio~australia-grantconnect-monitor/run-sync-get-dataset-items?token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"maxItems": 50}'

# Daily monitoring (schedule this call every few hours)
curl "https://api.apify.com/v2/acts/stefano_seggio~australia-grantconnect-monitor/run-sync-get-dataset-items?token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"onlyNew": true}'
```

```python
from apify_client import ApifyClient

client = ApifyClient("YOUR_TOKEN")
run = client.actor("stefano_seggio/australia-grantconnect-monitor").call(run_input={"maxItems": 50})
for item in client.dataset(run["defaultDatasetId"]).iterate_items():
    print(item["gaId"], item["agency"], item["recipientName"], item["valueAud"])
```

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: 'YOUR_TOKEN' });
const run = await client.actor('stefano_seggio/australia-grantconnect-monitor').call({ maxItems: 50 });
const { items } = await client.dataset(run.defaultDatasetId).listItems();
```

## Known limitations

- The site sits behind CloudFront with a header-based bot filter - a
  request with no ordinary browser `User-Agent` gets a 403. This actor
  always sends one; no proxy is needed.
- "Grant Delivery Location" (which can differ from the recipient's own
  location, e.g. for a multi-state program) is not extracted separately -
  only the Recipient's own location is. For an "Aggregate Grant Award"
  (`aggregateGrantAward: "Yes"`) covering multiple recipients/locations,
  only the single location shown on the award's own page is captured.
- `purpose`, `title` and `grantActivity` are plain text, not reformatted.
- `event_type` currently distinguishes "a fresh GA ID appearing in the
  register" (`NEW_LISTING`/`AWARD_VARIATION`) - it does not diff
  individual field-level changes to a previously-seen record, which would
  need full snapshot storage rather than id-based delta tracking.

Full technical detail - including the real CloudFront/header gotcha, a
genuine parsing bug (duplicate location sections) found and fixed before
shipping, and the delta-engine's state/early-stop design - is in
`AGENTS.md`.
