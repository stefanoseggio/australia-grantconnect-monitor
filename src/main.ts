import { Actor, log } from 'apify';

import type { Candidate, WalkResult } from './fetchGrantAwards.js';
import { enrichBatch, walkListing } from './fetchGrantAwards.js';
import { resolveInput } from './input.js';
import type { DeltaState } from './state.js';
import { loadState, markSeen, saveState, stateStoreName } from './state.js';
import type { GrantAwardRecord } from './types.js';
import { listingUrl } from './urls.js';

// Pay-per-event names. Both must exist in the actor's pricing configuration
// on the platform (see README "Pricing"): a detail-enriched record is charged
// as `result`, a listing-only record (fetchDetail=false, or a detail page
// that could not be fetched) as the cheaper `result-summary`.
const EVENT_DETAIL = 'result';
const EVENT_SUMMARY = 'result-summary';

const DELIVERY_BATCH_SIZE = 15;
const PERSIST_EVERY_N_DELIVERED = 50;

await Actor.init();
try {
    await run();
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.exception(error instanceof Error ? error : new Error(message), 'Run failed');
    await Actor.setValue('LAST_ERROR', { message, at: new Date().toISOString() });
    await Actor.fail(`GrantConnect extraction failed: ${message}`);
}
await Actor.exit();

async function run(): Promise<void> {
    const now = new Date();
    const runAt = now.toISOString();
    const resolved = resolveInput((await Actor.getInput()) ?? {}, now);
    const { filters, options } = resolved;

    log.info(`Query: ${listingUrl(filters)}`);
    log.info(
        `Mode: ${options.onlyNew ? 'delta (only new/updated)' : 'full'} | sort=${filters.orderBy} | maxItems=${options.maxItems} | fetchDetail=${options.fetchDetail} | concurrency=${options.maxConcurrency}`,
    );

    const storeName = stateStoreName(options.deltaStateName);
    const state = await loadState(storeName, resolved.filtersSignature, options.resetState);
    log.info(
        `Delta state store: ${storeName} (${Object.keys(state.seen).length} known ids, watermark ${state.watermark ?? 'none'})`,
    );

    const walk = await walkListing({
        filters,
        maxItems: options.maxItems,
        onlyNew: options.onlyNew,
        seen: state.seen,
        watermark: state.watermark,
        agencyNameContains: options.agencyNameContains,
        eventTypes: options.eventTypes,
    });
    const matched = walk.totalMatching !== null ? walk.totalMatching.toLocaleString('en-AU') : 'unknown';
    log.info(
        `Walk finished: ${walk.candidates.length} to deliver, ${walk.excluded.length} excluded, ${walk.pagesWalked} page(s), stop=${walk.stopReason}, ${matched} matching on GrantConnect.`,
    );
    await Actor.setStatusMessage(
        `Found ${walk.candidates.length} record(s) to deliver (${matched} match your filters on GrantConnect). Fetching detail...`,
    );

    const delivery = await deliver(walk, state, storeName, runAt, options, now);

    // Records that were walked but intentionally not delivered (unchanged in
    // delta mode, or filtered client-side) become "seen" only once the run
    // completed normally - never on a crash, so nothing is lost.
    for (const c of walk.excluded) markSeen(state, c.item.gaId, c.lastUpdatedIso);
    await saveState(storeName, state, runAt);

    const byType = countBy(delivery.records, (r) => r.event_type);
    const summary = {
        delivered: delivery.records.length,
        byEventType: byType,
        detailFetched: delivery.records.filter((r) => r.detailFetched).length,
        detailFailed: delivery.records.filter((r) => options.fetchDetail && !r.detailFetched).length,
        totalMatchingOnGrantConnect: walk.totalMatching,
        pagesWalked: walk.pagesWalked,
        stopReason: walk.stopReason,
        truncatedByMaxItems: walk.truncatedByMaxItems,
        chargeLimitReached: delivery.chargeLimitReached,
        excluded: countBy(walk.excluded, (c) => c.excludedBy ?? 'none'),
        mode: options.onlyNew ? 'delta' : 'full',
        deltaStateStore: storeName,
        knownIdsAfterRun: Object.keys(state.seen).length,
        listingUrl: listingUrl(filters),
        runAt,
    };
    await Actor.setValue('OUTPUT', summary);

    const parts = [`${summary.delivered} delivered`];
    if (byType.NEW_LISTING) parts.push(`${byType.NEW_LISTING} new`);
    if (byType.AWARD_VARIATION) parts.push(`${byType.AWARD_VARIATION} variations`);
    if (byType.UPDATED) parts.push(`${byType.UPDATED} updated`);
    if (summary.detailFailed) parts.push(`${summary.detailFailed} without detail`);
    if (walk.truncatedByMaxItems) parts.push('maxItems reached - more available');
    if (delivery.chargeLimitReached) parts.push('spending limit reached');
    await Actor.setStatusMessage(`${parts.join(' · ')} · ${matched} matching on GrantConnect`, {
        isStatusMessageTerminal: true,
    });
    log.info(`Done: ${parts.join(', ')}.`);
}

interface DeliveryResult {
    records: GrantAwardRecord[];
    chargeLimitReached: boolean;
}

/**
 * Delivers candidates OLDEST-FIRST in small batches, persisting the seen-set
 * only for records actually stored (and charged). Oldest-first matters: if a
 * run dies half-way, the undelivered records are the NEWEST ones, i.e. the
 * exact rows the next delta walk visits first - so nothing is ever skipped.
 * The trade-off is that the dataset is a chronological append-only log; the
 * dataset views display it newest-first.
 */
async function deliver(
    walk: WalkResult,
    state: DeltaState,
    storeName: string,
    runAt: string,
    options: ReturnType<typeof resolveInput>['options'],
    now: Date,
): Promise<DeliveryResult> {
    const queue: Candidate[] = [...walk.candidates].reverse();
    const records: GrantAwardRecord[] = [];
    const { isPayPerEvent } = Actor.getChargingManager().getPricingInfo();
    let sinceLastPersist = 0;
    let chargeLimitReached = false;
    let dirty = false;

    const persist = async (): Promise<void> => {
        if (!dirty) return;
        await saveState(storeName, state, runAt);
        dirty = false;
        sinceLastPersist = 0;
    };
    const onPlatformEvent = (): void => {
        void persist();
    };
    Actor.on('migrating', onPlatformEvent);
    Actor.on('aborting', onPlatformEvent);

    try {
        for (let offset = 0; offset < queue.length && !chargeLimitReached; offset += DELIVERY_BATCH_SIZE) {
            const batch = queue.slice(offset, offset + DELIVERY_BATCH_SIZE);
            const built = await enrichBatch(batch, {
                fetchDetail: options.fetchDetail,
                maxConcurrency: options.maxConcurrency,
                now,
            });

            // Charge the enriched price only for records that really carry detail.
            const groups: { eventName: string; items: { record: GrantAwardRecord; candidate: Candidate }[] }[] = [
                { eventName: EVENT_DETAIL, items: [] },
                { eventName: EVENT_SUMMARY, items: [] },
            ];
            built.forEach((record, i) => {
                groups[record.detailFetched ? 0 : 1].items.push({ record, candidate: batch[i] });
            });

            for (const group of groups) {
                if (group.items.length === 0 || chargeLimitReached) continue;
                const result = await Actor.pushData(
                    group.items.map((g) => g.record),
                    group.eventName,
                );
                // In pay-per-event mode the SDK stores only as many items as the
                // customer's spending limit allows and reports that count; outside
                // PPE (local runs, tests) everything is stored and nothing charged.
                const stored = isPayPerEvent ? result.chargedCount : group.items.length;
                for (const { record, candidate } of group.items.slice(0, stored)) {
                    records.push(record);
                    markSeen(state, candidate.item.gaId, candidate.lastUpdatedIso);
                    dirty = true;
                    sinceLastPersist += 1;
                }
                if (result.eventChargeLimitReached) {
                    chargeLimitReached = true;
                    log.warning(
                        `Spending limit reached after ${records.length} record(s) - stopping. Undelivered records will be picked up by the next run.`,
                    );
                }
            }
            if (sinceLastPersist >= PERSIST_EVERY_N_DELIVERED) await persist();
            log.info(`Delivered ${records.length}/${queue.length}.`);
        }
    } finally {
        await persist();
        Actor.off('migrating', onPlatformEvent);
        Actor.off('aborting', onPlatformEvent);
    }
    return { records, chargeLimitReached };
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
    return out;
}
