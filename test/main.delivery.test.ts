import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

// End-to-end run of src/main.ts with the Apify SDK and the HTTP layer mocked:
// proves the delta state is persisted ONLY for records actually stored, so a
// spending limit (or crash) half-way never loses awards for the next run.

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));
const LISTING_PAGE1 = readFileSync(`${fixturesDir}/grant_awards_list_page1.html`, 'utf-8');
const EMPTY_LISTING = '<html><body><h2>Search Results</h2><div class="total-result"></div></body></html>';

const kv = new Map<string, unknown>();
const pushed: Record<string, unknown>[] = [];
const pushEvents: string[] = [];
const statusMessages: string[] = [];
let failMessage: string | null = null;
const CHARGE_LIMIT = 4; // the customer's budget allows 4 records

vi.mock('apify', () => {
    const store = {
        getValue: async (key: string) => kv.get(key) ?? null,
        setValue: async (key: string, value: unknown) => {
            kv.set(key, JSON.parse(JSON.stringify(value)));
        },
    };
    const noop = (): void => {};
    return {
        log: { info: noop, warning: noop, debug: noop, error: noop, exception: noop },
        Actor: {
            init: async () => {},
            exit: async () => {},
            fail: async (message: string) => {
                failMessage = message;
            },
            getInput: async () => ({ maxItems: 10, fetchDetail: false, onlyNew: true }),
            openKeyValueStore: async () => store,
            setValue: async (key: string, value: unknown) => {
                kv.set(`default:${key}`, value);
            },
            setStatusMessage: async (message: string) => {
                statusMessages.push(message);
            },
            on: noop,
            off: noop,
            getChargingManager: () => ({ getPricingInfo: () => ({ isPayPerEvent: true }) }),
            pushData: async (items: Record<string, unknown>[], eventName: string) => {
                const room = Math.max(0, CHARGE_LIMIT - pushed.length);
                const stored = items.slice(0, room);
                pushed.push(...stored);
                pushEvents.push(...stored.map(() => eventName));
                return {
                    chargedCount: stored.length,
                    eventChargeLimitReached: pushed.length >= CHARGE_LIMIT,
                    chargeableWithinLimit: {},
                };
            },
        },
    };
});

vi.mock('../src/http.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../src/http.js')>()),
    fetchWithRetry: async (path: string) => (path.includes('page=1') ? LISTING_PAGE1 : EMPTY_LISTING),
    fetchOptional: async () => null,
}));

describe('main.ts delivery semantics', () => {
    it('persists the seen-set only for delivered records and stops at the spending limit', async () => {
        await import('../src/main.js');

        expect(failMessage).toBeNull();
        expect(pushed.length).toBe(CHARGE_LIMIT);
        expect(pushEvents.every((e) => e === 'result-summary')).toBe(true); // fetchDetail=false -> summary price

        // Oldest-first delivery: the 4 stored records are the 4 OLDEST of the 10 candidates,
        // so the undelivered ones are the newest - exactly where the next walk starts.
        const stateEntry = [...kv.entries()].find(([k]) => k === 'state');
        expect(stateEntry).toBeDefined();
        const state = stateEntry![1] as { seen: Record<string, string>; watermark: string | null; lastRunAt: string };
        const deliveredIds = pushed.map((r) => r.gaId as string);
        expect(Object.keys(state.seen).sort()).toEqual([...deliveredIds].sort());
        expect(state.lastRunAt).toBeTruthy();
        // The watermark is the newest last-updated instant among DELIVERED records only -
        // the undelivered (newer) rows must still be walked by the next run.
        const newestDelivered = pushed
            .map((r) => r.lastUpdatedIso as string)
            .sort()
            .at(-1);
        expect(state.watermark).toBe(newestDelivered);
        expect(state.watermark).not.toBe('2026-09-04T06:16:00.000Z'); // the newest row on the page was NOT delivered

        const output = kv.get('default:OUTPUT') as { delivered: number; chargeLimitReached: boolean; mode: string };
        expect(output.delivered).toBe(CHARGE_LIMIT);
        expect(output.chargeLimitReached).toBe(true);
        expect(output.mode).toBe('delta');
        expect(statusMessages.at(-1)).toMatch(/4 delivered .* spending limit reached/);
    });
});
