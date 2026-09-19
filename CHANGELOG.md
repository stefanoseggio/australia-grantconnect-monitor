# Changelog

## [3.0.0](https://github.com/stefanoseggio/australia-grantconnect-monitor/compare/australia-grantconnect-monitor-v2.0.1...australia-grantconnect-monitor-v3.0.0) (2026-09-19)


### ⚠ BREAKING CHANGES

* v2.0 - server-side filters, Last Updated delta engine, 84-field records, crash-safe delivery

### Features

* Australia GrantConnect Monitor - Grant Awards register ([bd6d808](https://github.com/stefanoseggio/australia-grantconnect-monitor/commit/bd6d808e27992135bd2e68d8f68f0cd21dd16de1))
* delta engine (onlyNew/dateRange) + standardized B2B output envelope ([5b0caf5](https://github.com/stefanoseggio/australia-grantconnect-monitor/commit/5b0caf512b1df6e156a5150bdb73496be36d941c))
* v2.0 - server-side filters, Last Updated delta engine, 84-field records, crash-safe delivery ([2e52b55](https://github.com/stefanoseggio/australia-grantconnect-monitor/commit/2e52b558698590cf77bc6eb61fafd86651f80874))


### Bug Fixes

* **ci:** pass RELEASE_PLEASE_TOKEN so release PRs skip the bot-approval gate ([a9befe7](https://github.com/stefanoseggio/australia-grantconnect-monitor/commit/a9befe7edf72b78e70c18b1cecdaddd8be990b9d))
* **delta:** a truncated cold run sets a baseline instead of a backlog ([7774edd](https://github.com/stefanoseggio/australia-grantconnect-monitor/commit/7774edd0880b90a1a25ee7cd0f84021d746205ea))
* **delta:** remember a backlog floor when maxItems truncates a walk ([53bef8c](https://github.com/stefanoseggio/australia-grantconnect-monitor/commit/53bef8c10f85f865e17838de2aff892c071042dd))
* label already-delivered, unchanged awards UNCHANGED instead of NEW_LISTING/AWARD_VARIATION ([#9](https://github.com/stefanoseggio/australia-grantconnect-monitor/issues/9)) ([e00f193](https://github.com/stefanoseggio/australia-grantconnect-monitor/commit/e00f19346aacea4a593fe20310dea6e8524fe409))
* **state:** never adopt the v1 delta store into new delta-state names ([3f68e86](https://github.com/stefanoseggio/australia-grantconnect-monitor/commit/3f68e86c69be524b618fd0ed75da07a0982f8185))

## 2.0.1 - 2026-09-07

### Fixed

- **Stranded backlog in delta mode**: when a run stopped at `maxItems` with more matching rows below, the next run could early-stop inside the block it had already delivered (two fully-known pages) and never reach the older undelivered rows. The delta memory now records a _backlog floor_ (how deep the truncated walk got); the next run walks through the known block down to that floor before trusting the early-stop or the watermark, then clears it. Reported by the fleet-wide verification of the UK HSE actor and fixed here too.
- **First-run baseline**: a cold delta run cut short by `maxItems` now records a _baseline floor_; unseen awards whose last activity is older are treated as history and never delivered by later runs, so a cheap first run no longer turns every following run into a slow drain of the archive.

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
