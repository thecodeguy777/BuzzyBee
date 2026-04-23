/**
 * Rewrites `id="foo"` and `url(#foo)` / `href="#foo"` references inside a raw
 * SVG string to `id="{prefix}-foo"`, so multiple SVGs can coexist inline on the
 * same page without gradient/clipPath/mask ID collisions.
 */
export function prefixSvgIds(raw: string, prefix: string): string {
  return raw
    .replace(/\bid="([^"]+)"/g, (_m, id) => `id="${prefix}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id) => `url(#${prefix}-${id})`)
    .replace(/\b(xlink:)?href="#([^"]+)"/g, (_m, xl, id) => `${xl ?? ''}href="#${prefix}-${id}"`)
    // Strip fixed width/height from the root <svg> so it inherits the container's size.
    .replace(/(<svg\b[^>]*?)\s+width="[^"]*"/i, '$1')
    .replace(/(<svg\b[^>]*?)\s+height="[^"]*"/i, '$1')
    // Inject width/height 100% so the SVG fills its parent box.
    .replace(/<svg\b/i, '<svg width="100%" height="100%"')
}
