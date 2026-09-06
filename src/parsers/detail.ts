import type { Cheerio, CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';

import { blankToNull } from '../normalize.js';
import { linkIn, parseListDesc } from './listDesc.js';

export interface LocationFields {
    suburb: string | null;
    townCity: string | null;
    postcode: string | null;
    state: string | null;
    country: string | null;
}

export interface DetailFields {
    agency: string | null;
    approvalDate: string | null;
    variationPublishDate: string | null;
    variationDate: string | null;
    variesGaId: string | null;
    valueAudDetail: string | null;
    oneOffAdHoc: string | null;
    aggregateGrantAward: string | null;
    aggregateReason: string | null;
    numberOfAwardsAggregated: number | null;
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
    confidentialityReasonContract: string | null;
    confidentialityOutputs: string | null;
    confidentialityReasonOutputs: string | null;
    recipientAbn: string | null;
    recipientLocation: LocationFields;
    deliveryLocation: LocationFields;
    agencyContactName: string | null;
    agencyContactPhone: string | null;
    agencyContactEmail: string | null;
}

// The page repeats State/Territory, Postcode and Country under BOTH
// "Grant Recipient Location" and "Grant Delivery Location" - a flat,
// whole-page label lookup would have the second section silently overwrite
// the first. Sections are `<hr>`-separated, each starting with a
// `<div class="list-desc"><span><h2>` header, so this scopes extraction to
// the rows between one h2 and the next `<hr>` OR the next h2 header (the
// second guard means a missing <hr> can never let one section bleed into
// the next).
function parseSection($: CheerioAPI, headerText: string): Record<string, string> {
    const header = $('h2')
        .filter((_i, el) => $(el).text().trim() === headerText)
        .first();
    if (header.length === 0) return {};

    const fields: Record<string, string> = {};
    let node: Cheerio<AnyNode> = header.closest('.list-desc').next();
    while (node.length > 0) {
        if (node.is('hr') || node.find('h2').length > 0) break;
        if (node.is('.list-desc')) {
            const label = node.children('span').first().text().replace(/\s+/g, ' ').trim().replace(/:$/, '');
            const $value = node.children('div.list-desc-inner').first();
            if (label && $value.length > 0) fields[label] = $value.text().replace(/\s+/g, ' ').trim();
        }
        node = node.next();
    }
    return fields;
}

function locationFrom(section: Record<string, string>): LocationFields {
    return {
        suburb: blankToNull(section.Suburb),
        townCity: blankToNull(section['Town/City']),
        postcode: blankToNull(section.Postcode),
        state: blankToNull(section['State/Territory']),
        country: blankToNull(section.Country),
    };
}

function toInt(value: string | undefined): number | null {
    const v = blankToNull(value);
    if (!v) return null;
    const n = Number(v.replace(/[^\d]/g, ''));
    return Number.isFinite(n) && v.trim() !== '' ? n : null;
}

export function parseDetail($: CheerioAPI): DetailFields {
    const root = $.root();
    const fields = parseListDesc($, root);
    const goLink = linkIn($, root, 'GO ID');
    const variesLink = linkIn($, root, 'Varies');

    // The whole Contact Details box is duplicated once for desktop (.pc) and
    // once for mobile (.sp) - the same responsive-duplication pattern found
    // in this portfolio's other actors. `.first()` is required everywhere
    // here, or `.text()` silently concatenates both copies.
    const contactBox = $('.contact-heading').first().parent();
    const agencyContactName =
        contactBox
            .children('p')
            .filter((_i, el) => !$(el).is('.contact-heading') && $(el).find('label').length === 0)
            .first()
            .text()
            .replace(/\s+/g, ' ')
            .trim() || null;

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
        agency: blankToNull(fields.Agency),
        approvalDate: blankToNull(fields['Approval Date']),
        variationPublishDate: blankToNull(fields['Variation Publish Date']),
        variationDate: blankToNull(fields['Variation Date']),
        variesGaId: variesLink?.text ?? blankToNull(fields.Varies),
        valueAudDetail: blankToNull(fields['Value (AUD)']),
        oneOffAdHoc: blankToNull(fields['One-off/Ad hoc']),
        aggregateGrantAward: blankToNull(fields['Aggregate Grant Award']),
        aggregateReason: blankToNull(fields['Aggregate Reason']),
        numberOfAwardsAggregated: toInt(fields['Number of Awards Aggregated']),
        pbsProgramName: blankToNull(fields['PBS Program Name']),
        grantProgram: blankToNull(fields['Grant Program']),
        grantActivity: blankToNull(fields['Grant Activity']),
        purpose: blankToNull(fields.Purpose),
        goId: goLink?.text ?? blankToNull(fields['GO ID']),
        goTitle: blankToNull(fields['GO Title']),
        goHref: goLink?.href ?? null,
        internalReferenceId: blankToNull(fields.InternalReferenceId),
        selectionProcess: blankToNull(fields['Selection Process']),
        confidentialityContract: blankToNull(fields['Confidentiality - Contract']),
        confidentialityReasonContract: blankToNull(fields['Confidentiality Reason(s) - Contract']),
        confidentialityOutputs: blankToNull(fields['Confidentiality - Outputs']),
        confidentialityReasonOutputs: blankToNull(fields['Confidentiality Reason(s) - Outputs']),
        recipientAbn: blankToNull(fields['Recipient ABN']),
        recipientLocation: locationFrom(parseSection($, 'Grant Recipient Location')),
        deliveryLocation: locationFrom(parseSection($, 'Grant Delivery Location')),
        agencyContactName,
        agencyContactPhone,
        agencyContactEmail,
    };
}
