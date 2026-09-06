import { describe, expect, it } from 'vitest';

import { isWithinDateRange, parseGrantConnectDate } from '../src/dateFilter.js';

describe('parseGrantConnectDate', () => {
    it('parses a real double-digit-day "D-Mmm-YYYY" value', () => {
        const date = parseGrantConnectDate('28-Oct-2022');
        expect(date?.toISOString()).toBe('2022-10-28T00:00:00.000Z');
    });

    it("parses a real single-digit-day value (day not zero-padded, unlike the site's own input format)", () => {
        const date = parseGrantConnectDate('4-Sep-2026');
        expect(date?.toISOString()).toBe('2026-09-04T00:00:00.000Z');
    });

    it('returns null for null/empty/malformed input', () => {
        expect(parseGrantConnectDate(null)).toBeNull();
        expect(parseGrantConnectDate('')).toBeNull();
        expect(parseGrantConnectDate('2026-09-04')).toBeNull();
        expect(parseGrantConnectDate('not a date')).toBeNull();
        expect(parseGrantConnectDate('4-Foo-2026')).toBeNull(); // unrecognized month abbreviation
    });
});

describe('isWithinDateRange', () => {
    const now = new Date('2026-09-06T12:00:00.000Z');

    it('always passes when no preset is given', () => {
        expect(isWithinDateRange(null, undefined, now)).toBe(true);
        expect(isWithinDateRange(parseGrantConnectDate('1-Jan-2010'), undefined, now)).toBe(true);
    });

    it('rejects a null date when a preset is given', () => {
        expect(isWithinDateRange(null, '24h', now)).toBe(false);
    });

    it('correctly buckets a date at each preset boundary', () => {
        const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
        const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
        const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

        expect(isWithinDateRange(twelveHoursAgo, '24h', now)).toBe(true);
        expect(isWithinDateRange(threeDaysAgo, '24h', now)).toBe(false);

        expect(isWithinDateRange(threeDaysAgo, '7d', now)).toBe(true);
        expect(isWithinDateRange(twentyDaysAgo, '7d', now)).toBe(false);

        expect(isWithinDateRange(twentyDaysAgo, '30d', now)).toBe(true);
        expect(isWithinDateRange(sixtyDaysAgo, '30d', now)).toBe(false);
    });
});
