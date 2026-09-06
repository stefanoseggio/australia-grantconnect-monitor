import { Actor, log } from 'apify';

import { fetchGrantAwards } from './fetchGrantAwards.js';
import type { ActorInput } from './types.js';

const RESULT_EVENT_NAME = 'result';

await Actor.init();
await run();
await Actor.exit();

async function run(): Promise<void> {
    const input = (await Actor.getInput<ActorInput>()) ?? ({} as ActorInput);
    const { maxItems = 100, fetchDetail = true } = input;

    let records;
    try {
        records = await fetchGrantAwards(maxItems, fetchDetail);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Fallo la extraccion: ${message}`);
        await Actor.pushData({ error: message, scrapedAt: new Date().toISOString() });
        return;
    }

    log.info(`Grant Awards extraidos: ${records.length}`);

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
