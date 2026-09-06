import { describe, expect, it } from 'vitest';

import { resolveDate, resolveInput } from '../src/input.js';

const NOW = new Date('2026-09-06T12:00:00.000Z'); // 22:00 AEST on 6 Sep in Canberra

describe('resolveDate', () => {
    it('accepts absolute dates, relative windows and the legacy presets, counting back from the Canberra calendar day', () => {
        expect(resolveDate('2026-07-01', NOW, 'x')).toBe('2026-07-01');
        expect(resolveDate('7 days', NOW, 'x')).toBe('2026-08-30');
        expect(resolveDate('2 weeks', NOW, 'x')).toBe('2026-08-23');
        expect(resolveDate('3 months', NOW, 'x')).toBe('2026-06-06');
        expect(resolveDate('1 year', NOW, 'x')).toBe('2025-09-06');
        expect(resolveDate('24h', NOW, 'x')).toBe('2026-09-05');
        expect(resolveDate('7d', NOW, 'x')).toBe('2026-08-30');
        expect(resolveDate('30d', NOW, 'x')).toBe('2026-08-07');
        expect(resolveDate('', NOW, 'x')).toBeNull();
        expect(() => resolveDate('next tuesday', NOW, 'x')).toThrow(/Invalid input/);
    });
});

describe('resolveInput', () => {
    it('applies the documented defaults for an empty input', () => {
        const r = resolveInput({}, NOW);
        expect(r.filters.orderBy).toBe('Last Updated');
        expect(r.filters.dateType).toBe('Publish Date');
        expect(r.filters.dateStart).toBeNull();
        expect(r.options).toMatchObject({
            maxItems: 100,
            fetchDetail: true,
            onlyNew: false,
            maxConcurrency: 5,
            resetState: false,
        });
        expect([...r.options.eventTypes].sort()).toEqual(['AWARD_VARIATION', 'NEW_LISTING', 'UPDATED']);
        expect(r.options.deltaStateName).toMatch(/^auto-[0-9a-f]{8}$/);
    });

    it('normalises the ABN, uppercases the GO ID, formats dates for the site and honours the legacy dateRange', () => {
        const r = resolveInput(
            { recipientAbn: '46 101 325 642', goId: 'go6105', dateRange: '7d', maxItems: 5000 },
            NOW,
        );
        expect(r.filters.recipientAbn).toBe('46101325642');
        expect(r.filters.goId).toBe('GO6105');
        expect(r.filters.dateStart).toBe('30-Aug-2026');
        expect(r.options.maxItems).toBe(5000);
    });

    it('rejects contradictory or malformed filters with a clear message', () => {
        expect(() => resolveInput({ minValueAud: 10, maxValueAud: 5 }, NOW)).toThrow(/minValueAud is greater/);
        expect(() => resolveInput({ recipientAbn: '123' }, NOW)).toThrow(/11-digit ABN/);
        expect(() => resolveInput({ categories: ['999'] }, NOW)).toThrow(/unknown category/);
        expect(() => resolveInput({ dateFrom: '2026-09-01', dateTo: '2026-08-01' }, NOW)).toThrow(
            /dateFrom is after dateTo/,
        );
        expect(() => resolveInput({ onlyNew: true, sortBy: 'Relevance', keyword: 'x' }, NOW)).toThrow(
            /deterministic order/,
        );
        expect(() => resolveInput({ eventTypes: ['BOGUS' as never] }, NOW)).toThrow(/eventTypes/);
    });

    it('clamps performance knobs to safe ranges', () => {
        const r = resolveInput({ maxItems: 10_000_000, maxConcurrency: 99 }, NOW);
        expect(r.options.maxItems).toBe(100_000);
        expect(r.options.maxConcurrency).toBe(10);
        expect(resolveInput({ maxConcurrency: 0 }, NOW).options.maxConcurrency).toBe(1);
    });

    it('derives the delta store from the filter set only - not from the recency window, maxItems or fetchDetail', () => {
        const a = resolveInput({ categories: ['231'], maxItems: 10, fetchDetail: false, dateFrom: '7 days' }, NOW);
        const b = resolveInput({ categories: ['231'], maxItems: 500, fetchDetail: true, dateFrom: '30 days' }, NOW);
        const c = resolveInput({ categories: ['381'] }, NOW);
        expect(a.filtersSignature).toBe(b.filtersSignature);
        expect(a.filtersSignature).not.toBe(c.filtersSignature);
        expect(resolveInput({ deltaStateName: 'health-watch' }, NOW).options.deltaStateName).toBe('health-watch');
    });
});
