export async function sanitizeSvgString(svg: string) {
    // Dynamically import DOMPurify to avoid SSR issues
    if (typeof window === 'undefined') return '';
    const createDOMPurify = (await import('dompurify')).default || (await import('dompurify'));
    const DOMPurify = createDOMPurify(window as any);
    // Use the svg profile and remove potentially dangerous elements/attributes
    const clean = DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true },
        FORBID_TAGS: ['script', 'foreignObject'],
        FORBID_ATTR: ['onload', 'onclick', 'onerror', 'xmlns:xlink'],
    });
    return String(clean);
}

export function svgToDataUri(svg: string) {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
