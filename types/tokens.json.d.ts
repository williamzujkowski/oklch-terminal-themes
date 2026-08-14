/**
 * Type declaration for `@williamzujkowski/oklch-terminal-themes/tokens/<slug>.tokens.json`.
 * See `themes.json.d.ts` for why these exist (#185).
 *
 * Typed structurally rather than against a DTCG library type: the export
 * targets the stable 2025.10 surface (#148) and deliberately does not depend
 * on any third-party spec typing, which would pull a dependency into
 * consumers' typechecks for no runtime benefit.
 */

/** A DTCG colour component. `'none'` marks a powerless hue (chroma 0). */
export type DtcgComponent = number | 'none';

export interface DtcgColorValue {
  colorSpace: 'oklch';
  components: [DtcgComponent, DtcgComponent, DtcgComponent];
  alpha: number;
  /** sRGB fallback, always present — the source value, not a reconversion. */
  hex: string;
}

export interface DtcgColorToken {
  $value: DtcgColorValue;
  $description?: string;
}

/** The eight ANSI hues, in canonical order. */
export interface DtcgAnsiHalf {
  black: DtcgColorToken;
  red: DtcgColorToken;
  green: DtcgColorToken;
  yellow: DtcgColorToken;
  blue: DtcgColorToken;
  purple: DtcgColorToken;
  cyan: DtcgColorToken;
  white: DtcgColorToken;
}

export interface DtcgTokenDocument {
  $description: string;
  $extensions: {
    'dev.oklch-terminal-themes': {
      slug: string;
      name: string;
      isDark: boolean;
      tags: string[];
      source: string;
      sourceUrl: string;
      /** Present only when the theme has a documented light/dark counterpart. */
      counterpart?: string;
    };
  };
  color: {
    /** Set once on the group and inherited by every descendant token. */
    $type: 'color';
    background: DtcgColorToken;
    foreground: DtcgColorToken;
    cursor: DtcgColorToken;
    selection: DtcgColorToken;
    ansi: {
      $description?: string;
      normal: DtcgAnsiHalf;
      bright: DtcgAnsiHalf;
    };
  };
}

declare const tokens: DtcgTokenDocument;
export default tokens;
