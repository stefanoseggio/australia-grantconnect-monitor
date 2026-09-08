import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as cheerio from 'cheerio';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseSiteDateTime } from '../src/normalize.js';
import { parseListingArticles } from '../src/parsers/listing.js';
import type { ListingFilters } from '../src/types.js';

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));
const LISTING_PAGE1 = readFileSync(`${fixturesDir}/grant_awards_list_page1.html`, 'utf-8');
const LISTING_WITH_VARIATION = readFileSync(`${fixturesDir}/grant_awards_list_with_variation.html`, 'utf-8');
const DETAIL = readFileSync(`${fixturesDir}/grant_award_detail_00000146.html`, 'utf-8');
// Live-verified shape of a zero-result / past-the-end page and of a blocked response.
const EMPTY_LISTING =
    '<html><body><h2>Criteria Summary</h2><h2>Search Results</h2><div class="total-result"></div></body></html>';
const BLOCKED = '<html><body><h1>Request blocked</h1></body></html>';

const page1Items = parseListingArticles(cheerio.load(LISTING_PAGE1));
const page1Ids = page1Items.map((i) => i.gaId);

const fetchWithRetryMock = vi.fn<(path: string) => Promise<string>>();
const fetchOptionalMock = vi.fn<(path: string) => Promise<string | null>>();
vi.mock('../src/http.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../src/http.js')>()),
    fetchWithRetry: (path: string) => fetchWithRetryMock(path),
    fetchOptional: (path: string) => fetchOptionalMock(path),
}));

const { walkListing, enrichBatch, fetchGrantAwards } = await import('../src/fetchGrantAwards.js');

const FILTERS: ListingFilters = {
    keyword: null,
    keywordMatch: 'AllWord',
    categories: [],
    recipientName: null,
    recipientAbn: null,
    valueStart: null,
    valueEnd: null,
    goId: null,
    dateType: 'Publish Date',
    dateStart: null,
    dateEnd: null,
    isAdHoc: null,
    isAggregate: null,
    orderBy: 'Last Updated',
};
const ALL_EVENTS = new Set(['NEW_LISTING', 'AWARD_VARIATION', 'UPDATED'] as const);
const NOW = new Date('2026-09-06T12:00:00.000Z');

function pageOf(path: string): number {
    return Number(new URL(`https://x${path}`).searchParams.get('page'));
}
function servePages(...pages: string[]): void {
    fetchWithRetryMock.mockImplementation(async (path) => pages[pageOf(path) - 1] ?? EMPTY_LISTING);
}
function walk(overrides: Partial<Parameters<typeof walkListing>[0]> = {}) {
    return walkListing({
        filters: FILTERS,
        maxItems: 100,
        onlyNew: false,
        seen: {},
        watermark: null,
        agencyNameContains: null,
        eventTypes: ALL_EVENTS,
        ...overrides,
    });
}

describe('walkListing against real captured fixtures', () => {
    beforeEach(() => {
        fetchWithRetryMock.mockReset();
        fetchOptionalMock.mockReset();
    });

    it('cold full run: every row is a NEW_LISTING candidate, the total header is read, and the walk stops at the empty page', async () => {
        servePages(LISTING_PAGE1);
        const result = await walk();
        expect(result.candidates.map((c) => c.item.gaId)).toEqual(page1Ids);
        expect(result.candidates.every((c) => c.eventType === 'NEW_LISTING' && c.isNew)).toBe(true);
        expect(result.totalMatching).toBe(360066);
        expect(result.stopReason).toBe('end-of-results');
        expect(result.pagesWalked).toBe(2);
        expect(result.excluded).toEqual([]);
    });

    it('classifies a "-V1" row as AWARD_VARIATION (structural, not diffed)', async () => {
        servePages(LISTING_WITH_VARIATION);
        const result = await walk();
        const v = result.candidates.find((c) => c.item.gaId === 'GA270901-V1');
        expect(v?.eventType).toBe('AWARD_VARIATION');
        expect(result.candidates.find((c) => c.item.variesGaId === null)?.eventType).toBe('NEW_LISTING');
    });

    it('de-duplicates rows that repeat across pages when the listing shifts under the walk', async () => {
        servePages(LISTING_PAGE1, LISTING_PAGE1); // page 2 repeats every id of page 1
        const result = await walk();
        expect(result.candidates.length).toBe(15);
        expect(new Set(result.candidates.map((c) => c.item.gaId)).size).toBe(15);
    });

    it('stops at maxItems and flags that more matching records exist', async () => {
        servePages(LISTING_PAGE1, LISTING_WITH_VARIATION);
        const result = await walk({ maxItems: 10 });
        expect(result.candidates.length).toBe(10);
        expect(result.truncatedByMaxItems).toBe(true);
        expect(result.stopReason).toBe('max-items');
        expect(fetchWithRetryMock).toHaveBeenCalledTimes(1);
    });

    it('delta: a fully-seen listing yields nothing and early-stops after 2 known pages without walking further', async () => {
        servePages(LISTING_PAGE1, LISTING_WITH_VARIATION, LISTING_PAGE1, LISTING_PAGE1);
        const seen: Record<string, string> = {};
        for (const item of [...page1Items, ...parseListingArticles(cheerio.load(LISTING_WITH_VARIATION))]) {
            seen[item.gaId] = parseSiteDateTime(item.lastUpdated) ?? '';
        }
        const result = await walk({ onlyNew: true, seen });
        expect(result.candidates).toEqual([]);
        expect(result.stopReason).toBe('delta-early-stop');
        expect(fetchWithRetryMock).toHaveBeenCalledTimes(2);
        expect(result.excluded.length).toBeGreaterThan(0);
        expect(result.excluded.every((c) => c.excludedBy === 'unchanged')).toBe(true);
    });

    it('delta: an id seen with an OLDER last-updated instant comes back as UPDATED, an unseen id as new', async () => {
        servePages(LISTING_PAGE1);
        const seen: Record<string, string> = {};
        for (const item of page1Items) seen[item.gaId] = parseSiteDateTime(item.lastUpdated) ?? '';
        seen[page1Ids[3]] = '2020-01-01T00:00:00.000Z'; // stale
        delete seen[page1Ids[0]]; // never seen
        const result = await walk({ onlyNew: true, seen });
        expect(result.candidates.map((c) => [c.item.gaId, c.eventType, c.isNew])).toEqual([
            [page1Ids[0], 'NEW_LISTING', true],
            [page1Ids[3], 'UPDATED', false],
        ]);
    });

    it('delta: a legacy "" timestamp (v1 state) is treated as a baseline, never as an update storm', async () => {
        servePages(LISTING_PAGE1);
        const seen: Record<string, string> = {};
        for (const id of page1Ids) seen[id] = '';
        const result = await walk({ onlyNew: true, seen });
        expect(result.candidates).toEqual([]);
    });

    it('delta: the watermark bounds the walk once every row on a page is older than the previous run by >3 days', async () => {
        servePages(LISTING_PAGE1, LISTING_PAGE1, LISTING_PAGE1, LISTING_PAGE1);
        // Fixture rows are last-updated 4-Sep-2026; a watermark 10 days later makes them all "old".
        const result = await walk({ onlyNew: true, seen: {}, watermark: '2026-09-14T00:00:00.000Z' });
        expect(result.stopReason).toBe('delta-watermark');
        expect(fetchWithRetryMock).toHaveBeenCalledTimes(1);
        // ...but the (unseen) rows on that page were still collected - the watermark only stops paging.
        expect(result.candidates.length).toBe(15);
    });

    it('applies the client-side agency and event-type filters and reports why rows were excluded', async () => {
        servePages(LISTING_WITH_VARIATION);
        const byAgency = await walk({ agencyNameContains: 'health' });
        expect(byAgency.candidates.length).toBeGreaterThan(0);
        expect(byAgency.candidates.every((c) => (c.item.agency ?? '').toLowerCase().includes('health'))).toBe(true);
        expect(byAgency.excluded.every((c) => c.excludedBy === 'agency')).toBe(true);

        const onlyVariations = await walk({ eventTypes: new Set(['AWARD_VARIATION'] as const) });
        expect(onlyVariations.candidates.every((c) => c.eventType === 'AWARD_VARIATION')).toBe(true);
        expect(onlyVariations.excluded.every((c) => c.excludedBy === 'eventType')).toBe(true);
    });

    it('delta: a backlog floor from a truncated walk suppresses the early-stop inside the already-delivered block', async () => {
        // Pages 1-2 = the block a previous (maxItems-truncated) run delivered (same 4-Sep rows,
        // page 2 re-keyed to distinct ids); page 3 = rows that run never reached; page 4 = end.
        const PAGE2_KNOWN = LISTING_PAGE1.replace(/GA5788(\d\d)/g, 'GA8888$1');
        const PAGE3_UNSEEN = LISTING_PAGE1.replace(/GA5788(\d\d)/g, 'GA9988$1');
        servePages(LISTING_PAGE1, PAGE2_KNOWN, PAGE3_UNSEEN);
        const seen: Record<string, string> = {};
        for (const item of [...page1Items, ...parseListingArticles(cheerio.load(PAGE2_KNOWN))]) {
            seen[item.gaId] = parseSiteDateTime(item.lastUpdated) ?? '';
        }
        const watermark = '2026-09-04T06:16:00.000Z'; // newest delivered row

        // Without a floor the two known pages trigger the early-stop and page 3 is stranded forever.
        const stranded = await walk({ onlyNew: true, seen, watermark });
        expect(stranded.stopReason).toBe('delta-early-stop');
        expect(stranded.candidates).toEqual([]);

        // With the floor (older than every delivered row) the walk keeps going and finds page 3.
        const recovered = await walk({ onlyNew: true, seen, watermark, backlogFloor: '2026-09-03T00:00:00.000Z' });
        expect(recovered.candidates.length).toBe(15);
        expect(recovered.candidates.every((c) => c.item.gaId.startsWith('GA9988'))).toBe(true);
        expect(recovered.stopReason).toBe('end-of-results');
    });

    it('delta: a baseline floor from a truncated COLD run keeps older unseen rows out - history, not backlog', async () => {
        // Page 1 = the block the cold run delivered (4-Sep rows, now known); page 2 = older
        // rows (2022-2023 activity) the cold run never reached. They must stay undelivered.
        servePages(LISTING_PAGE1, LISTING_WITH_VARIATION);
        const seen: Record<string, string> = {};
        for (const item of page1Items) seen[item.gaId] = parseSiteDateTime(item.lastUpdated) ?? '';

        const drained = await walk({ onlyNew: true, seen, watermark: '2026-09-04T06:16:00.000Z' });
        expect(drained.candidates.length).toBe(15); // without a baseline the register would drain
        expect(drained.stopReason).toBe('delta-watermark'); // (the old rows are also below the watermark)

        const baseline = await walk({
            onlyNew: true,
            seen,
            watermark: '2026-09-04T06:16:00.000Z',
            baselineFloor: '2026-09-03T14:00:00.000Z',
        });
        expect(baseline.candidates).toEqual([]);
        expect(baseline.excluded.filter((c) => c.excludedBy === 'baseline').length).toBe(15);
        expect(baseline.stopReason).toBe('delta-early-stop'); // history pages count as known pages
        expect(fetchWithRetryMock).toHaveBeenCalledTimes(4); // 2 (drained) + 2 (baseline)
    });

    it('refuses to mistake a blocked/maintenance page for "nothing new" - it retries, then fails loudly', async () => {
        fetchWithRetryMock.mockResolvedValue(BLOCKED);
        await expect(walk()).rejects.toThrow(/not a Grant Award listing/);
        expect(fetchWithRetryMock).toHaveBeenCalledTimes(3);
    });
});

describe('enrichBatch / fetchGrantAwards record shape', () => {
    beforeEach(() => {
        fetchWithRetryMock.mockReset();
        fetchOptionalMock.mockReset();
    });

    it('builds a full record with envelope, normalised siblings and detail fields', async () => {
        servePages(LISTING_PAGE1);
        fetchOptionalMock.mockResolvedValue(DETAIL);
        const { records } = await fetchGrantAwards({
            filters: FILTERS,
            maxItems: 2,
            onlyNew: false,
            seen: {},
            watermark: null,
            agencyNameContains: null,
            eventTypes: ALL_EVENTS,
            fetchDetail: true,
            maxConcurrency: 2,
            now: NOW,
        });
        expect(records.length).toBe(2);
        const r = records[0];
        expect(r.record_id).toBe('GA578886');
        expect(r.event_type).toBe('NEW_LISTING');
        expect(r.is_new).toBe(true);
        expect(r.scraped_at).toBe(NOW.toISOString());
        expect(r.source_url).toBe('https://www.grants.gov.au/Ga/Show/937de059-5cbb-415f-bc83-bcb5619e1379');
        expect(r.data_source).toContain('CC BY 3.0 AU');
        expect(r.publishDateIso).toBe('2026-09-04');
        expect(r.lastUpdatedIso).toBe('2026-09-04T06:16:00.000Z');
        expect(r.valueAudNumber).toBe(225000);
        expect(r.valueBand).toBe('100k-1M');
        expect(r.grantStartDateIso).toBe('2026-09-04');
        expect(r.grantEndDateIso).toBe('2027-11-30');
        expect(r.grantTermDays).toBe(453);
        expect(r.isCurrent).toBe(true);
        expect(r.financialYear).toBe('2026-27');
        expect(r.recipientEntityType).toBe('company');
        expect(r.detailFetched).toBe(true);
        expect(r.recipientAbnNormalized).toBe('79609903844');
        expect(r.recipientAbnValid).toBe(true);
        expect(r.abrLookupUrl).toBe('https://abr.business.gov.au/ABN/View?abn=79609903844');
        expect(r.deliveryState).toBe('QLD');
        expect(r.goUuid).toBe('c851f44a-1dfa-4b29-96fb-f18e271b3ae6');
        expect(r.gstInclusive).toBe(true);
        expect(r.agencyContactName).toBe('GPS Helpdesk');
    });

    it('degrades to a summary record (detailFetched=false, NOT_FOUND) when the detail page is gone, instead of failing the run', async () => {
        servePages(LISTING_PAGE1);
        fetchOptionalMock.mockResolvedValue(null);
        const { candidates } = await walk({ maxItems: 1 });
        const [r] = await enrichBatch(candidates, { fetchDetail: true, maxConcurrency: 1, now: NOW });
        expect(r.detailFetched).toBe(false);
        expect(r.detailError).toBe('NOT_FOUND');
        expect(r.recipientName).toBe('Regional Express Pty Ltd'); // listing fields survive
        expect(r.purpose).toBeNull();
    });

    it('listing-only mode never touches the detail endpoint', async () => {
        servePages(LISTING_PAGE1);
        const { candidates } = await walk({ maxItems: 3 });
        const records = await enrichBatch(candidates, { fetchDetail: false, maxConcurrency: 5, now: NOW });
        expect(records.length).toBe(3);
        expect(records.every((r) => !r.detailFetched && r.detailError === null)).toBe(true);
        expect(fetchOptionalMock).not.toHaveBeenCalled();
    });
});
