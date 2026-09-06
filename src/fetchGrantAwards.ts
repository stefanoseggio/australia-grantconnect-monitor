import { log } from 'apify';
import * as cheerio from 'cheerio';

import { fetchWithRetry } from './http.js';
import type { DetailFields } from './parsers/detail.js';
import { parseDetail } from './parsers/detail.js';
import type { ListingItem } from './parsers/listing.js';
import { parseListingArticles } from './parsers/listing.js';
import type { GrantAwardRecord } from './types.js';
import { listingPath } from './urls.js';

const BASE_URL = 'https://www.grants.gov.au';

async function fetchListingItems(maxItems: number, now: Date): Promise<ListingItem[]> {
    const items: ListingItem[] = [];
    let page = 1;
    for (;;) {
        const html = await fetchWithRetry(listingPath(page, now));
        const $ = cheerio.load(html);
        const pageItems = parseListingArticles($);
        if (pageItems.length === 0) {
            log.info(`no more results at page ${page}.`);
            break;
        }

        for (const item of pageItems) {
            items.push(item);
            if (items.length >= maxItems) return items;
        }
        log.info(`page ${page}: ${pageItems.length} awards (${items.length} so far).`);
        page += 1;
    }
    return items;
}

function toRecord(item: ListingItem, detail: DetailFields): GrantAwardRecord {
    return {
        gaId: item.gaId,
        gaUrl: `${BASE_URL}${item.gaHref}`,
        title: item.title,
        variesGaId: item.variesGaId,
        variesUrl: item.variesHref ? `${BASE_URL}${item.variesHref}` : null,
        agency: item.agency,
        publishDate: item.publishDate,
        category: item.category,
        grantTerm: item.grantTerm,
        valueAud: item.valueAud,
        recipientName: item.recipientName,
        lastUpdated: item.lastUpdated,
        approvalDate: detail.approvalDate,
        variationPublishDate: detail.variationPublishDate,
        variationDate: detail.variationDate,
        oneOffAdHoc: detail.oneOffAdHoc,
        aggregateGrantAward: detail.aggregateGrantAward,
        pbsProgramName: detail.pbsProgramName,
        grantProgram: detail.grantProgram,
        grantActivity: detail.grantActivity,
        purpose: detail.purpose,
        goId: detail.goId,
        goTitle: detail.goTitle,
        goUrl: detail.goHref ? `${BASE_URL}${detail.goHref}` : null,
        internalReferenceId: detail.internalReferenceId,
        selectionProcess: detail.selectionProcess,
        confidentialityContract: detail.confidentialityContract,
        confidentialityOutputs: detail.confidentialityOutputs,
        recipientAbn: detail.recipientAbn,
        recipientSuburb: detail.recipientSuburb,
        recipientTownCity: detail.recipientTownCity,
        recipientPostcode: detail.recipientPostcode,
        recipientState: detail.recipientState,
        recipientCountry: detail.recipientCountry,
        agencyContactPhone: detail.agencyContactPhone,
        agencyContactEmail: detail.agencyContactEmail,
        scrapedAt: new Date().toISOString(),
    };
}

function emptyDetail(): DetailFields {
    return {
        approvalDate: null,
        variationPublishDate: null,
        variationDate: null,
        oneOffAdHoc: null,
        aggregateGrantAward: null,
        pbsProgramName: null,
        grantProgram: null,
        grantActivity: null,
        purpose: null,
        goId: null,
        goTitle: null,
        goHref: null,
        internalReferenceId: null,
        selectionProcess: null,
        confidentialityContract: null,
        confidentialityOutputs: null,
        recipientAbn: null,
        recipientSuburb: null,
        recipientTownCity: null,
        recipientPostcode: null,
        recipientState: null,
        recipientCountry: null,
        agencyContactPhone: null,
        agencyContactEmail: null,
    };
}

export async function fetchGrantAwards(
    maxItems: number,
    fetchDetail: boolean,
    now: Date = new Date(),
): Promise<GrantAwardRecord[]> {
    const items = await fetchListingItems(maxItems, now);

    if (!fetchDetail) {
        return items.map((item) => toRecord(item, emptyDetail()));
    }

    const records: GrantAwardRecord[] = [];
    for (const item of items) {
        const html = await fetchWithRetry(item.gaHref);
        const $ = cheerio.load(html);
        records.push(toRecord(item, parseDetail($)));
    }
    return records;
}
