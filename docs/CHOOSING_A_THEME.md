# Choosing a theme

Use the [live showcase](https://williamzujkowski.github.io/oklch-terminal-themes/)
to compare palettes against the same content. The terminal, IDE, reading view,
dashboard, and chart are illustrative HTML examples; an application's own
syntax rules, terminal settings, fonts, and rendering can produce different results.

## A useful comparison sequence

1. Open the theme picker or press `/`. Search by name or slug, then select a theme.
2. Start with a `dark` or `light` filter and optionally add `muted`, `vibrant`, or
   a contrast filter. Filters combine with AND: selecting both `dark` and `light`
   leaves no matches. Use **clear** to reset the filters.
3. Keep the content fixed and use the previous/next controls or `←` / `→` to
   browse the filtered set. Use `r` for a random theme. Keyboard shortcuts leave
   text-entry controls alone.
4. Check ordinary text, syntax colors, diff additions/deletions, dim text,
   selection, and charts. A readable foreground/background pair can coexist
   with a hard-to-read comment or ANSI color.
5. Export the palette, test it in the intended application, and use **Permalink**
   to save or share that theme. The permalink carries the theme only; the address
   bar also carries the current search/filter/sort state.

The sun/moon control changes the outer site's appearance independently of the
selected preview. It does not choose the theme's opposite-polarity counterpart.
The `/` and `r` shortcuts require focus on the page body; the buttons remain
available when another control has focus.

## What the numbers mean

“Intensity” can mean several things. Compare them separately:

| Signal                      | What it describes                                                                                                    | What it does not establish                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| OKLCH **L**                 | Perceptual lightness of a color, stored from 0 to 1                                                                  | Measured screen brightness or text contrast                                  |
| OKLCH **C**                 | Chroma: distance from the neutral axis; lower values are less colorful                                               | A universal saturation percentage                                            |
| OKLCH **h**                 | Hue angle in degrees                                                                                                 | A useful hue distinction for an achromatic color                             |
| Foreground/background ratio | WCAG 2.x contrast of the main text pair                                                                              | Contrast of every syntax, muted, selected, or interactive element            |
| `minAnsi`                   | Lowest ANSI/background ratio in the documented candidate set                                                         | All ANSI slots; background-blending slots are excluded                       |
| `brightness-ordered`        | Every bright ANSI slot has higher OKLCH L than its normal partner                                                    | A guarantee that a light theme is better, or that bold always maps to bright |
| `cvd-safe`                  | A project heuristic on separation of the six normal chromatic ANSI slots under simulated deuteranopia and protanopia | A guarantee for every viewer, every color pair, or tritanopia                |
| APCA sort                   | Descending magnitude of foreground/background APCA Lc                                                                | WCAG conformance or a font-independent accessibility rating                  |

For color definitions see [CSS Color 4](https://www.w3.org/TR/css-color-4/#ok-lab).
The site displays raw `oklch()` values on the palette; full records also expose
numeric `l`, `c`, and `h`. The `muted` and `vibrant` tags use average chroma over
all 20 slots, not just the six chromatic ANSI colors. Some themes receive neither.

## Read the contrast badge narrowly

The badge classifies **foreground on background**. Its AAA/AA labels do not
certify a whole theme or page. The `ansi-legible` filter uses a 3:1 minimum on
the non-blend ANSI slots; ordinary small text generally needs 4.5:1 under
[WCAG 2.2 contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Use the cursor and selection filters for those separate pairs. The selection
metric assumes the regular foreground is the selected-text color because the
dataset has no independent selected-text slot. Test the actual selected-text pair in the intended application; a palette swatch
does not establish selected-text readability.
Preserve labels, shapes, and
`+`/`-` markers where color carries meaning; [WCAG's use-of-color guidance](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
explains why color alone is insufficient.

The CVD tag does not assess bright variants, the selected-text pair, or derived
chart palettes. A theme can pass that heuristic while its chart colors remain
hard to distinguish. Assess the colors actually used together, including any
synthesized categorical entries, and retain non-color cues.

## Separate source colors from preview colors

Canonical ratios use exact declared 8-bit sRGB hex pairs. For example, Nord's
foreground/background ratio is about **9.2452:1**, but its `brightBlack`
comment/background pair is about **2.0673:1**. Dracula's corresponding pairs
are about **13.3591:1** and **3.0260:1**. A strong body-text result can coexist
with weak comments; 3:1 does not meet the ordinary-text 4.5:1 threshold.

WCAG tags compare unrounded ratios. Stored metadata uses conservative
four-decimal precision and badge displays round down. A calculated 4.499954:1
remains below 4.5:1 regardless of the number of displayed digits. Large text
uses 3:1 at 24px normal weight or 14pt (about 18.667px) bold; 18px bold does
not meet that size rule. A relevant non-text cursor or UI indicator uses its
separate 3:1 assessment.

A browser can render native OKLCH, `color-mix()` and alpha-backed colors
differently from the canonical fallback hex. Resolved-preview diagnostics
measure actual computed solid colors against their declared backing chain,
using an sRGB canvas. Eight-bit results are sampled approximations; their
conservative bounds can make a threshold result **indeterminate**. They describe
CSS swatches rather than antialiased text pixels, monitor calibration or HDR.
Unsupported images, gradients, group opacity, filters, blends and unresolved
colors require an **unavailable** result with a reason. Canonical values remain
a separately labeled reference, never an invented rendered fallback.

The original palette retains its 20 source slots. A named application mapping
such as `ui-v1` derives selected roles with documented sRGB mixes while retaining
the base theme identity. For example, a derived comment may mix foreground 65%
with background 35%; its result must be measured from that CSS expression.
Changing a mapping does not repair or rewrite the canonical palette, ANSI slots
or chart palette. Raw palette exports describe original slots; reproducing a
mapped application also requires the mapping's role rules and version.

Assess charts using their exact displayed palette. Categorical entries can be
complete source-slot copies or trailing synthesized colors; sequential and
diverging steps are derived. Normal-ANSI CVD tags do not transfer to those
palettes. Keep direct labels and shapes, patterns or line styles, and inspect
background contrast separately from pair separation. The project's CVD
separation threshold of ΔE2000 10 is a heuristic, not universal certification.

## Choose an export

| Need                                                          | Use                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| Apply the 20 palette slots in a web UI                        | **CSS variables** or **Tailwind v4** in the export menu |
| Copy one color                                                | Click its palette or chart swatch                       |
| Save the current preview payload                              | **Raw JSON**; this is a subset of the slim dataset      |
| Read numeric OKLCH, provenance, CVD/APCA, or full chart ramps | Package `themes.json` or `themes/<slug>.json`           |
| Reuse a ready-made stylesheet                                 | Package `css/<slug>.css`                                |
| Integrate with design-token or terminal-template tools        | Package DTCG tokens or base16/base24 exports            |

The preview JSON omits fields that the page does not use. It is not the full
theme record. See [README usage](../README.md#usage) for import examples and
[README tags](../README.md#tags) for exact metric thresholds and exclusions.
Check [Attribution](../README.md#attribution) before redistributing a palette.
