# OG / favicon asset generation

Source vectors for the tonem.ru social card and favicon, plus the script that
rasterizes them into `apps/tonem/public/`.

- `og-card.svg` — 1200×630 Open Graph card (dark, "тонем?" word mark, big
  tabular number, ticker strip — matches the app aesthetic in `src/styles.scss`).
- `favicon.svg` — minimal brand mark ("?" over a sinking tick) used as the
  modern SVG favicon and the source for the ICO / apple-touch-icon.
- `fonts/` — the Inter weights the card uses, kept in-repo so regeneration is
  deterministic (no network fetch). Inter is OFL-licensed.
- `generate.js` — rasterizes the SVGs with `sharp` → `og-card.png`,
  `favicon.ico` (32px PNG-embedded), `apple-touch-icon.png`, `favicon.svg`.

## Regenerate

Text in the SVGs needs fontconfig + Inter at raster time, so run inside a node
container with the fonts installed (docker images are already used by this
repo; run from the repo root):

```bash
docker run --rm \
  -v "$PWD/apps/tonem:/work" -w /work node:20-alpine sh -c '
    apk add --no-cache fontconfig >/dev/null 2>&1
    mkdir -p /usr/share/fonts/truetype/inter
    cp /work/tools/og/fonts/*.ttf /usr/share/fonts/truetype/inter/
    fc-cache -f >/dev/null 2>&1
    cd /work/tools/og
    npm init -y >/dev/null 2>&1
    npm install sharp --no-audit --no-fund >/dev/null 2>&1
    node generate.js
  '
```

Outputs land in `apps/tonem/public/` and are picked up by the Angular build
(`angular.json` copies `public/**/*` into `dist/tonem/browser`).

> Note: `og:image` points at the **PNG** (`/og-card.png`) because several
> crawlers (notably Telegram/VK/some Slack previews) still don't rasterize SVG
> cards. The SVG stays as the editable source only.
