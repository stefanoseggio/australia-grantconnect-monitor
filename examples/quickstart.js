// examples/quickstart.js
// Node.js (CommonJS) quick start for the GrantConnect Grant Awards Scraper & Monitor.
// Install: npm install apify-client
// Run:     APIFY_TOKEN=your_token node examples/quickstart.js

const { ApifyClient } = require('apify-client');

const client = new ApifyClient({
    token: process.env.APIFY_TOKEN,
});

async function main() {
    // Health, Wellbeing and Medical Research awards worth $500k+, delta mode on.
    const run = await client.actor('gt7wS4T0uFRXDz49n').call({
        categories: ['231'],
        minValueAud: 500000,
        onlyNew: true,
        maxItems: 500,
        fetchDetail: true,
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    for (const item of items) {
        console.log(`${item.gaId} | ${item.recipientName} | ${item.valueAud} | ${item.agency}`);
    }

    console.log(`Fetched ${items.length} grant award record(s) from run ${run.id}.`);
}

main().catch((err) => {
    console.error('Run failed:', err.message);
    process.exit(1);
});
