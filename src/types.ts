export interface ActorInput {
    maxItems: number;
    fetchDetail: boolean;
}

export interface GrantAwardRecord {
    gaId: string;
    gaUrl: string;
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
    scrapedAt: string;
}
