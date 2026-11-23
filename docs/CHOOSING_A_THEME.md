# Choosing a theme

Use the [live showcase](https://williamzujkowski.github.io/oklch-terminal-themes/)
to compare palettes against the same content. The terminal, IDE, reading view,
dashboard, and chart are illustrative HTML examples; an application's own
syntax rules, terminal settings, fonts, and rendering can produce different results.

## Browse visual examples first

The main page opens Dracula and shows the terminal, editor, webpage, dashboard
and chart examples together. Choose a palette with the familiar picker, search,
previous/next or random controls; all examples update. Palette values and theme
information stay below the examples in closed disclosures. **Export theme** is
beside the theme name. A theme link opens this simpler Browse experience.

## Compare the same content

Choose **Compare** to open a separate page with two matching terminal examples.
The current Browse theme becomes B, paired with a different reference. A direct
visit to `/compare/` opens **A · Reference: Dracula** and **B · Candidate: Nord**.
Existing root links containing `ref` move to Compare while preserving the URL
state. A single `?theme=<slug>` link on Browse still shows all five examples.

1. Open the candidate picker or press `/` while the page body has focus. Search
   by name or slug. Arrow keys move the highlighted option; Enter selects it,
   and Escape closes the picker. The selected candidate stays stable while
   search, filters or sort change the visible options.
2. Use the Appearance, Colorfulness and Foreground/background groups. Each
   group has an **Any** choice; groups combine with AND. **At least AA** includes
   AAA themes. Additional tag filters combine with the groups; old links with
   contradictory tags can still show no matches. **Clear filters** resets them.
3. Previous/next, `←` / `→` and **Random** browse the filtered candidate set.
   Those page shortcuts leave text-entry controls alone. Changing B leaves A's
   palette fixed. Choose A from **Reference**, use **Use B as reference**,
   **Swap A and B**, or **Remove A** to return to a single preview.
4. Open **Preview settings** below the pair to choose a shared Preview and
   14, 16 or 18px Text size. The Dashboard also
   offers the Forms scenario. Both panes keep the same example content and
   typography; a narrow viewport shows one pane at a time through the A/B
   buttons without discarding the other theme.
5. Start with the **Original** mapping. Compare **ui-v1** only when you want its
   explicitly derived interface roles. **Inspect rendered roles** opens one shared role
   selector and aligned pane results: source slots and transformations,
   canonical reference pairs, actual resolved pairs, thresholds and limitations.
6. Check ordinary text, comments, ANSI colors, actual selection, cursor text
   and surface, forms, links and charts. A readable body pair can coexist with
   a hard-to-read secondary role. Keep labels and other non-color cues.
7. **Save candidate to shortlist** keeps up to 12 themes in this browser. Saved
   rows can become the candidate or reference, or be removed. The shortlist is
   local and is not included in shared URLs. If browser storage is unavailable,
   it remains usable for the current visit with a visible message.
8. Export from the intended pane and test in the target application. **Copy
   theme link** shares only B's identity. **Copy comparison link** includes both
   identities and shared specimen, scenario, type size, mapping and inspected
   role, excluding search, filters, sort and unrelated URL context. Browser
   back/forward restores the workspace state.

While a requested record loads, the pane identifies the pending theme and
retains its previously painted palette. A failure names the request and offers
**Retry loading theme**. Unready panes disable their exports; comparison sharing
waits for both visible panes. A retry performs another request without removing
already cached records.

The sun/moon control changes the outer site's appearance independently of the
preview palettes. It does not choose a theme's opposite-polarity counterpart.

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

| Need                                                          | Use                                                                                    |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Apply the original 20 palette slots in a web UI               | Pane **Source CSS** or **Tailwind theme**                                              |
| Copy one declared color                                       | Its palette or chart swatch                                                            |
| Save the compact original palette payload                     | Pane **Source colors JSON**; a preview projection                                      |
| Read numeric OKLCH, provenance, CVD/APCA and full chart ramps | Pane **Full record JSON**, package `themes.json` or `themes/<slug>.json`               |
| Reproduce the selected application's role rules               | Pane **Current mapping CSS**, including base identity, mapping version and attribution |
| Reuse a ready-made original stylesheet                        | Package `css/<slug>.css`                                                               |
| Integrate with design-token or terminal-template tools        | Package DTCG tokens or base16/base24 exports                                           |

Each pane exports its own theme. Source exports preserve the original palette
even when **ui-v1** is selected; mapped CSS is a separately named export.
**Source colors JSON** omits fields that the compact preview does not use;
**Full record JSON** is the complete canonical record. A chart swatch copies its
declared color rather than a sampled screenshot pixel. Clipboard feedback names
the pane and theme; stale pending selections cannot silently copy another theme.

See [README usage](../README.md#usage) for package import examples and
[README tags](../README.md#tags) for metric thresholds and exclusions.
Check [Attribution](../README.md#attribution) before redistributing a palette.
