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
    let s = String(clean);
    // Remove any external references or potentially unsafe hrefs (images, fonts, xlink)
    s = s.replace(/(?:xlink:href|href)\s*=\s*"[^"]*"/gi, '');
    // Remove url(...) that references any resources (including empty/stripped URLs)
    s = s.replace(/url\(\s*["']?[^)]+["']?\s*\)/gi, '');
    // Remove @import rules inside <style> blocks (allow empty content after DOMPurify)
    s = s.replace(/@import\s*(?:[^;]*);/gi, '');
    // If sanitized content still contains script-like tags, strip them conservatively
    s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
    cache.set(svg, s);
    return s;
}

export function svgToDataUri(svg: string) {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
