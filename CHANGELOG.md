# Changelog

## 2.0.0 - 2026-09-06

The "institutional-grade" release: same envelope, far more data, and a delta engine that finally sees everything GrantConnect changes.

### Added

- **Server-side filters** mirroring GrantConnect's Advanced Search: `keyword` + `keywordMatch`, `categories` (29 official codes, multi-select), `recipientName`, `recipientAbn`, `minValueAud` / `maxValueAud`, `goId`, `dateType` (Publish / Approval / Start / End / Current / Closed), `dateFrom` / `dateTo` (absolute or relative), `oneOffAdHoc`, `aggregateGrantAward`. Narrow runs now touch a handful of pages instead of walking the register.
- **`agencyNameContains`** (client-side) and **`eventTypes`** filters.
- **`sortBy`** with `Last Updated` as the new default: variations and corrections of old awards keep their original Publish Date, so only this order surfaces them. Delta mode now detects them.
- **`UPDATED` event type** for a previously delivered award whose "Last Updated" stamp moved.
- **Normalised fields** next to every raw string: `publishDateIso`, `lastUpdatedIso` (Canberra time converted to UTC, DST-aware), `approvalDateIso`, `grantStartDateIso`, `grantEndDateIso`, `grantTermDays`, `daysUntilGrantEnd`, `isCurrent`, `financialYear`, `valueAudNumber`, `valueBand`, `recipientAbnNormalized`, `recipientAbnValid` (ABR checksum), `abrLookupUrl`, `recipientEntityType`, boolean twins of every Yes/No field, `gaUuid`, `goUuid`, `isVariation`, `variationNumber`, `baseGaId`.
- **New extracted fields**: Grant Delivery Location (`deliveryState`, `deliveryPostcode`, `deliverySuburb`, `deliveryTownCity`, `deliveryCountry`), `agencyCurrentName`, `agencyContactName`, `aggregateReason`, `numberOfAwardsAggregated`, `confidentialityReasonContract`, `confidentialityReasonOutputs`, `gstInclusive`, `detailFetched` / `detailError`, `data_source` attribution.
- **Concurrency** for detail pages (`maxConcurrency`, default 5): a 500-record run drops from ~10 minutes to under two.
- **Run summary** in the key-value store (`OUTPUT`): records delivered by event type, total matching on GrantConnect, pages walked, stop reason, delta store name.
- Five dataset views (Overview, Recipient directory, Programs & opportunities, Grant terms & expiry, Variations & updates) and CSV / Excel / newest-first output links.
- `deltaStateName` and `resetState` inputs; delta memory is now per filter set by default, so several schedules never interfere.
- Cheaper `result-summary` price for listing-only records (`fetchDetail: false`, or an award page that could not be fetched).

### Fixed

- **Silent data loss in delta mode**: the seen-set used to be persisted _before_ records were pushed, so a spending limit, timeout or migration mid-run marked undelivered awards as seen forever. State is now written only for records actually stored, records are delivered oldest-first so any gap sits where the next walk starts, and the state is also flushed on platform `migrating` / `aborting` events.
- A failed extraction used to push an `{ error }` row into the dataset and finish as SUCCEEDED. The run now fails properly (alerts and webhooks fire) and never writes non-record rows.
- A blocked / maintenance page used to be reported as "no more results". The walker now verifies the page is a real listing and fails loudly instead.
- `maxItems` overflow in delta mode no longer skips records permanently; a warning tells you to raise the cap.
- Detail-page 404s degrade to a summary record instead of aborting the whole run.
- Fetches now time out (45 s), only retriable statuses are retried, and a CloudFront 403 fails fast with a clear message.
- The recency window and the "today" bound are computed in Canberra time, so same-morning awards are no longer excluded for ten hours a day.
- Duplicate rows caused by the listing shifting between page fetches are de-duplicated within a run.
- The delta memory cap grew from 2,000 ids (about two weeks) to 50,000 timestamped entries (about a year).
- A new delta memory no longer inherits the v1 store (which was written regardless of filters and could suppress records for a new filter set).

### Changed

- `dateRange` is deprecated (still honoured) in favour of `dateFrom` / `dateTo`.
- Default order is `Last Updated` (was Publish Date).
- Records are appended oldest-first within a run; use `?desc=true` on the dataset API (the views already do) to read newest-first.
- Log messages are in English.

## 1.0.2 - 2026-09-06

- Delta engine (`onlyNew`, `dateRange`) and the standardised `record_id` / `event_type` / `scraped_at` / `is_new` / `source_url` envelope.

## 1.0.0 - 2026-09-06

- Initial release: Grant Awards register, listing + detail extraction, newest-first by Publish Date.
