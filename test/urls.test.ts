import { describe, expect, it } from 'vitest';

import type { ListingFilters } from '../src/types.js';
import { CATEGORIES, formatSiteDate, isoToSiteDate, listingPath } from '../src/urls.js';

const base: ListingFilters = {
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

function params(path: string): URLSearchParams {
    return new URL(`https://x${path}`).searchParams;
}

describe('listingPath', () => {
    it('builds the live-verified default query (full archive, newest activity first)', () => {
        const p = params(listingPath(base, 3));
        expect(p.get('Type')).toBe('Ga');
        expect(p.get('AgencyStatus')).toBe('-1');
        expect(p.get('DateType')).toBe('Publish Date');
        expect(p.get('DateStart')).toBe('01-Jan-2010');
        expect(p.get('DateEnd')).toBe('31-Dec-2099');
        expect(p.get('orderBy')).toBe('Last Updated');
        expect(p.get('page')).toBe('3');
        expect(p.has('Keyword')).toBe(false);
        expect(p.has('Category')).toBe(false);
    });

    it('maps every filter to its server-side parameter, comma-joining categories', () => {
        const p = params(
            listingPath(
                {
                    ...base,
                    keyword: 'solar farm',
                    keywordMatch: 'ExactPhrase',
                    categories: ['231', '381'],
                    recipientName: 'Regional Express',
                    recipientAbn: '46101325642',
                    valueStart: 1_000_000,
                    valueEnd: 5_000_000,
                    goId: 'GO6105',
                    dateType: 'Approval Date',
                    dateStart: '01-Jul-2025',
                    dateEnd: '30-Jun-2026',
                    isAdHoc: '1',
                    isAggregate: '0',
                    orderBy: 'Publish Date',
                },
                1,
            ),
        );
        expect(p.get('Keyword')).toBe('solar farm');
        expect(p.get('KeywordTypeSearch')).toBe('ExactPhrase');
        expect(p.get('Category')).toBe('231,381');
        expect(p.get('RecipientName')).toBe('Regional Express');
        expect(p.get('RecipientAbn')).toBe('46101325642');
        expect(p.get('valueStart')).toBe('1000000');
        expect(p.get('valueEnd')).toBe('5000000');
        expect(p.get('GOID')).toBe('GO6105');
        expect(p.get('DateType')).toBe('Approval Date');
        expect(p.get('DateStart')).toBe('01-Jul-2025');
        expect(p.get('DateEnd')).toBe('30-Jun-2026');
        expect(p.get('isAdHoc')).toBe('1');
        expect(p.get('isAggregate')).toBe('0');
        expect(p.get('orderBy')).toBe('Publish Date');
    });

    it('omits the date range for Current / Closed (the site ignores it there)', () => {
        const p = params(listingPath({ ...base, dateType: 'Current', dateStart: '01-Jan-2026' }, 1));
        expect(p.get('DateType')).toBe('Current');
        expect(p.has('DateStart')).toBe(false);
        expect(p.has('DateEnd')).toBe(false);
    });
});

describe('site date formatting', () => {
    it('renders the zero-padded DD-Mmm-YYYY form the search inputs require', () => {
        expect(isoToSiteDate('2026-09-06')).toBe('06-Sep-2026');
        expect(formatSiteDate(new Date('2026-09-06T15:00:00.000Z'))).toBe('07-Sep-2026'); // Canberra is already on the 7th
    });

    it('ships the 29 official category codes', () => {
        expect(Object.keys(CATEGORIES)).toHaveLength(29);
        expect(CATEGORIES['231']).toBe('Health, Wellbeing and Medical Research');
        expect(CATEGORIES['381']).toBe('Academic Research');
    });
});
