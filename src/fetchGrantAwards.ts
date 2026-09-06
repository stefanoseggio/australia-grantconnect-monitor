import { log } from 'apify';
import * as cheerio from 'cheerio';

import { absoluteUrl, fetchOptional, fetchWithRetry, mapWithConcurrency } from './http.js';
import {
    classifyRecipient,
    daysBetweenInclusive,
    daysUntil,
    financialYear,
    isValidAbn,
    normalizeAbn,
    parseAudValue,
    parseGaId,
    parseSiteDate,
    parseSiteDateTime,
    siteCalendarDate,
    splitGrantTerm,
    uuidFromPath,
    valueBand,
    yesNoToBoolean,
} from './normalize.js';
import type { DetailFields } from './parsers/detail.js';
import { parseDetail } from './parsers/detail.js';
import type { ListingItem } from './parsers/listing.js';
import { parseListingPage } from './parsers/listing.js';
import type { EventType, GrantAwardRecord, ListingFilters } from './types.js';
import { DATA_SOURCE_ATTRIBUTION } from './types.js';
import { listingPath } from './urls.js';

export type ExclusionReason = 'unchanged' | 'agency' | 'eventType';

export interface Candidate {
    item: ListingItem;
    eventType: EventType;
    isNew: boolean;
    lastUpdatedIso: string | null;
    excludedBy: ExclusionReason | null;
}

export interface WalkOptions {
    filters: ListingFilters;
    maxItems: number;
    onlyNew: boolean;
    /** gaId -> lastUpdatedIso of the last delivery ("" when unknown) */
    seen: Readonly<Record<string, string>>;
    /** Newest lastUpdatedIso delivered by a previous run, or null on a cold start. */
    watermark: string | null;
    agencyNameContains: string | null;
    eventTypes: ReadonlySet<EventType>;
}

export type StopReason =
    'max-items' | 'end-of-results' | 'no-more-pages' | 'delta-early-stop' | 'delta-watermark' | 'page-cap';

export interface WalkResult {
    /** Deliverable candidates, newest-first (walk order). */
    candidates: Candidate[];
    /** Walked but intentionally not delivered (unchanged in delta mode, or client-side filtered). */
    excluded: Candidate[];
    totalMatching: number | null;
    pagesWalked: number;
    stopReason: StopReason;
    /** true when more deliverable records matched than maxItems allowed. */
    truncatedByMaxItems: boolean;
}

// Safety margin applied to the delta watermark: GrantConnect batches
// variations (dozens share the same Last Updated minute) and agencies can
// back-date corrections, so a walk continues a little past the previous
// run's newest timestamp before trusting the watermark.
const WATERMARK_MARGIN_MS = 3 * 24 * 60 * 60 * 1000;
const CONSECUTIVE_KNOWN_PAGES_TO_STOP = 2;
const PAGE_CAP = 10_000; // 150,000 rows - a runaway guard, never reached in practice
const NOT_A_LISTING_RETRIES = 2;

function classify(
    item: ListingItem,
    lastUpdatedIso: string | null,
    seen: Readonly<Record<string, string>>,
): { eventType: EventType; isNew: boolean; changed: boolean } {
    const structural: EventType =
        item.variesGaId || parseGaId(item.gaId).isVariation ? 'AWARD_VARIATION' : 'NEW_LISTING';
    const previous = seen[item.gaId];
    if (previous === undefined) return { eventType: structural, isNew: true, changed: true };
    // previous === "" means "seen by a v1 run, timestamp unknown": treat as the
    // baseline rather than flagging every legacy id as updated on first v2 run.
    if (previous !== '' && lastUpdatedIso && lastUpdatedIso > previous) {
        return { eventType: 'UPDATED', isNew: false, changed: true };
    }
    return { eventType: structural, isNew: false, changed: false };
}

async function loadListingPage(filters: ListingFilters, page: number) {
    for (let attempt = 0; ; attempt++) {
        const html = await fetchWithRetry(listingPath(filters, page));
        const parsed = parseListingPage(cheerio.load(html));
        if (parsed.isListingPage) return parsed;
        if (attempt >= NOT_A_LISTING_RETRIES) {
            throw new Error(
                `GrantConnect returned a page that is not a Grant Award listing at page ${page} (blocked, under maintenance, or the site changed). Aborting instead of reporting "nothing new".`,
            );
        }
        log.warning(
            `Page ${page} did not look like a listing page - retrying (${attempt + 1}/${NOT_A_LISTING_RETRIES}).`,
        );
    }
}

/**
 * Walk /Ga/ListResult newest-first and decide, per row, whether it must be
 * delivered. Never fetches detail pages; never past the last page.
 */
export async function walkListing(options: WalkOptions): Promise<WalkResult> {
    const { filters, maxItems, onlyNew, seen, watermark, agencyNameContains, eventTypes } = options;
    const candidates: Candidate[] = [];
    const excluded: Candidate[] = [];
    const walkedIds = new Set<string>();
    const agencyNeedle = agencyNameContains?.trim().toLowerCase() || null;
    const watermarkCutoff = watermark
        ? new Date(new Date(watermark).getTime() - WATERMARK_MARGIN_MS).toISOString()
        : null;

    let totalMatching: number | null = null;
    let consecutiveKnownPages = 0;
    let page = 1;
    for (;;) {
        const listing = await loadListingPage(filters, page);
        totalMatching ??= listing.totalMatching;
        if (listing.items.length === 0) {
            log.info(`Page ${page}: no results - end of listing.`);
            return {
                candidates,
                excluded,
                totalMatching,
                pagesWalked: page,
                stopReason: 'end-of-results',
                truncatedByMaxItems: false,
            };
        }

        let pageHasChanges = false;
        let pageAllBelowWatermark = watermarkCutoff !== null;
        for (const item of listing.items) {
            if (walkedIds.has(item.gaId)) continue; // the listing shifted under us between two page fetches
            walkedIds.add(item.gaId);

            const lastUpdatedIso = parseSiteDateTime(item.lastUpdated);
            const { eventType, isNew, changed } = classify(item, lastUpdatedIso, seen);
            if (changed) pageHasChanges = true;
            if (!lastUpdatedIso || !watermarkCutoff || lastUpdatedIso >= watermarkCutoff) pageAllBelowWatermark = false;

            const candidate: Candidate = { item, eventType, isNew, lastUpdatedIso, excludedBy: null };
            if (onlyNew && !changed) candidate.excludedBy = 'unchanged';
            else if (agencyNeedle && !(item.agency ?? '').toLowerCase().includes(agencyNeedle))
                candidate.excludedBy = 'agency';
            else if (!eventTypes.has(eventType)) candidate.excludedBy = 'eventType';

            if (candidate.excludedBy) {
                excluded.push(candidate);
                continue;
            }
            if (candidates.length >= maxItems) {
                log.warning(
                    `maxItems=${maxItems} reached on page ${page} - at least one more matching record was NOT delivered this run (it stays undelivered and will be picked up by the next delta run; raise maxItems to catch up faster).`,
                );
                return {
                    candidates,
                    excluded,
                    totalMatching,
                    pagesWalked: page,
                    stopReason: 'max-items',
                    truncatedByMaxItems: true,
                };
            }
            candidates.push(candidate);
        }

        const matchingNote =
            totalMatching !== null ? ` (of ${totalMatching.toLocaleString('en-AU')} matching on GrantConnect)` : '';
        log.info(`Page ${page}: ${listing.items.length} rows, ${candidates.length} to deliver so far${matchingNote}`);

        if (onlyNew) {
            consecutiveKnownPages = pageHasChanges ? 0 : consecutiveKnownPages + 1;
            if (consecutiveKnownPages >= CONSECUTIVE_KNOWN_PAGES_TO_STOP) {
                log.info(
                    `Delta early-stop at page ${page}: ${CONSECUTIVE_KNOWN_PAGES_TO_STOP} consecutive pages with nothing new or updated.`,
                );
                return {
                    candidates,
                    excluded,
                    totalMatching,
                    pagesWalked: page,
                    stopReason: 'delta-early-stop',
                    truncatedByMaxItems: false,
                };
            }
            if (filters.orderBy === 'Last Updated' && pageAllBelowWatermark) {
                log.info(
                    `Delta watermark stop at page ${page}: every row was last updated more than 3 days before the previous run's newest record.`,
                );
                return {
                    candidates,
                    excluded,
                    totalMatching,
                    pagesWalked: page,
                    stopReason: 'delta-watermark',
                    truncatedByMaxItems: false,
                };
            }
        }
        if (!listing.hasNext) {
            return {
                candidates,
                excluded,
                totalMatching,
                pagesWalked: page,
                stopReason: 'no-more-pages',
                truncatedByMaxItems: false,
            };
        }
        if (page >= PAGE_CAP) {
            log.warning(`Page cap (${PAGE_CAP}) reached - stopping the walk.`);
            return {
                candidates,
                excluded,
                totalMatching,
                pagesWalked: page,
                stopReason: 'page-cap',
                truncatedByMaxItems: true,
            };
        }
        page += 1;
    }
}

export interface DetailResult {
    detail: DetailFields | null;
    error: string | null;
}

/** Fetch and parse one award's detail page; a withdrawn record (404) or a parse problem degrades to a summary record instead of failing the run. */
export async function fetchDetailFor(item: ListingItem): Promise<DetailResult> {
    try {
        const html = await fetchOptional(item.gaHref);
        if (html === null) return { detail: null, error: 'NOT_FOUND' };
        return { detail: parseDetail(cheerio.load(html)), error: null };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warning(`Detail fetch failed for ${item.gaId}: ${message}`);
        return { detail: null, error: message };
    }
}

export function buildRecord(
    candidate: Candidate,
    detailResult: DetailResult | null,
    now: Date,
    scrapedAt = now.toISOString(),
): GrantAwardRecord {
    const { item, eventType, isNew, lastUpdatedIso } = candidate;
    const detail = detailResult?.detail ?? null;
    const todayIso = siteCalendarDate(now);
    const ga = parseGaId(item.gaId);

    const publishDateIso = parseSiteDate(item.publishDate);
    const term = splitGrantTerm(item.grantTerm);
    const grantStartDateIso = parseSiteDate(term.start);
    const grantEndDateIso = parseSiteDate(term.end);
    const valueAudNumber = parseAudValue(item.valueAud ?? detail?.valueAudDetail);
    const abnDigits = normalizeAbn(detail?.recipientAbn);
    const isCurrent =
        grantStartDateIso && grantEndDateIso ? grantStartDateIso <= todayIso && todayIso <= grantEndDateIso : null;

    return {
        record_id: item.gaId,
        event_type: eventType,
        scraped_at: scrapedAt,
        is_new: isNew,
        source_url: absoluteUrl(item.gaHref),
        data_source: DATA_SOURCE_ATTRIBUTION,

        gaId: item.gaId,
        gaUuid: item.gaUuid ?? uuidFromPath(item.gaHref),
        isVariation: ga.isVariation || item.variesGaId !== null,
        variationNumber: ga.variationNumber,
        baseGaId: item.variesGaId ?? ga.baseGaId,
        variesGaId: item.variesGaId ?? detail?.variesGaId ?? null,
        variesUrl: item.variesHref ? absoluteUrl(item.variesHref) : null,
        title: item.title ?? detail?.grantActivity ?? null,

        agency: item.agency ?? detail?.agency ?? null,
        category: item.category,
        publishDate: item.publishDate,
        grantTerm: item.grantTerm,
        valueAud: item.valueAud ?? detail?.valueAudDetail ?? null,
        recipientName: item.recipientName,
        lastUpdated: item.lastUpdated,

        publishDateIso,
        lastUpdatedIso,
        valueAudNumber,
        valueBand: valueBand(valueAudNumber),
        grantStartDate: term.start,
        grantEndDate: term.end,
        grantStartDateIso,
        grantEndDateIso,
        grantTermDays: daysBetweenInclusive(grantStartDateIso, grantEndDateIso),
        daysUntilGrantEnd: daysUntil(grantEndDateIso, todayIso),
        isCurrent,
        financialYear: financialYear(publishDateIso),
        grantStartFinancialYear: financialYear(grantStartDateIso),
        recipientEntityType: classifyRecipient(item.recipientName),

        detailFetched: detail !== null,
        detailError: detailResult?.error ?? null,
        agencyCurrentName: detail?.agency ?? null,
        approvalDate: detail?.approvalDate ?? null,
        approvalDateIso: parseSiteDate(detail?.approvalDate),
        variationPublishDate: detail?.variationPublishDate ?? null,
        variationPublishDateIso: parseSiteDate(detail?.variationPublishDate),
        variationDate: detail?.variationDate ?? null,
        variationDateIso: parseSiteDate(detail?.variationDate),
        oneOffAdHoc: detail?.oneOffAdHoc ?? null,
        isOneOffAdHoc: yesNoToBoolean(detail?.oneOffAdHoc),
        aggregateGrantAward: detail?.aggregateGrantAward ?? null,
        isAggregate: yesNoToBoolean(detail?.aggregateGrantAward),
        aggregateReason: detail?.aggregateReason ?? null,
        numberOfAwardsAggregated: detail?.numberOfAwardsAggregated ?? null,
        gstInclusive: detail?.valueAudDetail ? /GST inclusive/i.test(detail.valueAudDetail) : null,
        pbsProgramName: detail?.pbsProgramName ?? null,
        grantProgram: detail?.grantProgram ?? null,
        grantActivity: detail?.grantActivity ?? null,
        purpose: detail?.purpose ?? null,
        goId: detail?.goId ?? null,
        goUuid: detail?.goHref
            ? (new URL(detail.goHref, 'https://www.grants.gov.au').searchParams.get('GoUuid')?.toLowerCase() ?? null)
            : null,
        goTitle: detail?.goTitle ?? null,
        goUrl: detail?.goHref ? absoluteUrl(detail.goHref) : null,
        internalReferenceId: detail?.internalReferenceId ?? null,
        selectionProcess: detail?.selectionProcess ?? null,
        confidentialityContract: detail?.confidentialityContract ?? null,
        isContractConfidential: yesNoToBoolean(detail?.confidentialityContract),
        confidentialityReasonContract: detail?.confidentialityReasonContract ?? null,
        confidentialityOutputs: detail?.confidentialityOutputs ?? null,
        isOutputsConfidential: yesNoToBoolean(detail?.confidentialityOutputs),
        confidentialityReasonOutputs: detail?.confidentialityReasonOutputs ?? null,
        recipientAbn: detail?.recipientAbn ?? null,
        recipientAbnNormalized: abnDigits,
        recipientAbnValid: isValidAbn(abnDigits),
        abrLookupUrl: abnDigits ? `https://abr.business.gov.au/ABN/View?abn=${abnDigits}` : null,
        recipientSuburb: detail?.recipientLocation.suburb ?? null,
        recipientTownCity: detail?.recipientLocation.townCity ?? null,
        recipientPostcode: detail?.recipientLocation.postcode ?? null,
        recipientState: detail?.recipientLocation.state ?? null,
        recipientCountry: detail?.recipientLocation.country ?? null,
        deliverySuburb: detail?.deliveryLocation.suburb ?? null,
        deliveryTownCity: detail?.deliveryLocation.townCity ?? null,
        deliveryPostcode: detail?.deliveryLocation.postcode ?? null,
        deliveryState: detail?.deliveryLocation.state ?? null,
        deliveryCountry: detail?.deliveryLocation.country ?? null,
        agencyContactName: detail?.agencyContactName ?? null,
        agencyContactPhone: detail?.agencyContactPhone ?? null,
        agencyContactEmail: detail?.agencyContactEmail ?? null,
    };
}

export interface EnrichOptions {
    fetchDetail: boolean;
    maxConcurrency: number;
    now: Date;
}

/** Build final records for a batch of candidates, fetching detail pages with bounded concurrency. Order is preserved. */
export async function enrichBatch(
    candidates: readonly Candidate[],
    options: EnrichOptions,
): Promise<GrantAwardRecord[]> {
    const scrapedAt = options.now.toISOString();
    if (!options.fetchDetail) return candidates.map((c) => buildRecord(c, null, options.now, scrapedAt));
    const details = await mapWithConcurrency(candidates, options.maxConcurrency, async (c) => fetchDetailFor(c.item));
    return candidates.map((c, i) => buildRecord(c, details[i], options.now, scrapedAt));
}

export interface FetchGrantAwardsOptions extends WalkOptions, EnrichOptions {}

/**
 * Convenience one-shot: walk + enrich everything. main.ts streams in batches
 * instead (so state is persisted only for delivered records); this is the
 * simpler entry point used by the live integration tests.
 */
export async function fetchGrantAwards(
    options: FetchGrantAwardsOptions,
): Promise<{ records: GrantAwardRecord[]; walk: WalkResult }> {
    const walk = await walkListing(options);
    const records = await enrichBatch(walk.candidates, options);
    return { records, walk };
}
