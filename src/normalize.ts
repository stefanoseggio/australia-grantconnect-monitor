// Pure normalisation helpers for the raw strings GrantConnect renders.
// Every function is total: invalid input yields null, never throws.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// GrantConnect is operated from Canberra and every timestamp it renders is
// labelled "(ACT Local Time)". ACT observes AEST (UTC+10) and AEDT (UTC+11,
// first Sunday of October -> first Sunday of April). Using the IANA zone via
// Intl keeps DST correct without a dependency.
export const SITE_TIME_ZONE = 'Australia/Canberra';

const siteDateParts = new Intl.DateTimeFormat('en-AU', {
    timeZone: SITE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
});

/** Calendar date (YYYY-MM-DD) of an instant as seen from Canberra. */
export function siteCalendarDate(instant: Date): string {
    const parts = Object.fromEntries(siteDateParts.formatToParts(instant).map((p) => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Offset (minutes east of UTC) that Canberra applies at the given instant. */
function siteOffsetMinutes(instant: Date): number {
    const parts = Object.fromEntries(siteDateParts.formatToParts(instant).map((p) => [p.type, p.value]));
    const hour = Number(parts.hour) % 24; // Intl may render midnight as "24"
    const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute));
    return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** Convert a Canberra wall-clock time to a UTC instant (DST-aware, two-pass). */
export function siteLocalToUtc(year: number, month: number, day: number, hour = 0, minute = 0): Date {
    const naive = Date.UTC(year, month - 1, day, hour, minute);
    const firstGuess = new Date(naive - siteOffsetMinutes(new Date(naive)) * 60_000);
    // Re-evaluate the offset at the guessed instant so DST transitions resolve correctly.
    return new Date(naive - siteOffsetMinutes(firstGuess) * 60_000);
}

/**
 * Site display date "D-Mmm-YYYY" (day NOT zero-padded, e.g. "6-Jan-2022") -> "YYYY-MM-DD".
 * Also tolerates the zero-padded "DD-Mmm-YYYY" form the search inputs use.
 */
export function parseSiteDate(value: string | null | undefined): string | null {
    if (!value) return null;
    const match = value.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (!match) return null;
    const [, day, monthStr, year] = match;
    const month = MONTHS.findIndex((m) => m.toLowerCase() === monthStr.toLowerCase());
    if (month === -1) return null;
    const d = Number(day);
    if (d < 1 || d > 31) return null;
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" -> the UTC instant of that calendar day's midnight in Canberra. */
export function isoDateToSiteMidnightUtc(isoDate: string | null): Date | null {
    if (!isoDate) return null;
    const [y, m, d] = isoDate.split('-').map(Number);
    if (!y || !m || !d) return null;
    return siteLocalToUtc(y, m, d);
}

/**
 * "4-Sep-2026 4:16 pm (ACT Local Time)" -> UTC ISO-8601 instant.
 * This is the only field on the register with time-of-day precision and the
 * key the delta engine uses for change detection.
 */
export function parseSiteDateTime(value: string | null | undefined): string | null {
    if (!value) return null;
    const match = value.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
    if (!match) {
        // Fall back to a bare date (midnight Canberra) so a format drift still yields a usable instant.
        const date = parseSiteDate(value.trim().split(/\s+/)[0]);
        return date ? (isoDateToSiteMidnightUtc(date)?.toISOString() ?? null) : null;
    }
    const [, day, monthStr, year, hourStr, minuteStr, meridiem] = match;
    const month = MONTHS.findIndex((m) => m.toLowerCase() === monthStr.toLowerCase());
    if (month === -1) return null;
    let hour = Number(hourStr) % 12;
    if (meridiem.toLowerCase() === 'pm') hour += 12;
    return siteLocalToUtc(Number(year), month + 1, Number(day), hour, Number(minuteStr)).toISOString();
}

/** "$1,093,485.00 (GST inclusive where applicable)" -> 1093485 */
export function parseAudValue(value: string | null | undefined): number | null {
    if (!value) return null;
    const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const n = Number(match[0]);
    return Number.isFinite(n) ? n : null;
}

export function valueBand(value: number | null): string | null {
    if (value === null) return null;
    if (value < 10_000) return '<10k';
    if (value < 100_000) return '10k-100k';
    if (value < 1_000_000) return '100k-1M';
    if (value < 10_000_000) return '1M-10M';
    return '>=10M';
}

/** "79 609 903 844" -> "79609903844"; anything that is not 11 digits -> null. */
export function normalizeAbn(value: string | null | undefined): string | null {
    if (!value) return null;
    const digits = value.replace(/\D/g, '');
    return digits.length === 11 ? digits : null;
}

// Australian Business Register checksum: subtract 1 from the first digit,
// weight the 11 digits by [10,1,3,5,7,9,11,13,15,17,19], sum mod 89 === 0.
const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
export function isValidAbn(digits: string | null): boolean | null {
    if (!digits || digits.length !== 11 || !/^\d{11}$/.test(digits)) return null;
    let sum = 0;
    for (let i = 0; i < 11; i++) {
        const d = Number(digits[i]) - (i === 0 ? 1 : 0);
        sum += d * ABN_WEIGHTS[i];
    }
    return sum % 89 === 0;
}

/** Australian financial year (1 Jul - 30 Jun) of an ISO date, e.g. "2026-09-04" -> "2026-27". */
export function financialYear(isoDate: string | null): string | null {
    if (!isoDate) return null;
    const [y, m] = isoDate.split('-').map(Number);
    if (!y || !m) return null;
    const startYear = m >= 7 ? y : y - 1;
    return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** "4-Sep-2026 to 30-Nov-2027" -> { start, end } (raw site strings, either may be null). */
export function splitGrantTerm(term: string | null | undefined): { start: string | null; end: string | null } {
    if (!term) return { start: null, end: null };
    const match = term.match(/^(.+?)\s+to\s+(.+)$/i);
    if (!match) return { start: null, end: null };
    return { start: match[1].trim(), end: match[2].trim() };
}

/** Whole days between two ISO dates, inclusive of both ends (25-Oct-2022..31-Oct-2023 = 372). */
export function daysBetweenInclusive(startIso: string | null, endIso: string | null): number | null {
    if (!startIso || !endIso) return null;
    const a = Date.UTC(
        ...((startIso.split('-').map(Number) as [number, number, number]).map((v, i) => (i === 1 ? v - 1 : v)) as [
            number,
            number,
            number,
        ]),
    );
    const b = Date.UTC(
        ...((endIso.split('-').map(Number) as [number, number, number]).map((v, i) => (i === 1 ? v - 1 : v)) as [
            number,
            number,
            number,
        ]),
    );
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.round((b - a) / 86_400_000) + 1;
}

/** Signed whole days from `todayIso` to `endIso` (negative once the term has ended). */
export function daysUntil(endIso: string | null, todayIso: string): number | null {
    if (!endIso) return null;
    const days = daysBetweenInclusive(todayIso, endIso);
    return days === null ? null : days - 1;
}

/** "GA270901-V1" -> { isVariation: true, variationNumber: 1, baseGaId: "GA270901" } */
export function parseGaId(gaId: string): { isVariation: boolean; variationNumber: number | null; baseGaId: string } {
    const match = gaId.match(/^(GA\d+)-V(\d+)$/i);
    if (!match) return { isVariation: false, variationNumber: null, baseGaId: gaId };
    return { isVariation: true, variationNumber: Number(match[2]), baseGaId: match[1] };
}

/** "/Ga/Show/937de059-5cbb-415f-bc83-bcb5619e1379" -> "937de059-5cbb-415f-bc83-bcb5619e1379" */
export function uuidFromPath(path: string | null | undefined): string | null {
    if (!path) return null;
    const match = path.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    return match ? match[1].toLowerCase() : null;
}

export type RecipientEntityType =
    | 'company'
    | 'local_government'
    | 'university'
    | 'aboriginal_corporation'
    | 'incorporated_association'
    | 'trust'
    | 'government'
    | 'multiple'
    | 'other';

/** Coarse recipient segmentation from the legal-name suffixes the register uses. */
export function classifyRecipient(name: string | null | undefined): RecipientEntityType | null {
    if (!name) return null;
    const n = name.trim().toUpperCase();
    if (n === 'MULTIPLE') return 'multiple';
    if (/ABORIGINAL|TORRES STRAIT|INDIGENOUS CORPORATION|\bRNTBC\b/.test(n)) return 'aboriginal_corporation';
    if (/\bUNIVERSITY\b|\bUNIVERSIT[AE]/.test(n)) return 'university';
    if (/\b(SHIRE|COUNCIL|CITY OF|MUNICIPAL|REGIONAL COUNCIL|TOWN OF)\b/.test(n)) return 'local_government';
    if (/\bTRUSTEE\b|\bTRUST\b/.test(n)) return 'trust';
    if (/\b(DEPARTMENT|MINISTRY|AUTHORITY|COMMISSION|STATE OF|TERRITORY|GOVERNMENT)\b/.test(n)) return 'government';
    if (/\b(INCORPORATED|INC\.?|ASSOCIATION)\b/.test(n)) return 'incorporated_association';
    if (/\b(PTY|LTD|LIMITED|P\/L|PROPRIETARY)\b/.test(n)) return 'company';
    return 'other';
}

export function yesNoToBoolean(value: string | null | undefined): boolean | null {
    if (!value) return null;
    const v = value.trim().toLowerCase();
    if (v === 'yes') return true;
    if (v === 'no') return false;
    return null;
}

/** The register renders "-" for an absent value on the detail page. */
export function blankToNull(value: string | null | undefined): string | null {
    if (value === undefined || value === null) return null;
    const v = value.trim();
    return v === '' || v === '-' ? null : v;
}

/** Stable short hash (FNV-1a) used to derive a delta-state store name from the filter set. */
export function shortHash(input: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        // eslint-disable-next-line no-bitwise
        h ^= input.charCodeAt(i);
        // eslint-disable-next-line no-bitwise
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}
