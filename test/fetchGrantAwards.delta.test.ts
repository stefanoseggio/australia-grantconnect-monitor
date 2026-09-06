import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as cheerio from 'cheerio';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseListingArticles } from '../src/parsers/listing.js';

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));
const LISTING_PAGE1 = readFileSync(`${fixturesDir}/grant_awards_list_page1.html`, 'utf-8');
const LISTING_WITH_VARIATION = readFileSync(`${fixturesDir}/grant_awards_list_with_variation.html`, 'utf-8');
const NO_MORE_RESULTS = '<html><body>no results</body></html>';
const page1Ids = parseListingArticles(cheerio.load(LISTING_PAGE1)).map((item) => item.gaId);

const fetchWithRetryMock = vi.fn<(path: string) => Promise<string>>();
vi.mock('../src/http.js', () => ({ fetchWithRetry: (path: string) => fetchWithRetryMock(path) }));

const { fetchGrantAwards } = await import('../src/fetchGrantAwards.js');

function pageOf(path: string): number {
    return Number(new URL(`https://x${path}`).searchParams.get('page'));
}

const NOW = new Date('2026-09-06T12:00:00.000Z');

// These exercise the envelope (record_id/event_type/scraped_at/is_new/
// source_url) and the onlyNew/dateRange filters against real fixture HTML
// with a mocked http layer - no live network, so this runs in CI (unlike
// fetchGrantAwards.test.ts's live checks against the real site).
describe('fetchGrantAwards delta envelope, against real captured fixtures', () => {
    beforeEach(() => {
        fetchWithRetryMock.mockReset();
    });

    it('cold run (empty seen-set, fetchDetail off): marks every record is_new=true with record_id/source_url set from the real listing', async () => {
        fetchWithRetryMock.mockImplementation(async () => LISTING_PAGE1);
        const { records } = await fetchGrantAwards(15, false, new Set(), false, undefined, NOW);
        expect(records.length).toBe(15);
        expect(records.every((r) => r.is_new)).toBe(true);
        expect(records.every((r) => r.event_type === 'NEW_LISTING')).toBe(true); // this fixture has no variations
        expect(records.every((r) => r.record_id === r.gaId)).toBe(true);
        expect(records.every((r) => r.scraped_at === NOW.toISOString())).toBe(true);
        expect(records[0].source_url).toBe('https://www.grants.gov.au/Ga/Show/937de059-5cbb-415f-bc83-bcb5619e1379');
    });

    it('flags a variation record as AWARD_VARIATION and a plain record as NEW_LISTING from the same real fixture', async () => {
        fetchWithRetryMock.mockImplementation(async () => LISTING_WITH_VARIATION);
        const { records } = await fetchGrantAwards(15, false, new Set(), false, undefined, NOW);
        const variation = records.find((r) => r.gaId === 'GA270901-V1');
        const plain = records.find((r) => r.variesGaId === null);
        expect(variation?.event_type).toBe('AWARD_VARIATION');
        expect(plain?.event_type).toBe('NEW_LISTING');
    });

    it('onlyNew=true with a fully-seen state returns zero records and stops early (does not walk the whole listing)', async () => {
        fetchWithRetryMock.mockImplementation(async (path) => (pageOf(path) <= 2 ? LISTING_PAGE1 : NO_MORE_RESULTS));
        const seenIds = new Set(page1Ids);
        const { records } = await fetchGrantAwards(100, false, seenIds, true, undefined, NOW);
        expect(records.length).toBe(0);
        expect(fetchWithRetryMock).toHaveBeenCalledTimes(2); // proves early-stop, not a full walk
    });

    it('onlyNew=true with a partially-seen state returns only the unseen records, correctly flagged is_new=true', async () => {
        fetchWithRetryMock.mockImplementation(async (path) => (pageOf(path) === 1 ? LISTING_PAGE1 : NO_MORE_RESULTS));
        const seenIds = new Set(page1Ids.slice(1)); // everything except the newest award
        const { records } = await fetchGrantAwards(100, false, seenIds, true, undefined, NOW);
        expect(records.map((r) => r.gaId)).toEqual([page1Ids[0]]);
        expect(records[0].is_new).toBe(true);
    });

    it('dateRange excludes records whose Publish Date falls outside the window', async () => {
        fetchWithRetryMock.mockImplementation(async (path) => (pageOf(path) === 1 ? LISTING_PAGE1 : NO_MORE_RESULTS));
        // Every record on this fixture is dated "4-Sep-2026" - anchoring `now`
        // far in the future guarantees all of them are outside a 24h window,
        // regardless of the exact fixture dates.
        const veryFuture = new Date('2099-01-01T00:00:00.000Z');
        const { records } = await fetchGrantAwards(15, false, new Set(), false, '24h', veryFuture);
        expect(records.length).toBe(0);
    });

    it('dateRange keeps a record whose Publish Date genuinely falls inside the window (not just always excluding)', async () => {
        fetchWithRetryMock.mockImplementation(async (path) => (pageOf(path) === 1 ? LISTING_PAGE1 : NO_MORE_RESULTS));
        // Anchoring `now` to the same real Publish Date ("4-Sep-2026") the
        // fixture carries proves the filter is a genuine window check, not a
        // bug that happens to reject everything.
        const sameDay = new Date('2026-09-04T18:00:00.000Z');
        const { records } = await fetchGrantAwards(15, false, new Set(), false, '24h', sameDay);
        expect(records.length).toBe(15);
    });
});
