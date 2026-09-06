import type { Cheerio, CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';

// Both the listing's per-award <article> blocks and the full detail page
// share one shape: a flat sequence of
// `<div class="list-desc"><span>Label:</span><div class="list-desc-inner">Value</div></div>`.
// Section headers (`<span><h2>Grant Recipient Details</h2></span>`) and the
// listing's "Full Details" link row (label is a bare `&nbsp;`) have no
// real label text and are silently skipped - verified against real
// listing and detail fixtures.
export function parseListDesc($: CheerioAPI, scope: Cheerio<AnyNode>): Record<string, string> {
    const fields: Record<string, string> = {};
    scope.find('.list-desc').each((_i, el) => {
        const $el = $(el);
        const $label = $el.children('span').first();
        if ($label.length === 0 || $label.find('h2').length > 0) return;

        const label = $label.text().replace(/\s+/g, ' ').trim().replace(/:$/, '');
        if (!label) return;

        const $value = $el.children('div.list-desc-inner').first();
        if ($value.length === 0) return;

        fields[label] = $value.text().replace(/\s+/g, ' ').trim();
    });
    return fields;
}

export function linkIn($: CheerioAPI, scope: Cheerio<AnyNode>, label: string): { href: string; text: string } | null {
    let result: { href: string; text: string } | null = null;
    scope.find('.list-desc').each((_i, el) => {
        const $el = $(el);
        const $label = $el.children('span').first();
        const labelText = $label.text().replace(/\s+/g, ' ').trim().replace(/:$/, '');
        if (labelText !== label) return;
        const $a = $el.find('a').first();
        if ($a.length === 0) return;
        const href = $a.attr('href');
        if (!href) return;
        result = { href, text: $a.text().trim() };
    });
    return result;
}
