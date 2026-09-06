import type { CheerioAPI } from 'cheerio';

import { linkIn, parseListDesc } from './listDesc.js';

export interface ListingItem {
    gaId: string;
    gaHref: string;
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

// Each award is one `<article role="article">` block - the listing itself
// already carries the commercially-relevant summary fields (agency, value,
// category, recipient, dates), so no detail fetch is strictly required for
// a baseline record. Verified live 2026-09-06 against /Ga/ListResult.
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
