/**
 * Raw SVG markup for the DoRent brand ball (orange ball + white wave),
 * shared with `map.component.ts`'s per-group marker `divIcon` — that HTML is
 * injected directly by Leaflet outside Angular's template entirely, so it
 * cannot reuse `dorent-symbol.component.html` (a compiled Angular template)
 * or its `ViewEncapsulation.Emulated` styles (see `_dorent-symbol-motion.scss`
 * for how the CSS side of the sharing works instead).
 *
 * `dorent-symbol.component.html` is deliberately left untouched rather than
 * rewritten to call this function too — see M-024 defect 1 (swapping this
 * exact SVG's shape once silently re-kerned the header wordmark by 8px). The
 * geometry below must stay numerically IDENTICAL to that template: same
 * viewBox, same `r="50"` ink-fills-the-box circle, same wave `d` path, same
 * shadow `cy="106"` sitting outside the viewBox. If either copy is ever
 * edited, the other must be checked by hand against it.
 *
 * `clipId` must be unique per rendered instance — the wave `<path>` clips
 * itself against a same-named `<clipPath>` sibling, and two instances
 * sharing one id silently break the white wave on whichever instance the
 * browser resolves second (first-id-wins for a duplicate SVG id). The map
 * derives one from each marker group's own stable `key`; the component
 * derives one from a module-level counter (`dorent-symbol.component.ts`).
 */
export function dorentSymbolMarkup(clipId: string): string {
  return (
    `<svg class="dr-symbol__svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
    `<g class="dr-symbol__shadow-fade">` +
    `<ellipse class="dr-symbol__shadow" cx="50" cy="106" rx="35" ry="5" />` +
    `</g>` +
    `<g class="dr-symbol__ball">` +
    `<circle class="dr-symbol__ball-fill" cx="50" cy="50" r="50" />` +
    `<clipPath id="${clipId}">` +
    `<circle cx="50" cy="50" r="50" />` +
    `</clipPath>` +
    `<path class="dr-symbol__wave" d="M 0,39 Q 50,67.5 100,39 L 100,48 Q 50,76.5 0,48 Z" clip-path="url(#${clipId})" />` +
    `</g>` +
    `</svg>`
  );
}
