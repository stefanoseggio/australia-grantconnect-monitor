import { log } from 'apify';

import { normalizeAbn, shortHash, siteCalendarDate } from './normalize.js';
import type { ActorInput, DateType, EventType, KeywordMatch, ListingFilters, SortBy, TriState } from './types.js';
import { CATEGORIES, isoToSiteDate } from './urls.js';

export interface RunOptions {
    maxItems: number;
    fetchDetail: boolean;
    onlyNew: boolean;
    maxConcurrency: number;
    agencyNameContains: string | null;
    eventTypes: ReadonlySet<EventType>;
    deltaStateName: string;
    resetState: boolean;
}

export interface ResolvedInput {
    filters: ListingFilters;
    options: RunOptions;
    /** Stable hash of everything that changes WHICH records a run returns (used to name the delta store). */
    filtersSignature: string;
}

const ALL_EVENT_TYPES: EventType[] = ['NEW_LISTING', 'AWARD_VARIATION', 'UPDATED'];
const KEYWORD_MATCHES: KeywordMatch[] = ['AllWord', 'AnyWord', 'ExactPhrase'];
const DATE_TYPES: DateType[] = ['Publish Date', 'Approval Date', 'Start Date', 'End Date', 'Current', 'Closed'];
const SORTS: SortBy[] = ['Last Updated', 'Publish Date', 'Relevance'];

export const MAX_ITEMS_HARD_CAP = 100_000;
export const MAX_CONCURRENCY_HARD_CAP = 10;

class InputError extends Error {
    constructor(message: string) {
        super(`Invalid input: ${message}`);
        this.name = 'InputError';
    }
}

function text(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const v = value.trim();
    return v === '' ? null : v;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T, field: string): T {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
    throw new InputError(`${field} must be one of ${allowed.join(', ')} (got "${String(value)}")`);
}

function tri(value: unknown, field: string): '1' | '0' | null {
    const v = oneOf<TriState>(value, ['any', 'yes', 'no'], 'any', field);
    if (v === 'yes') return '1';
    if (v === 'no') return '0';
    return null;
}

function money(value: unknown, field: string): number | null {
    if (value === undefined || value === null || value === '') return null;
    const n = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.]/g, ''));
    if (!Number.isFinite(n) || n < 0) throw new InputError(`${field} must be a non-negative number (AUD)`);
    return Math.round(n);
}

/**
 * Accepts the Apify datepicker's absolute ("2026-07-01") and relative
 * ("7 days", "2 weeks", "3 months", "1 year") forms, plus the legacy v1
 * presets ("24h" | "7d" | "30d"). Relative windows count back from today's
 * calendar date in Canberra (GrantConnect's own clock). Returns YYYY-MM-DD.
 */
export function resolveDate(value: unknown, now: Date, field: string): string | null {
    const v = text(value);
    if (!v) return null;
    const absolute = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (absolute) {
        const [, , m, d] = absolute.map(Number);
        if (m < 1 || m > 12 || d < 1 || d > 31) throw new InputError(`${field} "${v}" is not a valid date`);
        return v;
    }
    const legacy = v.match(/^(\d+)([hd])$/i);
    const relative = v.match(/^(\d+)\s*(day|week|month|year)s?$/i);
    let amount: number;
    let unit: string;
    if (legacy) {
        amount = legacy[2].toLowerCase() === 'h' ? Math.max(1, Math.ceil(Number(legacy[1]) / 24)) : Number(legacy[1]);
        unit = 'day';
    } else if (relative) {
        amount = Number(relative[1]);
        unit = relative[2].toLowerCase();
    } else {
        throw new InputError(`${field} must be YYYY-MM-DD or a relative window like "7 days" (got "${v}")`);
    }
    const [y, m, d] = siteCalendarDate(now).split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (unit === 'day') date.setUTCDate(date.getUTCDate() - amount);
    else if (unit === 'week') date.setUTCDate(date.getUTCDate() - amount * 7);
    else if (unit === 'month') date.setUTCMonth(date.getUTCMonth() - amount);
    else date.setUTCFullYear(date.getUTCFullYear() - amount);
    return date.toISOString().slice(0, 10);
}

export function resolveInput(raw: ActorInput, now: Date): ResolvedInput {
    const keyword = text(raw.keyword);
    const categories = (Array.isArray(raw.categories) ? raw.categories : [])
        .map((c) => String(c).trim())
        .filter((c) => c !== '');
    for (const code of categories) {
        if (!CATEGORIES[code])
            throw new InputError(`unknown category code "${code}" (see the input form for the 29 valid codes)`);
    }
    const abnRaw = text(raw.recipientAbn);
    const recipientAbn = abnRaw ? normalizeAbn(abnRaw) : null;
    if (abnRaw && !recipientAbn) throw new InputError(`recipientAbn "${abnRaw}" is not an 11-digit ABN`);
    const goId = text(raw.goId)?.toUpperCase() ?? null;
    if (goId && !/^GO\d+$/.test(goId)) throw new InputError(`goId "${goId}" should look like GO12345`);

    const valueStart = money(raw.minValueAud, 'minValueAud');
    const valueEnd = money(raw.maxValueAud, 'maxValueAud');
    if (valueStart !== null && valueEnd !== null && valueStart > valueEnd)
        throw new InputError('minValueAud is greater than maxValueAud');

    const dateType = oneOf<DateType>(raw.dateType, DATE_TYPES, 'Publish Date', 'dateType');
    let dateFromIso = resolveDate(raw.dateFrom, now, 'dateFrom');
    if (!dateFromIso && raw.dateRange) {
        dateFromIso = resolveDate(raw.dateRange, now, 'dateRange');
        log.warning(`dateRange is deprecated - use dateFrom (interpreted as dateFrom=${dateFromIso}).`);
    }
    const dateToIso = resolveDate(raw.dateTo, now, 'dateTo');
    if (dateFromIso && dateToIso && dateFromIso > dateToIso) throw new InputError('dateFrom is after dateTo');

    let orderBy = oneOf<SortBy>(raw.sortBy, SORTS, 'Last Updated', 'sortBy');
    if (orderBy === 'Relevance' && !keyword) {
        log.warning('sortBy=Relevance needs a keyword - falling back to Last Updated.');
        orderBy = 'Last Updated';
    }

    const filters: ListingFilters = {
        keyword,
        keywordMatch: oneOf<KeywordMatch>(raw.keywordMatch, KEYWORD_MATCHES, 'AllWord', 'keywordMatch'),
        categories: [...new Set(categories)].sort(),
        recipientName: text(raw.recipientName),
        recipientAbn,
        valueStart,
        valueEnd,
        goId,
        dateType,
        dateStart: dateFromIso ? isoToSiteDate(dateFromIso) : null,
        dateEnd: dateToIso ? isoToSiteDate(dateToIso) : null,
        isAdHoc: tri(raw.oneOffAdHoc, 'oneOffAdHoc'),
        isAggregate: tri(raw.aggregateGrantAward, 'aggregateGrantAward'),
        orderBy,
    };

    const eventTypesRaw = Array.isArray(raw.eventTypes) && raw.eventTypes.length > 0 ? raw.eventTypes : ALL_EVENT_TYPES;
    for (const t of eventTypesRaw) {
        if (!ALL_EVENT_TYPES.includes(t)) throw new InputError(`eventTypes contains unknown value "${String(t)}"`);
    }
    const agencyNameContains = text(raw.agencyNameContains);

    const onlyNew = raw.onlyNew === true;
    if (onlyNew && orderBy === 'Relevance') {
        throw new InputError(
            'onlyNew (delta mode) needs a deterministic order - use sortBy "Last Updated" or "Publish Date"',
        );
    }
    if (onlyNew && orderBy === 'Publish Date') {
        log.warning(
            'onlyNew with sortBy=Publish Date will miss variations of older awards (they keep the original Publish Date). sortBy=Last Updated is recommended for monitoring.',
        );
    }

    const maxItemsRaw = raw.maxItems === undefined || raw.maxItems === null ? 100 : Number(raw.maxItems);
    if (!Number.isFinite(maxItemsRaw) || maxItemsRaw < 1) throw new InputError('maxItems must be a positive integer');
    const maxItems = Math.min(Math.floor(maxItemsRaw), MAX_ITEMS_HARD_CAP);
    const concurrencyRaw =
        raw.maxConcurrency === undefined || raw.maxConcurrency === null ? 5 : Number(raw.maxConcurrency);
    const maxConcurrency = Math.max(
        1,
        Math.min(MAX_CONCURRENCY_HARD_CAP, Math.floor(Number.isFinite(concurrencyRaw) ? concurrencyRaw : 5)),
    );

    // Everything that changes which rows come back - but not how many
    // (maxItems) or how rich they are (fetchDetail) - defines the delta store.
    const signatureSource = JSON.stringify({
        ...filters,
        // A recency window moves every day; it must not fork the store daily.
        dateStart: null,
        dateEnd: null,
        agencyNameContains: agencyNameContains?.toLowerCase() ?? null,
        eventTypes: [...eventTypesRaw].sort(),
    });
    const filtersSignature = shortHash(signatureSource);
    const deltaStateName = text(raw.deltaStateName) ?? `auto-${filtersSignature}`;

    return {
        filters,
        options: {
            maxItems,
            fetchDetail: raw.fetchDetail !== false,
            onlyNew,
            maxConcurrency,
            agencyNameContains,
            eventTypes: new Set(eventTypesRaw),
            deltaStateName,
            resetState: raw.resetState === true,
        },
        filtersSignature,
    };
}
