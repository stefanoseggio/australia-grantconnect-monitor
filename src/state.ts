/* eslint-disable no-param-reassign -- the delta state is an in-place mutable accumulator by design */
import { Actor, log } from 'apify';

// Delta state lives in a NAMED key-value store (the run's default store is
// isolated per run and would not survive between scheduled runs). One store
// per delta-state name, so two schedules with different filters never poison
// each other's "seen" set - the name defaults to a hash of the filter set
// (see main.ts) and can be pinned explicitly with the `deltaStateName` input.
const STORE_PREFIX = 'australia-grantconnect-monitor-state';
const STATE_KEY = 'state';

// ~150 awards/day means 50,000 entries is roughly a year of history; the
// serialised JSON stays around 3 MB, well within a KV record.
export const MAX_SEEN_ENTRIES = 50_000;

export interface DeltaState {
    version: 2;
    /** gaId -> last-updated instant (UTC ISO) at which the record was last delivered; "" when unknown. */
    seen: Record<string, string>;
    lastRunAt: string | null;
    /** Newest lastUpdatedIso delivered so far - the watermark that bounds a delta walk. */
    watermark: string | null;
    /**
     * Set when a delta walk was cut short by maxItems: the lastUpdatedIso of
     * the oldest row the walk reached. Rows older than this may still be
     * undelivered, so the next walk must not early-stop (nor apply the
     * watermark) before it has passed this floor. Cleared by a complete walk.
     */
    backlogFloor: string | null;
    /**
     * Set once, by the FIRST (cold) delta run when maxItems cut its walk
     * short: the lastUpdatedIso of the oldest row it delivered. Rows whose
     * last activity is older are history - never delivered by later runs -
     * so the first run really is a baseline and does not drain the register.
     */
    baselineFloor: string | null;
    filtersSignature: string | null;
}

interface LegacyState {
    seenIds?: string[];
    lastRunAt?: string | null;
}

export function emptyState(filtersSignature: string | null): DeltaState {
    return {
        version: 2,
        seen: {},
        lastRunAt: null,
        watermark: null,
        backlogFloor: null,
        baselineFloor: null,
        filtersSignature,
    };
}

/** A store that has never completed a run - the next delta run establishes the baseline. */
export function isColdState(state: DeltaState): boolean {
    return state.lastRunAt === null && Object.keys(state.seen).length === 0;
}

export function stateStoreName(deltaStateName: string): string {
    const safe = deltaStateName
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 30);
    return `${STORE_PREFIX}-${safe || 'default'}`;
}

function fromLegacy(legacy: LegacyState, filtersSignature: string | null): DeltaState {
    const state = emptyState(filtersSignature);
    for (const id of legacy.seenIds ?? []) state.seen[id] = '';
    state.lastRunAt = legacy.lastRunAt ?? null;
    return state;
}

export async function loadState(
    storeName: string,
    filtersSignature: string | null,
    reset: boolean,
): Promise<DeltaState> {
    if (reset) {
        log.info(`resetState=true - starting from an empty seen-set in store "${storeName}".`);
        return emptyState(filtersSignature);
    }
    const store = await Actor.openKeyValueStore(storeName);
    const stored = await store.getValue<DeltaState | LegacyState>(STATE_KEY);
    if (stored && (stored as DeltaState).version === 2) {
        const state = stored as DeltaState;
        state.backlogFloor ??= null; // states written before the floors existed
        state.baselineFloor ??= null;
        if (state.filtersSignature && filtersSignature && state.filtersSignature !== filtersSignature) {
            log.warning(
                `Delta store "${storeName}" was built with a different filter set - records matching the new filters but already seen under the old ones will not be re-delivered. Use resetState=true to re-baseline.`,
            );
        }
        return state;
    }
    if (stored && Array.isArray((stored as LegacyState).seenIds)) {
        log.info('Migrating v1 delta state (id list) to v2 (id -> last-updated map).');
        return fromLegacy(stored as LegacyState, filtersSignature);
    }
    // Every delta-state name starts from an empty memory. The v1 store
    // (`australia-grantconnect-monitor-delta-state`) is deliberately NOT
    // adopted: v1 wrote it unconditionally regardless of filters, so
    // inheriting it would silently suppress records for a new filter set
    // (observed on the platform: a Regional Express award excluded as
    // "unchanged" on a cold ABN run because a v1 test run had seen it).
    return emptyState(filtersSignature);
}

/** Record that a gaId was delivered (or intentionally excluded) at the given last-updated instant. */
export function markSeen(state: DeltaState, gaId: string, lastUpdatedIso: string | null): void {
    state.seen[gaId] = lastUpdatedIso ?? '';
    if (lastUpdatedIso && (!state.watermark || lastUpdatedIso > state.watermark)) state.watermark = lastUpdatedIso;
}

/**
 * After a delta walk: remember how deep an INCOMPLETE walk got (so the next
 * run keeps walking past the known block down to the undelivered rows), or
 * clear the floor once a walk ran to its natural end.
 */
export function recordWalkCoverage(
    state: DeltaState,
    cold: boolean,
    truncated: boolean,
    oldestReachedIso: string | null,
): void {
    if (cold) {
        // The first run defines the baseline: whatever it could not deliver is
        // history, not backlog. (An untruncated cold run saw everything.)
        state.baselineFloor = truncated ? oldestReachedIso : null;
        state.backlogFloor = null;
        return;
    }
    if (!truncated) {
        state.backlogFloor = null;
        return;
    }
    if (!oldestReachedIso) return; // nothing usable to anchor on - keep whatever floor exists
    state.backlogFloor =
        state.backlogFloor && state.backlogFloor < oldestReachedIso ? state.backlogFloor : oldestReachedIso;
}

/** Keep the map bounded: drop the entries with the oldest last-updated instants first. */
export function pruneState(state: DeltaState, max = MAX_SEEN_ENTRIES): void {
    const entries = Object.entries(state.seen);
    if (entries.length <= max) return;
    entries.sort((a, b) => a[1].localeCompare(b[1]));
    const drop = entries.length - max;
    for (let i = 0; i < drop; i++) delete state.seen[entries[i][0]];
    log.info(`Pruned ${drop} oldest entries from the delta state (cap ${max}).`);
}

export async function saveState(storeName: string, state: DeltaState, runAt: string): Promise<void> {
    state.lastRunAt = runAt;
    pruneState(state);
    const store = await Actor.openKeyValueStore(storeName);
    await store.setValue(STATE_KEY, state);
}
