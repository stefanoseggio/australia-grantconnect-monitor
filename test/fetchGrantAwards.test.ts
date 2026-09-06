import { describe, expect, it } from 'vitest';

import { fetchGrantAwards } from '../src/fetchGrantAwards.js';

const NO_SEEN = new Set<string>();
const NOW = new Date('2026-09-06T12:00:00.000Z');

// Live checks against the real GrantConnect site - skipped in CI (same
// lesson as every other actor in this portfolio: don't make CI depend on
// an external host with no uptime guarantee).
describe.skipIf(process.env.CI)('live fetchGrantAwards against the real GrantConnect site', () => {
    it('fetches real Grant Awards with full detail, newest first', async () => {
        const { records } = await fetchGrantAwards(3, true, NO_SEEN, false, undefined, NOW);
        expect(records.length).toBe(3);
        for (const record of records) {
            expect(record.gaId).toMatch(/^GA\d+/);
            expect(record.source_url).toContain('/Ga/Show/');
            expect(record.agency).toBeTruthy();
            expect(record.recipientName).toBeTruthy();
            expect(record.scraped_at).toBeTruthy();
            expect(record.record_id).toBe(record.gaId);
        }
        // at least one of the 3 newest awards should have a resolved purpose
        expect(records.some((r) => r.purpose)).toBe(true);
    }, 60_000);

    it('fetches real Grant Awards without detail (fast path)', async () => {
        const { records } = await fetchGrantAwards(2, false, NO_SEEN, false, undefined, NOW);
        expect(records.length).toBe(2);
        for (const record of records) {
            expect(record.purpose).toBeNull();
            expect(record.recipientAbn).toBeNull();
            expect(record.agency).toBeTruthy(); // still present from the listing itself
        }
    }, 30_000);

    it('paginates across multiple listing pages when maxItems exceeds one page', async () => {
        const { records } = await fetchGrantAwards(20, false, NO_SEEN, false, undefined, NOW);
        expect(records.length).toBe(20); // proves it advanced past the 15-item page size
        const ids = records.map((r) => r.gaId);
        expect(new Set(ids).size).toBe(ids.length); // no duplicates across pages
    }, 60_000);

    it('marks every record is_new=true on a cold run (empty seen-set)', async () => {
        const { records } = await fetchGrantAwards(3, false, NO_SEEN, false, undefined, NOW);
        expect(records.every((r) => r.is_new)).toBe(true);
    }, 30_000);

    it('delta mode (onlyNew): once the top ids are marked seen, a second run returns only what is genuinely new', async () => {
        // maxItems is a clean multiple of the 15-item page size so allIdsThisRun
        // captures two FULL pages, not a partial page truncated mid-page by the
        // maxItems cutoff (a partial page would leave some of page 1's own ids
        // unmarked as seen, making the "nothing new" assertion below flaky by
        // construction rather than by real site activity).
        const first = await fetchGrantAwards(30, false, NO_SEEN, false, undefined, NOW);
        expect(first.allIdsThisRun.length).toBe(30);
        const seenFromFirstRun = new Set(first.allIdsThisRun);

        // Second pass simulating "today's run" against the identical live state:
        // nothing genuinely new exists between the two calls seconds apart, so
        // onlyNew should short-circuit to zero results very quickly (early-stop
        // pagination), not silently return old records relabeled.
        const second = await fetchGrantAwards(50, false, seenFromFirstRun, true, undefined, NOW);
        expect(second.records.length).toBe(0);
    }, 60_000);

    it('dateRange filtering excludes records whose Publish Date falls outside the window', async () => {
        const veryOld = new Date('2099-01-01T00:00:00.000Z'); // guarantees every real Publish Date is "more than 24h old" from this vantage
        const { records } = await fetchGrantAwards(5, false, NO_SEEN, false, '24h', veryOld);
        expect(records.length).toBe(0);
    }, 30_000);
});
