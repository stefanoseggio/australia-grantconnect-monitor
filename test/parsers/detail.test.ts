import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';

import { parseDetail } from '../../src/parsers/detail.js';

const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));

describe('parseDetail against the real Ga/Show page of a variation award', () => {
    const html = readFileSync(`${fixturesDir}/grant_award_detail_00000146.html`, 'utf-8');
    const detail = parseDetail(cheerio.load(html));

    it('extracts the flat program/purpose/reference fields', () => {
        expect(detail.agency).toBe('Department of Health, Disability and Ageing');
        expect(detail.approvalDate).toBe('7-Sep-2022');
        expect(detail.variationPublishDate).toBe('23-Nov-2023');
        expect(detail.variationDate).toBe('22-Nov-2023');
        expect(detail.variesGaId).toBe('GA270901');
        expect(detail.valueAudDetail).toMatch(/^\$24,200\.00 \(GST inclusive where applicable\)$/);
        expect(detail.oneOffAdHoc).toBe('No');
        expect(detail.aggregateGrantAward).toBe('No');
        expect(detail.aggregateReason).toBeNull();
        expect(detail.numberOfAwardsAggregated).toBeNull();
        expect(detail.pbsProgramName).toBe('DoHDA 22/23 Hlth Output 2.3 Pharmaceutical Benefits');
        expect(detail.grantProgram).toBe('Aged Care Medication Management');
        expect(detail.grantActivity).toBe('Supporting Medication Management in Residential Aged Care');
        expect(detail.purpose).toContain('poor medication management in residential aged care');
        expect(detail.internalReferenceId).toBe('4-HPGUJRH');
        expect(detail.selectionProcess).toBe('Demand Driven');
        expect(detail.confidentialityContract).toBe('No');
        expect(detail.confidentialityReasonContract).toBeNull();
        expect(detail.confidentialityOutputs).toBe('No');
        expect(detail.recipientAbn).toBe('79 609 903 844');
    });

    it('resolves the originating Grant Opportunity link', () => {
        expect(detail.goId).toBe('GO5666');
        expect(detail.goTitle).toContain('Supporting Medication Management in Residential Aged Care Initiative');
        expect(detail.goHref).toBe('/Go/Show?GoUuid=c851f44a-1dfa-4b29-96fb-f18e271b3ae6');
    });

    it('scopes Recipient Location away from the duplicate-labelled Delivery Location section, and extracts both', () => {
        // real bug caught before shipping: State/Territory, Postcode and Country
        // appear twice on this page (Recipient Location, then Delivery Location) -
        // a flat whole-page label lookup would silently return the wrong section's value.
        expect(detail.recipientLocation).toEqual({
            suburb: 'KEWARRA BEACH',
            townCity: 'KEWARRA BEACH',
            postcode: '4879',
            state: 'QLD',
            country: 'AUSTRALIA',
        });
        expect(detail.deliveryLocation.state).toBe('QLD');
        expect(detail.deliveryLocation.country).toBe('AUSTRALIA');
        expect(detail.deliveryLocation.suburb).toBeNull();
    });

    it('extracts the agency contact block (name, phone, email) from the responsive-duplicated sidebar', () => {
        expect(detail.agencyContactName).toBe('GPS Helpdesk');
        expect(detail.agencyContactPhone).toBe('1800 020 283');
        expect(detail.agencyContactEmail).toBe('GPS.Helpdesk@communitygrants.gov.au');
    });
});

describe('parseDetail against a real Aggregate Grant Award (multiple recipients, confidential)', () => {
    const html = readFileSync(`${fixturesDir}/grant_award_detail_aggregate.html`, 'utf-8');
    const detail = parseDetail(cheerio.load(html));

    it('reads the aggregate-only fields and the confidentiality reasons', () => {
        expect(detail.agency).toBe('Office of National Intelligence');
        expect(detail.aggregateGrantAward).toBe('Yes');
        expect(detail.aggregateReason).toBe('Statutory Requirements');
        expect(detail.numberOfAwardsAggregated).toBe(3);
        expect(detail.oneOffAdHoc).toBe('Yes');
        expect(detail.confidentialityContract).toBe('Yes');
        expect(detail.confidentialityReasonContract).toBe('Statutory secrecy provisions');
        expect(detail.confidentialityOutputs).toBe('Yes');
        expect(detail.confidentialityReasonOutputs).toBe('Statutory secrecy provisions');
        expect(detail.goId).toBe('GO7098');
        expect(detail.internalReferenceId).toBe('NIPG Special Round 2024');
    });

    it('maps the "-" placeholder ABN to null and keeps the multi-state delivery location verbatim', () => {
        expect(detail.recipientAbn).toBeNull();
        expect(detail.recipientLocation.state).toBe('National');
        expect(detail.recipientLocation.postcode).toBeNull();
        expect(detail.deliveryLocation.state).toBe('ACT, VIC');
        expect(detail.deliveryLocation.postcode).toBe('Multiple');
        expect(detail.deliveryLocation.country).toBe('AUSTRALIA');
    });
});
