import { sanitizeSvgString, svgToDataUri } from '../sanitizeSvg';

describe('sanitizeSvgString', () => {
    test('removes script tags and foreignObject', async () => {
        const bad = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><foreignObject><div>bad</div></foreignObject><rect width="10" height="10"/></svg>`;
        const clean = await sanitizeSvgString(bad);
        expect(clean).not.toContain('<script');
        expect(clean).not.toContain('foreignObject');
        expect(clean).toContain('<rect');
    });

    test('svgToDataUri encodes', () => {
        const s = '<svg><rect/></svg>';
        const uri = svgToDataUri(s);
        expect(uri.startsWith('data:image/svg+xml;utf8,'));
        expect(uri).toContain('%3Csvg');
    });
});
