import { describe, expect, it } from 'vitest';

import { fetchGrantAwards } from '../src/fetchGrantAwards.js';

// Live checks against the real GrantConnect site - skipped in CI (same
// lesson as every other actor in this portfolio: don't make CI depend on
// an external host with no uptime guarantee).
describe.skipIf(process.env.CI)('live fetchGrantAwards against the real GrantConnect site', () => {
    it('fetches real Grant Awards with full detail, newest first', async () => {
        const records = await fetchGrantAwards(3, true);
        expect(records.length).toBe(3);
        for (const record of records) {
            expect(record.gaId).toMatch(/^GA\d+/);
            expect(record.gaUrl).toContain('/Ga/Show/');
            expect(record.agency).toBeTruthy();
            expect(record.recipientName).toBeTruthy();
            expect(record.scrapedAt).toBeTruthy();
        }
        // at least one of the 3 newest awards should have a resolved purpose
        expect(records.some((r) => r.purpose)).toBe(true);
    }, 60_000);

    it('fetches real Grant Awards without detail (fast path)', async () => {
        const records = await fetchGrantAwards(2, false);
        expect(records.length).toBe(2);
        for (const record of records) {
            expect(record.purpose).toBeNull();
            expect(record.recipientAbn).toBeNull();
            expect(record.agency).toBeTruthy(); // still present from the listing itself
        }
    }, 30_000);

    it('paginates across multiple listing pages when maxItems exceeds one page', async () => {
        const records = await fetchGrantAwards(20, false);
        expect(records.length).toBe(20); // proves it advanced past the 15-item page size
        const ids = records.map((r) => r.gaId);
        expect(new Set(ids).size).toBe(ids.length); // no duplicates across pages
    }, 60_000);
});
