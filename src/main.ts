import { Actor, log } from 'apify';

import { fetchGrantAwards } from './fetchGrantAwards.js';
import { loadState, saveState } from './state.js';
import type { ActorInput, GrantAwardRecord } from './types.js';

const RESULT_EVENT_NAME = 'result';

await Actor.init();
await run();
await Actor.exit();

async function run(): Promise<void> {
    const input = (await Actor.getInput<ActorInput>()) ?? ({} as ActorInput);
    const { maxItems = 100, fetchDetail = true, onlyNew = false, dateRange } = input;

    const now = new Date();
    const state = await loadState();
    const seenIds = new Set(state.seenIds);

    let records: GrantAwardRecord[];
    try {
        const result = await fetchGrantAwards(maxItems, fetchDetail, seenIds, onlyNew, dateRange, now);
        records = result.records;
        await saveState(state, result.allIdsThisRun, now.toISOString());
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Fallo la extraccion: ${message}`);
        await Actor.pushData({ error: message, scraped_at: now.toISOString() });
        return;
    }

    log.info(`Grant Awards extraidos: ${records.length} (onlyNew=${onlyNew})`);

    let pushed = 0;
    for (const record of records) {
        await Actor.pushData(record);
        pushed += 1;

        const { eventChargeLimitReached } = await Actor.charge({ eventName: RESULT_EVENT_NAME, count: 1 });
        if (eventChargeLimitReached) {
            log.info('Charge limit reached - stopping.');
            return;
        }
    }

    log.info(`Cargados ${pushed} items al dataset.`);
}
