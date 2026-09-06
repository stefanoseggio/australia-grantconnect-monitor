import { siteCalendarDate } from './normalize.js';
import type { ListingFilters } from './types.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "YYYY-MM-DD" -> the site's required search-input format "DD-Mmm-YYYY" (e.g. "06-Sep-2026"). */
export function isoToSiteDate(isoDate: string): string {
    const [y, m, d] = isoDate.split('-').map(Number);
    return `${String(d).padStart(2, '0')}-${MONTHS[m - 1]}-${y}`;
}

/** Today's calendar date in Canberra, in the site's input format. */
export function formatSiteDate(instant: Date): string {
    return isoToSiteDate(siteCalendarDate(instant));
}

// GrantConnect's mandatory Grant Award reporting took effect 31 Dec 2017;
// 2010 is a safely-early lower bound. The far-future upper bound removes any
// dependency on the UTC-vs-Canberra day boundary (an award published at 9am
// Canberra time is still "tomorrow" in UTC for ten hours).
export const ARCHIVE_START = '01-Jan-2010';
export const FAR_FUTURE = '31-Dec-2099';

export const RESULTS_PER_PAGE = 15;

/**
 * Builds the /Ga/ListResult query. Every parameter name was live-verified
 * 2026-09-06 against the real "Advanced Search" form (see AGENTS.md):
 * - Category accepts several codes COMMA-JOINED (Category=231,381 -> the
 *   union); a repeated parameter is ignored beyond the first.
 * - DateType=Current / Closed take no DateStart/DateEnd.
 * - orderBy=Last Updated is descending (most recently touched first) and is
 *   the only order that surfaces variations of old awards near the top.
 */
export function listingPath(filters: ListingFilters, page: number): string {
    const params = new URLSearchParams();
    params.set('Type', 'Ga');
    params.set('AgencyStatus', '-1');
    params.set('DateType', filters.dateType);
    if (filters.dateType !== 'Current' && filters.dateType !== 'Closed') {
        params.set('DateStart', filters.dateStart ?? ARCHIVE_START);
        params.set('DateEnd', filters.dateEnd ?? FAR_FUTURE);
    }
    if (filters.keyword) {
        params.set('Keyword', filters.keyword);
        params.set('KeywordTypeSearch', filters.keywordMatch);
    }
    if (filters.categories.length > 0) params.set('Category', filters.categories.join(','));
    if (filters.recipientName) params.set('RecipientName', filters.recipientName);
    if (filters.recipientAbn) params.set('RecipientAbn', filters.recipientAbn);
    if (filters.valueStart !== null) params.set('valueStart', String(filters.valueStart));
    if (filters.valueEnd !== null) params.set('valueEnd', String(filters.valueEnd));
    if (filters.goId) params.set('GOID', filters.goId);
    if (filters.isAdHoc !== null) params.set('isAdHoc', filters.isAdHoc);
    if (filters.isAggregate !== null) params.set('isAggregate', filters.isAggregate);
    params.set('orderBy', filters.orderBy);
    params.set('page', String(page));
    return `/Ga/ListResult?${params.toString()}`;
}

/** Human-readable listing URL (page 1) for logs, status messages and the run summary. */
export function listingUrl(filters: ListingFilters): string {
    return `https://www.grants.gov.au${listingPath(filters, 1)}`;
}

// The 29 top-level categories of the site's own Category picker (codes are
// the form's option values). The listing/detail "Category" field shows a
// SUB-category label (e.g. "Medical Research"), so this map is used for the
// input picker only, never to reinterpret a record's own category text.
export const CATEGORIES: Record<string, string> = {
    '381': 'Academic Research',
    '101': 'Ageing',
    '111': 'Agriculture',
    '121': 'Arts and Culture',
    '131': 'Children, Youth and Youth at Risk',
    '141': 'Community Development',
    '151': 'Crime, Justice and Legal Issues',
    '161': 'Cultural and Linguistic Diversity',
    '371': 'Diplomacy Services',
    '171': 'Disability',
    '181': 'Disaster Relief',
    '191': 'Education',
    '201': 'Employment and Training',
    '211': 'Environment, Energy and Resources',
    '221': 'Government and Politics',
    '231': 'Health, Wellbeing and Medical Research',
    '241': 'Housing and Homelessness',
    '251': 'Indigenous',
    '261': 'Industry',
    '271': 'Information and Communication',
    '281': 'International Aid and Development',
    '291': 'Local Government',
    '301': 'Philanthropy, Voluntarism and Not-for-Profits Infrastructure',
    '311': 'Recreation and Sport',
    '321': 'Science and Technology',
    '331': 'Social Inclusion and Social Justice',
    '341': 'Trade and Tourism',
    '351': 'Transport and Infrastructure',
    '361': 'Veterans and Defence',
};
