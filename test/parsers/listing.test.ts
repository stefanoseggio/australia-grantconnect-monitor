import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';

import { parseListingArticles } from '../../src/parsers/listing.js';

const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));

describe('parseListingArticles against the real Ga/ListResult page', () => {
    it('extracts all 15 awards on the page with the right summary fields', () => {
        const html = readFileSync(`${fixturesDir}/grant_awards_list_page1.html`, 'utf-8');
        const $ = cheerio.load(html);

        const items = parseListingArticles($);
        expect(items.length).toBe(15);

        const first = items[0];
        expect(first.gaId).toBe('GA578886');
        expect(first.gaHref).toBe('/Ga/Show/937de059-5cbb-415f-bc83-bcb5619e1379');
        expect(first.agency).toContain('Department of Infrastructure');
        expect(first.publishDate).toBe('4-Sep-2026');
        expect(first.category).toBe('Transport');
        expect(first.grantTerm).toBe('4-Sep-2026 to 30-Nov-2027');
        expect(first.valueAud).toBe('$225,000.00');
        expect(first.recipientName).toBe('Regional Express Pty Ltd');
        expect(first.variesGaId).toBeNull();
    });

    it('captures the "Varies" link when a record is a variation of an earlier award', () => {
        const html = readFileSync(`${fixturesDir}/grant_awards_list_with_variation.html`, 'utf-8');
        const $ = cheerio.load(html);

        const items = parseListingArticles($);
        const variation = items.find((item) => item.gaId === 'GA270901-V1');
        expect(variation).toBeDefined();
        expect(variation!.variesGaId).toBe('GA270901');
        expect(variation!.variesHref).toBe('/Ga/Show/56fe146d-852f-490b-b153-3d4ecd96b43b');
        expect(variation!.recipientName).toBe('Kewarra Lifestyles Pty Ltd');
    });
});
