import { describe, expect, it } from 'vitest';

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
    shortHash,
    siteCalendarDate,
    splitGrantTerm,
    uuidFromPath,
    valueBand,
    yesNoToBoolean,
} from '../src/normalize.js';

describe('site dates (Canberra clock)', () => {
    it('parses the non-zero-padded display format and the zero-padded input format', () => {
        expect(parseSiteDate('4-Sep-2026')).toBe('2026-09-04');
        expect(parseSiteDate('28-Oct-2022')).toBe('2022-10-28');
        expect(parseSiteDate('06-Sep-2026')).toBe('2026-09-06');
        expect(parseSiteDate('2026-09-04')).toBeNull();
        expect(parseSiteDate('4-Foo-2026')).toBeNull();
        expect(parseSiteDate(null)).toBeNull();
    });

    it('converts "(ACT Local Time)" timestamps to UTC with the right DST offset', () => {
        // September = AEST (UTC+10)
        expect(parseSiteDateTime('4-Sep-2026 4:16 pm (ACT Local Time)')).toBe('2026-09-04T06:16:00.000Z');
        // November = AEDT (UTC+11)
        expect(parseSiteDateTime('23-Nov-2023 1:19 pm (ACT Local Time)')).toBe('2023-11-23T02:19:00.000Z');
        // 12 am / 12 pm edge cases
        expect(parseSiteDateTime('6-Jan-2022 12:32 am (ACT Local Time)')).toBe('2022-01-05T13:32:00.000Z');
        expect(parseSiteDateTime('6-Jan-2022 12:05 pm (ACT Local Time)')).toBe('2022-01-06T01:05:00.000Z');
    });

    it('degrades a bare date to Canberra midnight and rejects garbage', () => {
        expect(parseSiteDateTime('4-Sep-2026')).toBe('2026-09-03T14:00:00.000Z');
        expect(parseSiteDateTime('nonsense')).toBeNull();
        expect(parseSiteDateTime(null)).toBeNull();
    });

    it("reports the Canberra calendar date (an award published at 9am Canberra is still 'yesterday' in UTC)", () => {
        expect(siteCalendarDate(new Date('2026-09-06T15:00:00.000Z'))).toBe('2026-09-07'); // 01:00 AEST next day
        expect(siteCalendarDate(new Date('2026-09-06T13:00:00.000Z'))).toBe('2026-09-06'); // 23:00 AEST same day
    });
});

describe('money and ABN', () => {
    it('parses values with thousands separators and the GST note', () => {
        expect(parseAudValue('$225,000.00')).toBe(225000);
        expect(parseAudValue('$1,093,485.00 (GST inclusive where applicable)')).toBe(1093485);
        expect(parseAudValue('$0.00')).toBe(0);
        expect(parseAudValue('-')).toBeNull();
        expect(parseAudValue(null)).toBeNull();
    });

    it('buckets values into bands', () => {
        expect(valueBand(9_999)).toBe('<10k');
        expect(valueBand(225_000)).toBe('100k-1M');
        expect(valueBand(80_820_000)).toBe('>=10M');
        expect(valueBand(null)).toBeNull();
    });

    it('normalises and checksums ABNs (real ABNs from the register are valid, a made-up one is not)', () => {
        expect(normalizeAbn('46 101 325 642')).toBe('46101325642');
        expect(normalizeAbn('-')).toBeNull();
        expect(isValidAbn('46101325642')).toBe(true); // Regional Express Pty Ltd
        expect(isValidAbn('79609903844')).toBe(true); // Kewarra Lifestyles Pty Ltd
        expect(isValidAbn('12345678901')).toBe(false);
        expect(isValidAbn(null)).toBeNull();
    });
});

describe('terms, financial years and ids', () => {
    it('derives the Australian financial year (1 Jul - 30 Jun)', () => {
        expect(financialYear('2026-09-04')).toBe('2026-27');
        expect(financialYear('2026-03-01')).toBe('2025-26');
        expect(financialYear('2026-07-01')).toBe('2026-27');
        expect(financialYear('2026-06-30')).toBe('2025-26');
        expect(financialYear(null)).toBeNull();
    });

    it('splits a grant term and counts inclusive days', () => {
        expect(splitGrantTerm('4-Sep-2026 to 30-Nov-2027')).toEqual({ start: '4-Sep-2026', end: '30-Nov-2027' });
        expect(splitGrantTerm(null)).toEqual({ start: null, end: null });
        expect(daysBetweenInclusive('2022-10-25', '2023-10-31')).toBe(372);
        expect(daysUntil('2026-09-10', '2026-09-06')).toBe(4);
        expect(daysUntil('2026-09-01', '2026-09-06')).toBe(-5);
    });

    it('decomposes variation ids and extracts UUIDs', () => {
        expect(parseGaId('GA270901-V1')).toEqual({ isVariation: true, variationNumber: 1, baseGaId: 'GA270901' });
        expect(parseGaId('GA578886')).toEqual({ isVariation: false, variationNumber: null, baseGaId: 'GA578886' });
        expect(uuidFromPath('/Ga/Show/937de059-5cbb-415f-bc83-bcb5619e1379')).toBe(
            '937de059-5cbb-415f-bc83-bcb5619e1379',
        );
        expect(uuidFromPath('/Ga/List')).toBeNull();
    });

    it('classifies recipients by legal-name pattern', () => {
        expect(classifyRecipient('Regional Express Pty Ltd')).toBe('company');
        expect(classifyRecipient('Cessnock City Council')).toBe('local_government');
        expect(classifyRecipient('University of Melbourne')).toBe('university');
        expect(classifyRecipient('Milingimbi Art and Cultural Aboriginal Corporation')).toBe('aboriginal_corporation');
        expect(classifyRecipient('The Trustee for Mantiyupwi Family Trust')).toBe('trust');
        expect(classifyRecipient('KADJINA COMMUNITY INCORPORATED')).toBe('incorporated_association');
        expect(classifyRecipient('Multiple')).toBe('multiple');
        expect(classifyRecipient(null)).toBeNull();
    });

    it('maps Yes/No and hashes deterministically', () => {
        expect(yesNoToBoolean('Yes')).toBe(true);
        expect(yesNoToBoolean('No')).toBe(false);
        expect(yesNoToBoolean('-')).toBeNull();
        expect(shortHash('a')).toBe(shortHash('a'));
        expect(shortHash('a')).not.toBe(shortHash('b'));
        expect(shortHash('x')).toMatch(/^[0-9a-f]{8}$/);
    });
});
