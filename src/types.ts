export type EventType = 'NEW_LISTING' | 'AWARD_VARIATION' | 'UPDATED';
export type KeywordMatch = 'AllWord' | 'AnyWord' | 'ExactPhrase';
export type DateType = 'Publish Date' | 'Approval Date' | 'Start Date' | 'End Date' | 'Current' | 'Closed';
export type SortBy = 'Last Updated' | 'Publish Date' | 'Relevance';
export type TriState = 'any' | 'yes' | 'no';
/** Legacy v1 preset, still honoured and mapped onto `dateFrom`. */
export type DateRangePreset = '24h' | '7d' | '30d';

export interface ActorInput {
    // Filters (all optional; every one maps to a server-side search parameter
    // on grants.gov.au except agencyNameContains and eventTypes)
    keyword?: string;
    keywordMatch?: KeywordMatch;
    categories?: string[];
    agencyNameContains?: string;
    recipientName?: string;
    recipientAbn?: string;
    minValueAud?: number;
    maxValueAud?: number;
    goId?: string;
    dateType?: DateType;
    dateFrom?: string;
    dateTo?: string;
    oneOffAdHoc?: TriState;
    aggregateGrantAward?: TriState;
    eventTypes?: EventType[];
    // Monitoring / delta
    onlyNew?: boolean;
    sortBy?: SortBy;
    deltaStateName?: string;
    resetState?: boolean;
    // Performance & limits
    maxItems?: number;
    fetchDetail?: boolean;
    maxConcurrency?: number;
    /** @deprecated use dateFrom */
    dateRange?: DateRangePreset;
}

/** Fully resolved server-side query for /Ga/ListResult. */
export interface ListingFilters {
    keyword: string | null;
    keywordMatch: KeywordMatch;
    categories: string[];
    recipientName: string | null;
    recipientAbn: string | null;
    valueStart: number | null;
    valueEnd: number | null;
    goId: string | null;
    dateType: DateType;
    /** DD-Mmm-YYYY or null (Current/Closed take no range) */
    dateStart: string | null;
    dateEnd: string | null;
    isAdHoc: '1' | '0' | null;
    isAggregate: '1' | '0' | null;
    orderBy: SortBy;
}

export interface GrantAwardRecord {
    // ---- Standardised B2B envelope (shared across this portfolio's fleet) ----
    record_id: string;
    event_type: EventType;
    scraped_at: string;
    is_new: boolean;
    source_url: string;
    data_source: string;

    // ---- Identity ----
    gaId: string;
    gaUuid: string | null;
    isVariation: boolean;
    variationNumber: number | null;
    baseGaId: string;
    variesGaId: string | null;
    variesUrl: string | null;
    title: string | null;

    // ---- Listing fields (always present, raw site strings) ----
    agency: string | null;
    category: string | null;
    publishDate: string | null;
    grantTerm: string | null;
    valueAud: string | null;
    recipientName: string | null;
    lastUpdated: string | null;

    // ---- Normalised siblings ----
    publishDateIso: string | null;
    lastUpdatedIso: string | null;
    valueAudNumber: number | null;
    valueBand: string | null;
    grantStartDate: string | null;
    grantEndDate: string | null;
    grantStartDateIso: string | null;
    grantEndDateIso: string | null;
    grantTermDays: number | null;
    daysUntilGrantEnd: number | null;
    isCurrent: boolean | null;
    financialYear: string | null;
    grantStartFinancialYear: string | null;
    recipientEntityType: string | null;

    // ---- Detail page fields (null when fetchDetail=false or detail unavailable) ----
    detailFetched: boolean;
    detailError: string | null;
    agencyCurrentName: string | null;
    approvalDate: string | null;
    approvalDateIso: string | null;
    variationPublishDate: string | null;
    variationPublishDateIso: string | null;
    variationDate: string | null;
    variationDateIso: string | null;
    oneOffAdHoc: string | null;
    isOneOffAdHoc: boolean | null;
    aggregateGrantAward: string | null;
    isAggregate: boolean | null;
    aggregateReason: string | null;
    numberOfAwardsAggregated: number | null;
    gstInclusive: boolean | null;
    pbsProgramName: string | null;
    grantProgram: string | null;
    grantActivity: string | null;
    purpose: string | null;
    goId: string | null;
    goUuid: string | null;
    goTitle: string | null;
    goUrl: string | null;
    internalReferenceId: string | null;
    selectionProcess: string | null;
    confidentialityContract: string | null;
    isContractConfidential: boolean | null;
    confidentialityReasonContract: string | null;
    confidentialityOutputs: string | null;
    isOutputsConfidential: boolean | null;
    confidentialityReasonOutputs: string | null;
    recipientAbn: string | null;
    recipientAbnNormalized: string | null;
    recipientAbnValid: boolean | null;
    abrLookupUrl: string | null;
    recipientSuburb: string | null;
    recipientTownCity: string | null;
    recipientPostcode: string | null;
    recipientState: string | null;
    recipientCountry: string | null;
    deliverySuburb: string | null;
    deliveryTownCity: string | null;
    deliveryPostcode: string | null;
    deliveryState: string | null;
    deliveryCountry: string | null;
    agencyContactName: string | null;
    agencyContactPhone: string | null;
    agencyContactEmail: string | null;
}

export const DATA_SOURCE_ATTRIBUTION =
    'GrantConnect (grants.gov.au), Australian Government Department of Finance, CC BY 3.0 AU';
