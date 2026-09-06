import type { CheerioAPI } from 'cheerio';

import { linkIn, parseListDesc } from './listDesc.js';

export interface DetailFields {
    approvalDate: string | null;
    variationPublishDate: string | null;
    variationDate: string | null;
    oneOffAdHoc: string | null;
    aggregateGrantAward: string | null;
    pbsProgramName: string | null;
    grantProgram: string | null;
    grantActivity: string | null;
    purpose: string | null;
    goId: string | null;
    goTitle: string | null;
    goHref: string | null;
    internalReferenceId: string | null;
    selectionProcess: string | null;
    confidentialityContract: string | null;
    confidentialityOutputs: string | null;
    recipientAbn: string | null;
    recipientSuburb: string | null;
    recipientTownCity: string | null;
    recipientPostcode: string | null;
    recipientState: string | null;
    recipientCountry: string | null;
    agencyContactPhone: string | null;
    agencyContactEmail: string | null;
}

// The page repeats State/Territory, Postcode and Country under BOTH
// "Grant Recipient Location" and "Grant Delivery Location" - a flat,
// whole-page label lookup would have the second section silently
// overwrite the first. Real bug caught before shipping: sections are
// `<hr>`-separated, each starting with a `<div class="list-desc"><span><h2>`
// header, so this scopes extraction to just the rows between one h2 and
// the next `<hr>`.
function parseSection($: CheerioAPI, headerText: string): Record<string, string> {
    const header = $('h2')
        .filter((_i, el) => $(el).text().trim() === headerText)
        .first();
    if (header.length === 0) return {};

    const headerBlock = header.closest('.list-desc');
    const rows = headerBlock.nextUntil('hr');
    const fields: Record<string, string> = {};
    rows.filter('.list-desc').each((_i, el) => {
        const $el = $(el);
        const label = $el.children('span').first().text().replace(/\s+/g, ' ').trim().replace(/:$/, '');
        if (!label) return;
        const $value = $el.children('div.list-desc-inner').first();
        if ($value.length === 0) return;
        fields[label] = $value.text().replace(/\s+/g, ' ').trim();
    });
    return fields;
}

export function parseDetail($: CheerioAPI): DetailFields {
    const root = $.root();
    const fields = parseListDesc($, root);
    const goLink = linkIn($, root, 'GO ID');
    const recipientLocation = parseSection($, 'Grant Recipient Location');

    // The whole Contact Details box is duplicated once for desktop (.pc) and
    // once for mobile (.sp) - the same responsive-duplication pattern found
    // in this portfolio's other actors (e.g. HSE's paginator). `.first()` is
    // required here, or `.closest('p')` matches both copies and `.text()`
    // silently concatenates them.
    const phoneP = $('label[for="AgencyContactPhone"]').first().closest('p');
    const agencyContactPhone = phoneP.length
        ? phoneP
              .text()
              .replace(/^\s*Phone\s*:\s*/i, '')
              .trim() || null
        : null;

    const emailP = $('label[for="AgencyContactEmail"]').first().closest('p');
    const agencyContactEmail = emailP.find('a').first().text().trim() || null;

    return {
        approvalDate: fields['Approval Date'] ?? null,
        variationPublishDate: fields['Variation Publish Date'] ?? null,
        variationDate: fields['Variation Date'] ?? null,
        oneOffAdHoc: fields['One-off/Ad hoc'] ?? null,
        aggregateGrantAward: fields['Aggregate Grant Award'] ?? null,
        pbsProgramName: fields['PBS Program Name'] ?? null,
        grantProgram: fields['Grant Program'] ?? null,
        grantActivity: fields['Grant Activity'] ?? null,
        purpose: fields.Purpose ?? null,
        goId: goLink?.text ?? null,
        goTitle: fields['GO Title'] ?? null,
        goHref: goLink?.href ?? null,
        internalReferenceId: fields.InternalReferenceId ?? null,
        selectionProcess: fields['Selection Process'] ?? null,
        confidentialityContract: fields['Confidentiality - Contract'] ?? null,
        confidentialityOutputs: fields['Confidentiality - Outputs'] ?? null,
        recipientAbn: fields['Recipient ABN'] ?? null,
        recipientSuburb: recipientLocation.Suburb ?? null,
        recipientTownCity: recipientLocation['Town/City'] ?? null,
        recipientPostcode: recipientLocation.Postcode ?? null,
        recipientState: recipientLocation['State/Territory'] ?? null,
        recipientCountry: recipientLocation.Country ?? null,
        agencyContactPhone,
        agencyContactEmail,
    };
}
