#!/usr/bin/env tsx
// Rasterize the OG image to `og-image.png` at the standard 1200×630 size.
// Twitter / old Facebook crawlers only read PNG/JPG. Modern consumers
// (Slack / Discord / recent Safari) can use the SVG directly.
//
// We produce the PNG from a hex-colour SVG inlined in this script because
// resvg (the rasteriser) doesn't yet parse oklch() colours. The on-site SVG
// uses oklch() for parity with the rest of the design.

import { Resvg } from '@resvg/resvg-js';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pngPath = path.join(here, '..', 'public', 'og-image.png');

// Hex equivalents of the oklch() stops in site/public/og-image.svg.
// Derived by running the same values through culori's oklch→rgb pipeline.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1f2440"/>
      <stop offset="1" stop-color="#13162a"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>

  <g transform="translate(80, 120)">
    <rect x="0"    y="0" width="128" height="72" rx="10" fill="#ff4c5b"/>
    <rect x="140"  y="0" width="128" height="72" rx="10" fill="#d7a74a"/>
    <rect x="280"  y="0" width="128" height="72" rx="10" fill="#3cc975"/>
    <rect x="420"  y="0" width="128" height="72" rx="10" fill="#4cc5c9"/>
    <rect x="560"  y="0" width="128" height="72" rx="10" fill="#6b87e6"/>
    <rect x="700"  y="0" width="128" height="72" rx="10" fill="#c665d6"/>
    <rect x="840"  y="0" width="128" height="72" rx="10" fill="#df6fa0"/>
    <rect x="980"  y="0" width="60"  height="72" rx="10" fill="#f0f0ef"/>
  </g>

  <text x="80" y="300" font-family="system-ui, -apple-system, Segoe UI, sans-serif"
        font-size="88" font-weight="700" fill="#f2f2f0" letter-spacing="-1">
    OKLCH Terminal Themes
  </text>

  <text x="80" y="380" font-family="system-ui, -apple-system, Segoe UI, sans-serif"
        font-size="38" font-weight="400" fill="#c7c7c4">
    485 schemes · live preview · copy as CSS, Tailwind, or JSON
  </text>

  <text x="80" y="540" font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
        font-size="28" fill="#9a9fc4">
    <tspan fill="#3cc975">$</tspan>
    pnpm add <tspan fill="#d7a74a">@williamzujkowski/oklch-terminal-themes</tspan>
  </text>

  <g transform="translate(1000, 540)">
    <rect width="140" height="44" rx="22" fill="#282d4c" stroke="#5f67b3" stroke-width="1.5"/>
    <text x="70" y="29" text-anchor="middle"
          font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
          font-size="20" fill="#b5bdff">
      oklch()
    </text>
  </g>
</svg>`;

async function main(): Promise<void> {
  const resvg = new Resvg(SVG, {
    fitTo: { mode: 'width', value: 1200 },
    font: { loadSystemFonts: true },
  });
  const png = resvg.render().asPng();
  await writeFile(pngPath, png);
  console.log(`rasterized og-image.png (${png.length} bytes)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
