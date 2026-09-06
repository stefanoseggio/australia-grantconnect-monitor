import { describe, expect, it } from 'vitest';

import { fetchGrantAwards } from '../src/fetchGrantAwards.js';
import { resolveInput } from '../src/input.js';

// Live checks against the real GrantConnect site. Opt-in (LIVE=1 npm test)
// so a developer's routine `npm test` and CI never depend on an external host.
const NOW = new Date();

function run(input: Parameters<typeof resolveInput>[0]) {
    const { filters, options } = resolveInput(input, NOW);
    return fetchGrantAwards({
        filters,
        maxItems: options.maxItems,
        onlyNew: options.onlyNew,
        seen: {},
        watermark: null,
        agencyNameContains: options.agencyNameContains,
        eventTypes: options.eventTypes,
        fetchDetail: options.fetchDetail,
        maxConcurrency: options.maxConcurrency,
        now: NOW,
    });
}

describe.skipIf(!process.env.LIVE)('live GrantConnect integration', () => {
    it('fetches the most recently updated awards with full detail', async () => {
        const { records, walk } = await run({ maxItems: 5 });
        expect(records.length).toBe(5);
        expect(walk.totalMatching).toBeGreaterThan(300_000);
        for (const r of records) {
            expect(r.gaId).toMatch(/^GA\d+/);
            expect(r.source_url).toContain('/Ga/Show/');
            expect(r.lastUpdatedIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
            expect(r.agency).toBeTruthy();
            expect(r.recipientName).toBeTruthy();
            expect(r.detailFetched).toBe(true);
        }
        expect(records.some((r) => r.purpose)).toBe(true);
    }, 90_000);

    it('server-side filters narrow the result (value floor + category) and paginate without duplicates', async () => {
        const { records, walk } = await run({
            minValueAud: 1_000_000,
            categories: ['231'],
            maxItems: 20,
            fetchDetail: false,
        });
        expect(records.length).toBe(20);
        expect(walk.totalMatching).toBeLessThan(100_000);
        expect(records.every((r) => (r.valueAudNumber ?? 0) >= 1_000_000)).toBe(true);
        expect(new Set(records.map((r) => r.gaId)).size).toBe(20);
    }, 90_000);

    it('looks up a single recipient by ABN', async () => {
        const { records } = await run({ recipientAbn: '46 101 325 642', fetchDetail: false, maxItems: 50 });
        expect(records.length).toBeGreaterThan(0);
        expect(records.every((r) => r.recipientName?.includes('Regional Express'))).toBe(true);
    }, 60_000);

    it('a zero-result query ends cleanly instead of being mistaken for a block', async () => {
        const { records, walk } = await run({ recipientAbn: '00000000000', fetchDetail: false });
        expect(records).toEqual([]);
        expect(walk.stopReason).toBe('end-of-results');
    }, 60_000);

    it('Last Updated order surfaces variations of old awards near the top (the reason delta mode sorts this way)', async () => {
        const { records } = await run({ maxItems: 60, fetchDetail: false, eventTypes: ['AWARD_VARIATION'] });
        // GrantConnect publishes variations most business days; 60 recently-updated rows
        // reliably include at least one.
        expect(records.length).toBeGreaterThan(0);
        expect(records.every((r) => r.isVariation)).toBe(true);
    }, 120_000);
});
