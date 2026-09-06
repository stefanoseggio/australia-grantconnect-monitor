const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Format required by the site's own date-range inputs, verified live:
// "DD-Mmm-YYYY", e.g. "06-Sep-2026".
export function formatSiteDate(date: Date): string {
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = MONTHS[date.getUTCMonth()];
    const year = date.getUTCFullYear();
    return `${day}-${month}-${year}`;
}

// GrantConnect's mandatory Grant Award reporting took effect 31 Dec 2017
// (stated on the site's own /Ga/List page); 2010 is used as a safely-early
// lower bound so the range never accidentally excludes real records.
const DATE_START = '01-Jan-2010';

// Live-verified 2026-09-06: this exact param set - reached by walking the
// real "Advanced Search" form on /Ga/List (DateType=Publish Date + a
// DateStart/DateEnd range + the required SearchButton=true field, which
// 302-redirects to /Ga/ListResult) - returns the FULL Grant Awards
// archive (360,066 records at audit time), and `orderBy=Publish Date`
// sorts newest-first by default (no separate asc/desc toggle needed -
// the first page's dates were the current date at fetch time). `page=N`
// (1-indexed) paginates, 15 records/page.
export function listingPath(page: number, now: Date): string {
    const params = new URLSearchParams({
        Type: 'Ga',
        AgencyStatus: '-1',
        DateType: 'Publish Date',
        DateStart: DATE_START,
        DateEnd: formatSiteDate(now),
        orderBy: 'Publish Date',
        page: String(page),
    });
    return `/Ga/ListResult?${params.toString()}`;
}
