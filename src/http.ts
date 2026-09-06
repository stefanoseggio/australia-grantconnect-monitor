import { log } from 'apify';

export const BASE_URL = 'https://www.grants.gov.au';

// grants.gov.au sits behind CloudFront with a header-based bot filter -
// verified live 2026-09-06: a request with no User-Agent (or curl's default
// `curl/x.y.z`) gets a 403 "Request blocked" page on every path, including
// /robots.txt. Only the User-Agent matters - no cookies, no JS challenge,
// no CAPTCHA. A normal browser UA is a compatibility requirement, not a
// circumvention of an access control; /Ga/* is not disallowed by robots.txt.
const BROWSER_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-AU,en;q=0.9',
};

export class HttpError extends Error {
    constructor(
        public readonly status: number,
        public readonly url: string,
    ) {
        super(`HTTP ${status} for ${url}`);
        this.name = 'HttpError';
    }
}

export interface FetchOptions {
    maxRetries?: number;
    baseDelayMs?: number;
    timeoutMs?: number;
}

const DEFAULTS: Required<FetchOptions> = {
    maxRetries: 4,
    baseDelayMs: 1000,
    // Normal pages answer in 0.5-2.5s; only absurd page offsets take ~45s,
    // and the walker never requests past the last page (it checks li.next).
    timeoutMs: 45_000,
};

export function absoluteUrl(path: string): string {
    return new URL(path, BASE_URL).href;
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function isRetriableStatus(status: number): boolean {
    return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * GET a site path and return the body. Retries with exponential backoff on
 * network errors, timeouts, 408/425/429 and 5xx. A 403 is the CloudFront
 * User-Agent gate (deterministic - retrying is pointless) and a 404 is a
 * withdrawn record; both surface immediately as HttpError so the caller can
 * decide (fail the run vs. degrade one record).
 */
export async function fetchWithRetry(path: string, options: FetchOptions = {}): Promise<string> {
    const { maxRetries, baseDelayMs, timeoutMs } = { ...DEFAULTS, ...options };
    const url = absoluteUrl(path);
    let lastError: Error = new Error('unreachable');
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, {
                headers: BROWSER_HEADERS,
                redirect: 'follow',
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (response.ok) return await response.text();
            if (response.status === 403) {
                throw new HttpError(403, url);
            }
            if (!isRetriableStatus(response.status)) {
                throw new HttpError(response.status, url);
            }
            lastError = new HttpError(response.status, url);
        } catch (error) {
            if (error instanceof HttpError && !isRetriableStatus(error.status)) throw error;
            lastError = error instanceof Error ? error : new Error(String(error));
        }
        if (attempt < maxRetries) {
            const delay = Math.min(baseDelayMs * 2 ** attempt, 15_000) + Math.floor(Math.random() * 250);
            log.debug(`Retrying ${url} in ${delay}ms after: ${lastError.message}`);
            await sleep(delay);
        }
    }
    if (lastError instanceof HttpError && lastError.status === 403) {
        throw new Error(
            `GrantConnect (CloudFront) refused the request with 403 - the User-Agent gate has changed. See AGENTS.md. URL: ${url}`,
        );
    }
    throw lastError;
}

/** Like fetchWithRetry but resolves to null when the resource is gone (404/410). */
export async function fetchOptional(path: string, options: FetchOptions = {}): Promise<string | null> {
    try {
        return await fetchWithRetry(path, options);
    } catch (error) {
        if (error instanceof HttpError && (error.status === 404 || error.status === 410)) return null;
        throw error;
    }
}

/**
 * Run `fn` over `items` with at most `concurrency` calls in flight, preserving
 * input order in the result. Errors propagate after in-flight calls settle.
 */
export async function mapWithConcurrency<T, R>(
    items: readonly T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    let firstError: unknown = null;
    const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
        while (next < items.length && firstError === null) {
            const index = next++;
            try {
                results[index] = await fn(items[index], index);
            } catch (error) {
                firstError ??= error;
            }
        }
    });
    await Promise.all(workers);
    if (firstError !== null) throw firstError;
    return results;
}
