import type { CheerioAPI } from 'cheerio';

import { uuidFromPath } from '../normalize.js';
import { linkIn, parseListDesc } from './listDesc.js';

export interface ListingItem {
    gaId: string;
    gaHref: string;
    gaUuid: string | null;
    title: string | null;
    variesGaId: string | null;
    variesHref: string | null;
    agency: string | null;
    publishDate: string | null;
    category: string | null;
    grantTerm: string | null;
    valueAud: string | null;
    recipientName: string | null;
    lastUpdated: string | null;
}

export interface ListingPage {
    /** false when the body is not a Grant Award search-results page at all (WAF challenge, maintenance, redirect to the form). */
    isListingPage: boolean;
    items: ListingItem[];
    /** From "Showing 16-30 of 30 records"; null on a zero-result page. */
    totalMatching: number | null;
    showingFrom: number | null;
    showingTo: number | null;
    hasNext: boolean;
}

// Each award is one `<article role="article">` block - the listing itself
// already carries the commercially-relevant summary fields (agency, value,
// category, recipient, dates, last-updated), so no detail fetch is strictly
// required for a baseline record. Verified live 2026-09-06 against /Ga/ListResult.
export function parseListingArticles($: CheerioAPI): ListingItem[] {
    const items: ListingItem[] = [];
    $('article[role="article"]').each((_i, el) => {
        const $article = $(el);
        const gaLink = linkIn($, $article, 'GA ID');
        if (!gaLink) return; // defensive: skip a malformed row rather than crash the run

        const variesLink = linkIn($, $article, 'Varies');
        const fields = parseListDesc($, $article);
        const title = $article.find('p.font20').first().text().replace(/\s+/g, ' ').trim() || null;

        items.push({
            gaId: gaLink.text,
            gaHref: gaLink.href,
            gaUuid: uuidFromPath(gaLink.href),
            title,
            variesGaId: variesLink?.text ?? null,
            variesHref: variesLink?.href ?? null,
            agency: fields.Agency ?? null,
            publishDate: fields['Publish Date'] ?? null,
            category: fields.Category ?? null,
            grantTerm: fields['Grant Term'] ?? null,
            valueAud: fields['Value (AUD)'] ?? null,
            recipientName: fields['Recipient Name'] ?? null,
            lastUpdated: fields['Last Updated'] ?? null,
        });
    });
    return items;
}

// Live-verified page anatomy (2026-09-06):
// - a results page always carries an `<h2>Search Results</h2>` (also on a
//   zero-result query and on a page past the last one), plus
//   `<div class="total-result">Showing 1-15 of 360066 records</div>` and a
//   `li.next` link whenever there is a following page;
// - a zero-result query / page past the end has NO articles, an EMPTY
//   .total-result and no li.next - a legitimate end, not a block;
// - a CloudFront challenge, maintenance page or a redirect back to the
//   search form has none of these markers -> isListingPage=false.
export function parseListingPage($: CheerioAPI): ListingPage {
    const hasResultsHeading = $('h2').filter((_i, el) => $(el).text().trim() === 'Search Results').length > 0;
    const totalText = $('.total-result').first().text().replace(/\s+/g, ' ').trim();
    const totalMatch = totalText.match(/Showing\s+([\d,]+)\s*-\s*([\d,]+)\s+of\s+([\d,]+)\s+records?/i);
    const toInt = (s: string): number => Number(s.replace(/,/g, ''));
    return {
        isListingPage: hasResultsHeading || $('.total-result').length > 0,
        items: parseListingArticles($),
        totalMatching: totalMatch ? toInt(totalMatch[3]) : null,
        showingFrom: totalMatch ? toInt(totalMatch[1]) : null,
        showingTo: totalMatch ? toInt(totalMatch[2]) : null,
        hasNext: $('li.next a[href]').length > 0,
    };
}
