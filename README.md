# Australia GrantConnect Monitor

Extracts the Australian Government's whole-of-government **Grant Awards**
register from GrantConnect (`grants.gov.au`) - the mandatory public record
of every grant an Australian Government entity has awarded since December
2017 - with recipient, agency, value, purpose, program, ABN and location
detail, sorted newest-first.

## What you get

| Field | Description |
|---|---|
| `gaId` / `gaUrl` | e.g. `GA578886`, and the official detail page |
| `title` | Grant Activity title |
| `variesGaId` / `variesUrl` | Set when this record is a variation/amendment of an earlier award |
| `agency`, `category`, `publishDate`, `grantTerm`, `valueAud` | Core listing fields |
| `recipientName`, `recipientAbn`, `recipientSuburb`, `recipientTownCity`, `recipientPostcode`, `recipientState`, `recipientCountry` | Recipient identity and location |
| `purpose`, `grantProgram`, `grantActivity`, `pbsProgramName` | What the grant is actually for |
| `goId` / `goTitle` / `goUrl` | The originating Grant Opportunity, when linked |
| `selectionProcess`, `oneOffAdHoc`, `aggregateGrantAward`, `confidentialityContract`, `confidentialityOutputs` | Compliance/process metadata |
| `agencyContactPhone` / `agencyContactEmail` | Agency contact for follow-up |
| `approvalDate`, `variationPublishDate`, `variationDate`, `lastUpdated` | Key dates |
| `gaUrl`, `scrapedAt` | Source link and extraction timestamp |

## Input

| Field | Type | Default | Description |
|---|---|---|---|
| `maxItems` | integer | `100` | Hard cap on Grant Awards returned this run |
| `fetchDetail` | boolean | `true` | Fetch each award's detail page for Purpose, ABN, location, selection process and agency contact |

```json
{ "maxItems": 100, "fetchDetail": true }
```

Results are sorted **newest first** by Publish Date, so a small
`maxItems` run on a recurring schedule is the intended usage pattern.

## Usage

```bash
curl "https://api.apify.com/v2/acts/stefano_seggio~australia-grantconnect-monitor/run-sync-get-dataset-items?token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"maxItems": 50}'
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

Full technical detail - including the real CloudFront/header gotcha and a
genuine parsing bug (duplicate location sections) found and fixed before
shipping - is in `AGENTS.md`.
