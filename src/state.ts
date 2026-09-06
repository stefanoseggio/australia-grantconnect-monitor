import { Actor } from 'apify';

// A NAMED key-value store (not the run's default one, which is isolated per
// run) persists across scheduled runs of this actor - this is what makes
// "only new since last run" possible at all. Grant Awards has a single id
// space (gaId, e.g. "GA578886" or "GA270901-V1" for a variation) - unlike
// the fleet's HSE actor (convictions/notices are independent id spaces),
// so state here is a flat list rather than keyed per sub-dataset.
const STATE_STORE_NAME = 'australia-grantconnect-monitor-delta-state';
const MAX_SEEN_IDS = 2000;

export interface DeltaState {
    seenIds: string[];
    lastRunAt: string | null;
}

export async function loadState(): Promise<DeltaState> {
    const store = await Actor.openKeyValueStore(STATE_STORE_NAME);
    const state = await store.getValue<DeltaState>('state');
    return state ?? { seenIds: [], lastRunAt: null };
}

// New ids from this run are kept newest-first (the listing itself is
// newest-first, see urls.ts) ahead of the previously-known ids, then capped
// so the stored list never grows unbounded across many scheduled runs.
export async function saveState(state: DeltaState, idsSeenThisRun: string[], runAt: string): Promise<DeltaState> {
    const merged = [...idsSeenThisRun, ...state.seenIds.filter((id) => !idsSeenThisRun.includes(id))];
    const next: DeltaState = {
        seenIds: merged.slice(0, MAX_SEEN_IDS),
        lastRunAt: runAt,
    };
    const store = await Actor.openKeyValueStore(STATE_STORE_NAME);
    await store.setValue('state', next);
    return next;
}
