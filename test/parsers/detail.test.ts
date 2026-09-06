import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';

import { parseDetail } from '../../src/parsers/detail.js';

const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));

describe('parseDetail against the real Ga/Show page', () => {
    const html = readFileSync(`${fixturesDir}/grant_award_detail_00000146.html`, 'utf-8');
    const $ = cheerio.load(html);
    const detail = parseDetail($);

    it('extracts the flat program/purpose/reference fields', () => {
        expect(detail.approvalDate).toBe('7-Sep-2022');
        expect(detail.variationPublishDate).toBe('23-Nov-2023');
        expect(detail.variationDate).toBe('22-Nov-2023');
        expect(detail.oneOffAdHoc).toBe('No');
        expect(detail.aggregateGrantAward).toBe('No');
        expect(detail.pbsProgramName).toBe('DoHDA 22/23 Hlth Output 2.3 Pharmaceutical Benefits');
        expect(detail.grantProgram).toBe('Aged Care Medication Management');
        expect(detail.grantActivity).toBe('Supporting Medication Management in Residential Aged Care');
        expect(detail.purpose).toContain('poor medication management in residential aged care');
        expect(detail.internalReferenceId).toBe('4-HPGUJRH');
        expect(detail.selectionProcess).toBe('Demand Driven');
        expect(detail.confidentialityContract).toBe('No');
        expect(detail.confidentialityOutputs).toBe('No');
        expect(detail.recipientAbn).toBe('79 609 903 844');
    });

    it('resolves the originating Grant Opportunity link', () => {
        expect(detail.goId).toBe('GO5666');
        expect(detail.goTitle).toContain('Supporting Medication Management in Residential Aged Care Initiative');
        expect(detail.goHref).toBe('/Go/Show?GoUuid=c851f44a-1dfa-4b29-96fb-f18e271b3ae6');
    });

    it('scopes Recipient Location fields away from the duplicate Delivery Location section', () => {
        // real bug caught before shipping: State/Territory, Postcode and Country
        // appear twice on this page (Recipient Location, then Delivery Location) -
        // a flat whole-page label lookup would silently return the wrong section's value.
        expect(detail.recipientSuburb).toBe('KEWARRA BEACH');
        expect(detail.recipientTownCity).toBe('KEWARRA BEACH');
        expect(detail.recipientPostcode).toBe('4879');
        expect(detail.recipientState).toBe('QLD');
        expect(detail.recipientCountry).toBe('AUSTRALIA');
    });

    it('extracts agency contact phone and email from the non-list-desc sidebar box', () => {
        expect(detail.agencyContactPhone).toBe('1800 020 283');
        expect(detail.agencyContactEmail).toBe('GPS.Helpdesk@communitygrants.gov.au');
    });
});
