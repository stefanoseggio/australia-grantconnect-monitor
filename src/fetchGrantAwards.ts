import { log } from 'apify';
import * as cheerio from 'cheerio';

import type { DateRangePreset } from './dateFilter.js';
import { isWithinDateRange, parseGrantConnectDate } from './dateFilter.js';
import { fetchWithRetry } from './http.js';
import type { DetailFields } from './parsers/detail.js';
import { parseDetail } from './parsers/detail.js';
import type { ListingItem } from './parsers/listing.js';
import { parseListingArticles } from './parsers/listing.js';
import type { EventType, GrantAwardRecord } from './types.js';
import { listingPath } from './urls.js';

const BASE_URL = 'https://www.grants.gov.au';

export interface ListingItemsResult {
    items: ListingItem[];
    allIdsThisRun: string[];
}

// The listing is confirmed sorted newest-first by Publish Date (see
// urls.ts - verified live 2026-09-06), so when `onlyNew` is set, pagination
// stops early once 2 consecutive pages contain zero unseen gaIds (a
// one-page safety margin against minor reordering) - the same early-stop
// margin this portfolio's UK HSE actor uses. This is what makes a delta
// run resolve in seconds instead of walking the full 360,000+ record
// archive every time. `allIdsThisRun` always collects every id actually
// seen on a walked page (even ones filtered out of `items` by `onlyNew`),
// since that's what the caller persists as the new seen-set.
export async function fetchListingItems(
    maxItems: number,
    now: Date,
    seenIds: ReadonlySet<string>,
    onlyNew: boolean,
): Promise<ListingItemsResult> {
    const items: ListingItem[] = [];
    const allIdsThisRun: string[] = [];
    let page = 1;
    let consecutiveFullyKnownPages = 0;
    for (;;) {
        const html = await fetchWithRetry(listingPath(page, now));
        const $ = cheerio.load(html);
        const pageItems = parseListingArticles($);
        if (pageItems.length === 0) {
            log.info(`no more results at page ${page}.`);
            break;
        }

        let pageHasNew = false;
        for (const item of pageItems) {
            allIdsThisRun.push(item.gaId);
            const isNew = !seenIds.has(item.gaId);
            if (isNew) pageHasNew = true;
            if (!onlyNew || isNew) {
                items.push(item);
                if (items.length >= maxItems) return { items, allIdsThisRun };
            }
        }

        if (onlyNew) {
            consecutiveFullyKnownPages = pageHasNew ? 0 : consecutiveFullyKnownPages + 1;
            if (consecutiveFullyKnownPages >= 2) {
                log.info(`stopping early at page ${page} - 2 consecutive pages with no new ids.`);
                break;
            }
        }

        log.info(`page ${page}: ${pageItems.length} awards (${items.length} so far).`);
        page += 1;
    }
    return { items, allIdsThisRun };
}

// A record carrying a "Varies" link is structurally an amendment/variation
// of an earlier award - GrantConnect's own data model marks this (a
// distinct gaId like "GA270901-V1" varying base award "GA270901"), which
// is a more specific, defensible signal than a generic new listing, the
// same kind of structural (not field-diffed) classification the fleet's
// HSE actor uses for SANCTION vs NEW_LISTING.
function eventTypeFor(item: ListingItem): EventType {
    return item.variesGaId ? 'AWARD_VARIATION' : 'NEW_LISTING';
}

function toRecord(item: ListingItem, detail: DetailFields, isNew: boolean, scrapedAt: string): GrantAwardRecord {
    return {
        gaId: item.gaId,
        title: item.title,
        variesGaId: item.variesGaId,
        variesUrl: item.variesHref ? `${BASE_URL}${item.variesHref}` : null,
        agency: item.agency,
        publishDate: item.publishDate,
        category: item.category,
        grantTerm: item.grantTerm,
        valueAud: item.valueAud,
        recipientName: item.recipientName,
        lastUpdated: item.lastUpdated,
        approvalDate: detail.approvalDate,
        variationPublishDate: detail.variationPublishDate,
        variationDate: detail.variationDate,
        oneOffAdHoc: detail.oneOffAdHoc,
        aggregateGrantAward: detail.aggregateGrantAward,
        pbsProgramName: detail.pbsProgramName,
        grantProgram: detail.grantProgram,
        grantActivity: detail.grantActivity,
        purpose: detail.purpose,
        goId: detail.goId,
        goTitle: detail.goTitle,
        goUrl: detail.goHref ? `${BASE_URL}${detail.goHref}` : null,
        internalReferenceId: detail.internalReferenceId,
        selectionProcess: detail.selectionProcess,
        confidentialityContract: detail.confidentialityContract,
        confidentialityOutputs: detail.confidentialityOutputs,
        recipientAbn: detail.recipientAbn,
        recipientSuburb: detail.recipientSuburb,
        recipientTownCity: detail.recipientTownCity,
        recipientPostcode: detail.recipientPostcode,
        recipientState: detail.recipientState,
        recipientCountry: detail.recipientCountry,
        agencyContactPhone: detail.agencyContactPhone,
        agencyContactEmail: detail.agencyContactEmail,
        record_id: item.gaId,
        event_type: eventTypeFor(item),
        scraped_at: scrapedAt,
        is_new: isNew,
        source_url: `${BASE_URL}${item.gaHref}`,
    };
}

function emptyDetail(): DetailFields {
    return {
        approvalDate: null,
        variationPublishDate: null,
        variationDate: null,
        oneOffAdHoc: null,
        aggregateGrantAward: null,
        pbsProgramName: null,
        grantProgram: null,
        grantActivity: null,
        purpose: null,
        goId: null,
        goTitle: null,
        goHref: null,
        internalReferenceId: null,
        selectionProcess: null,
        confidentialityContract: null,
        confidentialityOutputs: null,
        recipientAbn: null,
        recipientSuburb: null,
        recipientTownCity: null,
        recipientPostcode: null,
        recipientState: null,
        recipientCountry: null,
        agencyContactPhone: null,
        agencyContactEmail: null,
    };
}

export async function fetchGrantAwards(
    maxItems: number,
    fetchDetail: boolean,
    seenIds: ReadonlySet<string>,
    onlyNew: boolean,
    dateRange: DateRangePreset | undefined,
    now: Date,
): Promise<{ records: GrantAwardRecord[]; allIdsThisRun: string[] }> {
    const { items, allIdsThisRun } = await fetchListingItems(maxItems, now, seenIds, onlyNew);
    const scrapedAt = now.toISOString();

    const records: GrantAwardRecord[] = [];
    for (const item of items) {
        const isNew = !seenIds.has(item.gaId);
        const detail = fetchDetail ? parseDetail(cheerio.load(await fetchWithRetry(item.gaHref))) : emptyDetail();
        const record = toRecord(item, detail, isNew, scrapedAt);
        if (dateRange && !isWithinDateRange(parseGrantConnectDate(record.publishDate), dateRange, now)) continue;
        records.push(record);
    }
    return { records, allIdsThisRun };
}
