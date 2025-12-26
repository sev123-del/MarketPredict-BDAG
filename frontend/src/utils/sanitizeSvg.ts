const svgSanitizeCache = new Map<string, string>();

export async function sanitizeSvgString(svg: string) {
    // Dynamically import DOMPurify to avoid SSR issues
    if (typeof window === 'undefined') return '';

    // simple in-memory cache to avoid re-sanitizing identical SVGs
    if (svgSanitizeCache.has(svg)) return svgSanitizeCache.get(svg) as string;

    // Import DOMPurify dynamically and type the factory safely without `any`
    const dompurifyModule = await import('dompurify');
    type CreateDOMPurify = (win: Window) => { sanitize: (s: string, cfg?: Record<string, unknown>) => string };
    const createDOMPurify = ((dompurifyModule as unknown) as { default?: unknown }).default ?? dompurifyModule;
    const DOMPurify = (createDOMPurify as unknown as CreateDOMPurify)(window as Window);

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
    svgSanitizeCache.set(svg, s);
    return s;
}

export function svgToDataUri(svg: string) {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
