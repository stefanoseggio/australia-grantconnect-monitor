export type DateRangePreset = '24h' | '7d' | '30d';

const WINDOW_MS: Record<DateRangePreset, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// GrantConnect renders Publish Date as "D-Mmm-YYYY" with the day NOT
// zero-padded (e.g. "6-Jan-2022", "28-Oct-2022") - verified against real
// listing fixtures. This is the site's own display format, distinct from
// the zero-padded "DD-Mmm-YYYY" its search inputs require (see
// `formatSiteDate` in urls.ts).
export function parseGrantConnectDate(value: string | null): Date | null {
    if (!value) return null;
    const match = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (!match) return null;
    const [, day, monthStr, year] = match;
    const month = MONTHS.indexOf(monthStr);
    if (month === -1) return null;
    return new Date(Date.UTC(Number(year), month, Number(day)));
}

export function isWithinDateRange(date: Date | null, preset: DateRangePreset | undefined, now: Date): boolean {
    if (!preset) return true;
    if (!date) return false;
    return now.getTime() - date.getTime() <= WINDOW_MS[preset];
}
