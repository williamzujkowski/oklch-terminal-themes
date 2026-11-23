# Showcase UX review

The showcase serves two distinct jobs: discovering a palette by seeing it in
familiar applications, and evaluating two palettes against the same content.
The user confirmed that Browse should show every demo as you scroll, while
Compare should open with two matching terminals and collapsed advanced detail.

## Findings and decisions

| Finding                                                         | Effect on users                                                       | Result                                                                             |
| --------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Comparison and analysis replaced the simple first visit         | Too many decisions before seeing a theme in context                   | Restore one-theme Browse; move Compare to its own route                            |
| Metrics, exports and palette values preceded examples           | Visual evaluation required substantial scrolling                      | Put previews first, palette and metrics below; keep export beside the name         |
| Six chooser actions occupied a five-column grid                 | Navigation widened unexpectedly and sharing wrapped                   | Size previous/next/random deliberately; allow the correct number of action columns |
| Viewport media queries missed narrow desktop panes              | Editor and dashboard layouts stayed crowded inside a wide browser     | Adapt samples to container widths                                                  |
| Seven numeric ramp columns were only about 69px wide at desktop | “Baseline” split across three lines; color values became hard to scan | Separate visual charts from details; give expanded values a readable minimum width |
| Whole-page overflow checks passed despite poor wrapping         | Automated geometry checks missed the actual usability problem         | Inspect labels and expanded details at large text sizes, alongside screenshots     |

## Information placement

Browse presents the chooser, selected theme and export action, then Terminal,
Editor, Webpage, Dashboard and Charts. It retains search, filters, keyboard
selection, previous/next, random and coherent loading/retry behavior. Filter
status and reset appear when filters are active. Detailed palette and contrast
information remain discoverable below the visual examples.

Compare presents the candidate chooser, reference selection and pin/swap
controls, then two actual terminals with the same content. Palette and metric
disclosures follow each preview. Preview settings below the pair contain the
other shared examples, typography, original/derived mapping and role inspector.
Narrow screens use the existing named A/B switch rather than squeezing two
unreadable terminals into one viewport. Switching retains both theme states.

Theme links return to Browse. Comparison links retain both identities and
shared presentation. Old root comparison links redirect without dropping search
parameters or fragments. Browser history and copied exports continue to resolve
the currently selected canonical records.

## Alternatives considered

A throwaway prototype compared a two-column gallery, a full-width stack and a
stack with section navigation, using the real header, chooser and palettes.
The full-width stack preserves the earlier straightforward layout and gives
realistic examples useful reading space. The gallery compresses editor and
webpage samples; the section rail adds navigation to a page already easy to
scan. The prototype remains on `design/showcase-ux-review` at `d00b0138`, outside
main. No variant switcher or DOM-moving prototype code belongs in production.

## Verification

Check both routes at narrow and wide widths, with 18px comparison text and
expanded disclosures. Include dark/light palettes, grouped filtering, keyboard
selection, reload/Back/Forward, reference changes, swap/pin, export/link identity,
mobile switching and focus, and unavailable-record retry states. Structural axe
checks cover both built routes. Real browser checks assess wrapping and layout;
whole-page overflow alone is insufficient.

Measurements still distinguish canonical source pairs from rendered sample
colors. Low-contrast source colors remain visible diagnostic content; the site
chrome must stay readable independently. This review changes site presentation,
not palette data, upstream pins, public schemas or package dependencies.
