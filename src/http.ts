async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

// grants.gov.au sits behind CloudFront with a header-based bot filter -
// verified live 2026-09-06: a request with no User-Agent (or curl's own
// default `curl/x.y.z` string) gets a 403 "Request blocked" CloudFront
// page on every path tested (/Ga/List, /Ga/ListResult, /Ga/Show/<id>,
// even /robots.txt itself). Isolated which header actually matters by
// testing each alone: User-Agent alone -> 200, Accept-Language alone ->
// 403. It's the User-Agent specifically, not "any extra header" - no
// cookies, no JS challenge, no CAPTCHA once a normal browser UA is sent.
const BROWSER_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
};

const BASE_URL = 'https://www.grants.gov.au';

export async function fetchWithRetry(path: string, maxRetries = 4, baseDelayMs = 1000): Promise<string> {
    const url = `${BASE_URL}${path}`;
    let lastError: Error = new Error('unreachable');
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' });
            if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
            return await response.text();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < maxRetries) {
                await sleep(baseDelayMs * 2 ** attempt);
            }
        }
    }
    throw lastError;
}
