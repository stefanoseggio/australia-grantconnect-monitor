"""
examples/quickstart.py
Python quick start for the GrantConnect Grant Awards Scraper & Monitor.
Install: pip install apify-client
Run:     APIFY_TOKEN=your_token python examples/quickstart.py
"""

import os

from apify_client import ApifyClient

client = ApifyClient(os.environ["APIFY_TOKEN"])

# Health, Wellbeing and Medical Research awards worth $500k+, delta mode on.
run = client.actor("gt7wS4T0uFRXDz49n").call(
    run_input={
        "categories": ["231"],
        "minValueAud": 500000,
        "onlyNew": True,
        "maxItems": 500,
        "fetchDetail": True,
    }
)

dataset_items = client.dataset(run["defaultDatasetId"]).list_items().items

for item in dataset_items:
    print(f"{item['gaId']} | {item['recipientName']} | {item['valueAud']} | {item['agency']}")

print(f"Fetched {len(dataset_items)} grant award record(s) from run {run['id']}.")
