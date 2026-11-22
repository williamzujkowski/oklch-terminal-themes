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
dataset has no independent selected-text slot. The current showcase displays
selection as a palette swatch; test selected text in the intended application.
Preserve labels, shapes, and
`+`/`-` markers where color carries meaning; [WCAG's use-of-color guidance](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
explains why color alone is insufficient.

The CVD tag does not assess bright variants, the selected-text pair, or derived
chart palettes. A theme can pass that heuristic while its chart colors remain
hard to distinguish. Assess the colors actually used together, including any
synthesized categorical entries, and retain non-color cues.

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
