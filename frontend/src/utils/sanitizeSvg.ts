export async function sanitizeSvgString(svg: string) {
    // Dynamically import DOMPurify to avoid SSR issues
    if (typeof window === 'undefined') return '';
    // simple in-memory cache to avoid re-sanitizing identical SVGs
    (sanitizeSvgString as any)._cache = (sanitizeSvgString as any)._cache || new Map<string, string>();
    const cache: Map<string, string> = (sanitizeSvgString as any)._cache;
    if (cache.has(svg)) return cache.get(svg) as string;

    const createDOMPurify = (await import('dompurify')).default || (await import('dompurify'));
    const DOMPurify = createDOMPurify(window as any);
    // Use the svg profile and remove potentially dangerous elements/attributes
    const clean = DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true },
        FORBID_TAGS: ['script', 'foreignObject'],
        FORBID_ATTR: ['onload', 'onclick', 'onerror', 'xmlns:xlink'],
    });
    cache.set(svg, String(clean));
    return String(clean);
}

export function svgToDataUri(svg: string) {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
