import type { DateRangePreset } from './dateFilter.js';

export type EventType = 'NEW_LISTING' | 'AWARD_VARIATION';

export interface ActorInput {
    maxItems: number;
    fetchDetail: boolean;
    onlyNew: boolean;
    dateRange?: DateRangePreset;
}

export interface GrantAwardRecord {
    gaId: string;
    title: string | null;
    variesGaId: string | null;
    variesUrl: string | null;
    agency: string | null;
    publishDate: string | null;
    category: string | null;
    grantTerm: string | null;
    valueAud: string | null;
    recipientName: string | null;
    lastUpdated: string | null;
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
    goUrl: string | null;
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
    // B2B integration metadata - standardized across this portfolio's fleet
    // so downstream webhook/Zapier/Make consumers need no per-actor parser.
    record_id: string;
    event_type: EventType;
    scraped_at: string;
    is_new: boolean;
    source_url: string;
}
