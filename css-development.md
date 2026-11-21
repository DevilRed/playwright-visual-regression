# PSD/Figma → HTML: design-to-code and visual QA workflow

A single workflow for turning a PSD or Figma design into plain HTML/CSS and **proving** it matches — per viewport — with scripts instead of eyeballing an overlay. The same setup carries through to a WordPress, PrestaShop or React build by changing only the URL.

The views below were consolidated from four overlapping drafts. Where they disagreed, this note uses one rule; see "Resolved decisions" at the end for the calls that were made.

---

## 1. Guiding principles

1. **Tokens first, components second, pages last.** Most "automated layout" comes from the design system, not clever CSS.
2. **Tolerance-based fidelity, not pixel-perfect literalism.** Browsers render fonts and assets differently than Photoshop/Figma. Chase layout structure, not literal pixels (see §15).
3. **The static HTML/CSS build is the implementation source of truth.** Port to a CMS late, not early — porting early means fighting the template engine and the design at once.
4. **Accessibility and responsiveness are part of "matching the design."** A design that breaks at 360px or fails contrast is not implemented correctly even if a full-page screenshot matches.
5. **Verify at every breakpoint**, and in CI where practical.

---

## 2. The key mental model: two different comparisons

Almost every contradiction in the old drafts came from mixing these up. They answer different questions and use different tools:

|Question|Tool|Compares|When|
|---|---|---|---|
|"Does my build match the **design**?"|`compare.mjs` + `pixelmatch` (§12)|Page screenshot vs **PSD/Figma export**|While building|
|"Did my build **change/regress**?"|Playwright `toHaveScreenshot` (§19)|Page screenshot vs **its own earlier approved screenshot**|After approval, after CMS port|
|"Does it *feel* right?"|PerfectPixel overlay (§16)|Design vs page, by eye|Secondary sanity check only|

`toHaveScreenshot` does **not** compare against the design file — its baseline is a previously approved screenshot of your own build. The design comparison is the standalone `compare.mjs` script. Keep a clear baseline of design exports, and a separate set of regression snapshots.

The design-diff pipeline:

```
PSD/Figma artboard ──export PNG @1x──►  design/home-desktop.png ─┐
                                                                 ├─► pixelmatch ─► diff.png + mismatch %
Your HTML ──Playwright screenshot @ same width──► actual.png ────┘
```

Rules that make the comparison meaningful:

1. Same viewport width as the artboard (1440, 768, 375…).
2. Same pixel scale: design export at **1x**, browser `deviceScaleFactor: 1` (§10).
3. Same fonts, same content (real text, same images).
4. Animations off, fonts loaded, lazy images triggered, page settled before the screenshot.
5. Accept a **tolerance**. Zero diff is not a realistic goal.

---

## 3. Project layout

```
project/
├─ src/                       # plain HTML/CSS you are building
│  ├─ index.html
│  ├─ css/
│  │  ├─ main.css             # entry point: @imports the partials in order
│  │  ├─ styles.css           # generated: merged output linked from HTML (git-ignored)
│  │  ├─ tokens.css           # variables only
│  │  ├─ base.css             # reset, elements, typography
│  │  ├─ layout.css           # container, grid, header/footer shells
│  │  ├─ components/          # one file per component: card.css, nav.css, …
│  │  ├─ utilities.css        # helpers: visually-hidden, spacing, alignment
│  │  └─ pages/               # page-specific overrides: home.css, product.css
│  │                          # or author partials in src/scss/ and compile here (§7)
│  ├─ fonts/                  # self-hosted woff2
│  └─ img/                    # exported assets (SVG for icons/logos)
├─ design/                    # PNG exports of the design for diffing (1x, sRGB)
│  ├─ home-desktop.png        # 1440 wide
│  ├─ home-tablet.png         # 768 wide
│  └─ home-mobile.png         # 375 wide
├─ visual/
│  ├─ compare.mjs             # design-diff script (§12)
│  ├─ visual.config.json      # what to compare (§11)
│  └─ regression.spec.js      # baseline snapshots (§19)
├─ DESIGN-NOTES.md            # ambiguities, breakpoints, missing states
├─ visual-output/             # generated: actual / diff / report.html (git-ignored)
└─ package.json
```

Naming convention for design exports: `<page>-<viewport>.png`. Keep it boring and consistent so the config stays trivial.

### Combining the CSS partials

Author as partials (§7), but ship **one** stylesheet. `src/css/main.css` is the only CSS file the HTML links; it just lists the partials in order:

```css
/* src/css/main.css */
@import "tokens.css";
@import "base.css";
@import "layout.css";
@import "components/card.css";
@import "components/nav.css";
@import "utilities.css";
@import "pages/home.css";
```

Order matters: tokens → base → layout → components → utilities → page overrides. This is also how you control cascade order without fighting specificity.

**Recommended: resolve the imports at build time** so the browser downloads a single file and the CMS port enqueues a single stylesheet. `esbuild` bundles CSS `@import` natively:

```bash
npm i -D esbuild
```

```json
{
  "scripts": {
    "css": "esbuild src/css/main.css --bundle --outfile=src/css/styles.css",
    "css:watch": "esbuild src/css/main.css --bundle --outfile=src/css/styles.css --watch",
    "dev": "npm run css:watch & serve src -l 5173",
    "visual": "npm run css && node visual/compare.mjs"
  }
}
```

```html
<link rel="stylesheet" href="css/styles.css">
```

For WordPress/PrestaShop, enqueue that one generated file (§21); don't ship the partials. Note that `npm run visual` rebuilds first, so the diff always tests the current CSS. If a CSS library is used, its compiler output becomes this same single file (§7).

**Browser-native `@import` (quick local prototype only):** link `main.css` directly and let the browser fetch each partial. `@import` rules must be the first statements in the file, and each one is a separate, sequential request, so it slows first paint. Keep the partials behind a build step for anything you deploy or diff seriously.

---

## 4. Setup

```bash
npm init -y
npm pkg set type=module
npm i -D playwright @playwright/test pngjs pixelmatch serve esbuild
npx playwright install chromium
```

Add scripts to `package.json` (the CSS build is explained in §3):

```json
{
  "scripts": {
    "css": "esbuild src/css/main.css --bundle --outfile=src/css/styles.css",
    "css:watch": "esbuild src/css/main.css --bundle --outfile=src/css/styles.css --watch",
    "dev": "npm run css:watch & serve src -l 5173",
    "visual": "npm run css && node visual/compare.mjs"
  }
}
```

Run `npm run dev` in one terminal, `npm run visual` in another. Both keep `styles.css` in sync with the partials. This example uses plain CSS and esbuild; if you author in SCSS or use Tailwind/Bootstrap, swap the compiler as shown in §7 — the output file and the diff workflow stay the same.

---

## 5. Extracting the design

Goal: translate the visual design into a code-enforced system before writing markup.

**If the source is Figma**

- Use Dev Mode to read exact spacing, typography and colour values — never eyeball.
- Export tokens with Tokens Studio / Figma Tokens, or the W3C Design Tokens format, into `tokens.json` / `tokens.css`.
- Prefer SVG for icons and logos; export raster assets at the resolutions you need.
- If the file is messy, spend 15–30 min normalizing frames/components first — it pays back during measurement.

**If the source is a PSD (legacy path)**

- Photoshop: right-click a text layer → **Copy CSS** for quick one-off values (text styles, gradients, shadows).
- For bulk extraction use a parser such as `ag-psd` or `psd.js` to pull layer text, colours and bounds programmatically.
- Confirm there is one artboard per viewport. If the PSD is desktop-only, flag it — you will design the mobile states yourself (§8).
- Ask for original raster assets if anything looks compressed.

**Deliverables of this phase:** `tokens.css`, an `img/` folder of assets, and `DESIGN-NOTES.md` recording anything ambiguous (hover states, unknown breakpoints, missing mobile designs).

---

## 6. Design tokens

Define every colour, type value and spacing step once, then use variables everywhere. Plain CSS custom properties:

```css
:root {
  /* colour */
  --color-primary: #1B5FD9;
  --color-text: #1A1A1A;
  --color-surface: #FFFFFF;
  --color-text-muted: #5C6670;

  /* typography */
  --font-family-base: "Inter", system-ui, sans-serif;
  --fs-h1: 3rem;      --lh-h1: 1.1;
  --fs-h2: 2.25rem;   --lh-h2: 1.2;
  --fs-body: 1rem;    --lh-body: 1.6;

  /* spacing — 4px base; every other step lands on the 8px rhythm */
  --space-1: 0.25rem;   /* 4px  */
  --space-2: 0.5rem;    /* 8px  */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */

  /* layout */
  --container-max: 1200px;
  --container-padding: 1rem;
  --radius-sm: 4px;   --radius-md: 8px;

  /* elevation */
  --shadow-card: 0 1px 3px rgba(0, 0, 0, .12);
}
```

Rules:

- Never hardcode a raw value in a component; everything comes from a token.
- If the design's spacing is not a clean scale, snap it to the nearest 4px step and note the deviation in `DESIGN-NOTES.md`. Consistency beats literalness.
- Fluid type where the design supports it: `--fs-h1: clamp(2rem, 1.5rem + 2.5vw, 3rem);`
- Optionally enforce this with Stylelint (§20).

---

## 7. CSS architecture

The structure in §3 is deliberately framework-free so it ports to any CMS.

- **Class naming:** pick one and stay consistent. BEM (`.card__title--large`) is verbose but porting-friendly to PHP/Smarty templates. Avoid tag selectors and deep nesting — template engines rearrange markup.
- **Grid for page structure, Flexbox for components.** Grid template areas make section-level layout legible in one place.
- **Components are self-contained:** a component's CSS must not depend on where it is used. This is what makes the CMS port cheap.
- **Container queries for widgets:** use `@container` so a component adapts to its parent wrapper, not just the viewport; use `@media` only for global page-structure changes.
- **Prefer no framework in the plain-build path** (no Tailwind, no Bootstrap) — custom utility classes keep the result portable. If a library is required, see below.

### Using a CSS library (Bootstrap / Tailwind)

The diff workflow (§12) is authoring-agnostic: it compares rendered pixels, so it works the same. What changes is the reset, the tokens and the build step.

**Settle the reset first.** Bootstrap Reboot / Tailwind Preflight remove margins, set `box-sizing`, normalize headings and images. If your `base.css` also resets, you have two resets and get whole-page red diffs. Pick one: disable the library's reset (Tailwind v3 `corePlugins: { preflight: false }`; in v4 omit or override the preflight layer), or drop the duplicate rules from your `base.css`. Do this **before** creating baselines.

**Map tokens into the library, not values on top of it** — `tokens.css` stays the source of truth:

- **Tailwind:** extend `theme` in `tailwind.config.js`, or use `@theme` in v4, so colours, spacing and fonts come from the design tokens. Prefer `bg-primary` over `bg-[#1B5FD9]`; avoid one-off arbitrary values.
- **Bootstrap (Sass):** override `$primary`, `$spacer`, `$font-family-sans-serif`, `$border-radius-*` *before* importing Bootstrap, then compile. Generate both from one token source where possible.
- Import only what you need: Bootstrap `reboot` + `grid` instead of the full bundle; Tailwind's used utilities via its content scan. Less library CSS means fewer overrides to write.

**Build pipeline:** the esbuild step in §4 merges plain CSS. With a library, its compiler replaces esbuild (Tailwind CLI bundles `@import` itself; Sass handles Bootstrap's imports) and still outputs the same single `styles.css`. One pipeline, one file linked from HTML and enqueued in the CMS.

### Including the library with your custom CSS

**Option A — quick prototype: two `<link>` tags, no build.** Library first, your CSS second so yours wins on equal specificity:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
<link rel="stylesheet" href="css/styles.css">
```

Fine for a throwaway demo. Don't ship this: external request, no token mapping, and you download the entire library to override parts of it.

**Option B — Tailwind v4: one entry file, one compiler.** The CLI inlines your `@import`s, so it replaces esbuild:

```bash
npm i -D tailwindcss @tailwindcss/cli
```

```css
/* src/css/main.css */
@import "tailwindcss";          /* preflight + generated utilities (first) */
@import "./tokens.css";
@import "./base.css";
@import "./layout.css";
@import "./components/card.css";
@import "./components/nav.css";
@import "./utilities.css";
@import "./pages/home.css";

@theme {
  --color-primary: var(--ds-color-primary);
  --font-sans: var(--ds-font-family-base);
}
```

```json
{
  "scripts": {
    "css": "@tailwindcss/cli -i src/css/main.css -o src/css/styles.css --minify",
    "css:watch": "@tailwindcss/cli -i src/css/main.css -o src/css/styles.css --watch"
  }
}
```

Either let `@theme` own the colour/type values and remove those literals from `tokens.css`, or prefix the raw token (`--ds-color-primary`) and reference it as above. Never define the same literal in both places. Tailwind v4 puts its rules in cascade layers, so your **unlayered** custom CSS wins automatically; use `@layer components` / `@layer utilities` only when you deliberately want library ordering. On v3 use the PostCSS plugin with `tailwind.config.js` (`content: ['./src/**/*.html']`) instead.

**Option C — Bootstrap 5 (Sass): override, import library, then custom CSS.** Rename the partials from §3 to `.scss` (plain CSS is valid SCSS) so Sass inlines them instead of leaving browser `@import`s:

```bash
npm i -D sass bootstrap
```

```scss
/* src/css/main.scss */
// 1. Overrides BEFORE Bootstrap.
$primary: #1B5FD9;
$spacer: 1rem;
$font-family-sans-serif: "Inter", system-ui, sans-serif;

// 2. Only the Bootstrap pieces you need.
@import "bootstrap/scss/functions";
@import "bootstrap/scss/variables";
@import "bootstrap/scss/variables-dark";
@import "bootstrap/scss/maps";
@import "bootstrap/scss/mixins";
@import "bootstrap/scss/utilities";
@import "bootstrap/scss/root";
@import "bootstrap/scss/reboot";
@import "bootstrap/scss/type";
@import "bootstrap/scss/containers";
@import "bootstrap/scss/grid";
@import "bootstrap/scss/utilities/api";   // utilities last so they win inside Bootstrap

// 3. Your partials AFTER the library.
@import "tokens";
@import "base";                 // additions only — no second reset
@import "layout";
@import "components/card";
@import "components/nav";
@import "utilities";
@import "pages/home";
```

```json
{
  "scripts": {
    "css": "sass --no-source-map src/css/main.scss src/css/styles.css",
    "css:watch": "sass --watch --no-source-map src/css/main.scss src/css/styles.css"
  }
}
```

Replace the esbuild scripts in §4 with these. `@import "bootstrap";` pulls in the whole library if you don't need a selective build. Sass prints a deprecation warning for `@import` because `@use` is preferred, but Bootstrap 5 itself still uses `@import` for variable overrides — the warning is expected.

**Ordering rule:** library reset/base → tokens → your `base.css` (additions, not a second reset) → layout → components → utilities → page overrides. Whatever must win comes later (or is more specific). If library utilities keep beating your components, move Bootstrap's `utilities/api` earlier or scope your overrides in Tailwind layers.

**CMS caveats:** Tailwind's JIT only generates classes it can find in scanned files — classes assembled inside PHP/Smarty templates need those paths in `content` or a safelist. Bootstrap's JS widgets (carousel, modal, dropdown) create dynamic states: mask them in the diff and capture them as extra shots (§18).

**Rule of thumb:** plain CSS + tokens is cleanest for a strict design-match with a late CMS port. Use a library when the team/CMS standard requires it or speed matters — but treat it as a foundation configured by your tokens, not as the design itself.

### Authoring in SCSS

You can write SCSS without changing the verification workflow: `compare.mjs` (§12) and `toHaveScreenshot` (§19) only see the compiled `src/css/styles.css`. Only the source layout and build step change.

**Layout** — replace the `src/css/` partials in §3 with a `src/scss/` tree:

```
src/scss/
├─ main.scss              # entry: @use the partials in order
├─ _tokens.scss           # CSS custom properties + Sass vars/mixins
├─ _base.scss             # additions/typography — no second reset
├─ _layout.scss
├─ components/
│  ├─ _card.scss
│  └─ _nav.scss
├─ _utilities.scss
└─ pages/
   ├─ _home.scss
   └─ _product.scss
```

Partials start with `_` and are never compiled directly. Keep the output at `src/css/styles.css` so the HTML `<link>` and CMS enqueue code stay unchanged.

**Use `@use`, not `@import`.** `@import` is deprecated in Dart Sass; `@use` loads each module once and namespaces its members:

```scss
// src/scss/main.scss
@use "tokens" as *;      // variables/mixins available unprefixed
@use "base";
@use "layout";
@use "components/card";
@use "components/nav";
@use "utilities";
@use "pages/home";
```

`@use` rules must come first in the file. CSS from each module is emitted in load order, so this is also your cascade order: tokens → base → layout → components → utilities → pages.

**Keep tokens as CSS variables; add Sass only for compile-time logic:**

```scss
// src/scss/_tokens.scss
@use "sass:map";

:root {
  --color-primary: #1B5FD9;
  --space-4: 1rem;
}

$breakpoints: (sm: 640px, md: 768px, lg: 1024px, xl: 1280px);

@mixin respond-to($bp) {
  @media (min-width: map.get($breakpoints, $bp)) { @content; }
}

@mixin visually-hidden {
  position: absolute;
  width: 1px; height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
```

Custom properties stay in the output for runtime theming and for mapping into Tailwind/Bootstrap (§7); Sass variables and mixins compile away. Use mixins for repeated patterns, but keep nesting shallow (2–3 levels) and use BEM with `&__element` / `&--modifier` so selectors stay flat and portable.

**Setup:**

```bash
npm i -D sass
```

```json
{
  "scripts": {
    "css": "sass --no-source-map --style=expanded src/scss/main.scss src/css/styles.css",
    "css:watch": "sass --watch --source-map --style=expanded src/scss/main.scss src/css/styles.css",
    "dev": "npm run css:watch & serve src -l 5173",
    "visual": "npm run css && node visual/compare.mjs"
  }
}
```

Keep `src/css/styles.css` and `*.css.map` out of git; CI runs `npm run css`. `npm run visual` rebuilds first, so every diff tests the latest SCSS.

**With a CSS library:** Bootstrap 5 still needs Sass `@import` for variable overrides (§7 Option C). Don't mix `@use` and Bootstrap's `@import` in one entry file — keep that entry `@import`-based and accept the deprecation warning, or compile Bootstrap to its own CSS and include that compiled file from `main.scss`. Tailwind v4 consumes plain CSS, so keep a small plain-CSS entry that imports `tailwindcss` first and your compiled `styles.css` after; `@theme` token mapping stays in that plain entry (§7 Option B).

---

## 8. Responsive strategy

- Extract breakpoints from the design if they exist; otherwise define `640 / 768 / 1024 / 1280` and note them in `DESIGN-NOTES.md`.
- Build **mobile-first if a mobile design exists**, desktop-first if the design is desktop-only and you are inventing mobile states. Pick one direction per project; don't mix arbitrarily.
- Where only one viewport is provided: **preserve visual hierarchy and content order; reflow, don't shrink.** Side-by-side columns → stacked; nav → hamburger; font sizes via `clamp()`.
- Test at fixed reference viewports: **375, 768, 1024, 1440, 1920**. These become your screenshot-comparison widths, plus spot checks between breakpoints (see §16).

---

## 9. Multi-page strategy

- Identify repeating sections (header, footer, nav, cards, forms, breadcrumbs) and build each once as a component.
- In the static phase, simulate includes with a dev setup or small build step (`vite`, `11ty`, or PHP includes) so header/footer edits are one-line changes. The CMS port replaces the mechanism, not the components.
- Keep a `PAGES.md` inventory: page → sections used → status (built / verified).
- Build in order of reuse: highest-reuse sections first (header/footer), then home, then inner-page templates, then edge cases (cart, 404, forms).

---

## 10. Exporting the design for comparison

**Per artboard / viewport:**

- Photoshop: _File → Export → Export As…_ → PNG, **scale 100%**, tick _Convert to sRGB_, untick _Embed Color Profile_. Colour-profile mismatches create false diffs on every pixel.
- Free alternative: open the PSD in Photopea and export the same way.
- Export the **full artboard** for page-level checks. For tricky areas also export **section crops** (header, hero, footer) to compare in isolation (§14).

**Check the scale.** If the PSD canvas is 2880 px wide for a 1440 layout, it is a 2x file. Downscale the *comparison export* to 1x:

```bash
magick design/home-desktop@2x.png -resize 50% design/home-desktop.png
```

Do not set `deviceScaleFactor: 2` and compare against the 2x file as a shortcut; it works, but CSS measurements and the test then disagree with the 1x mental model. Note the distinction: **assets** (logos, images) may be exported at 2× for retina displays; **design images used for diffing** must be 1x and match the browser's `deviceScaleFactor: 1`.

---

## 11. The configuration file

`visual/visual.config.json`:

```json
{
  "baseUrl": "http://localhost:5173",
  "threshold": 0.1,
  "maxDiffPercent": 1.0,
  "outputDir": "visual-output",
  "viewportHeight": 900,
  "pages": [
    {
      "name": "home",
      "path": "/index.html",
      "shots": [
        { "viewport": "desktop", "width": 1440, "design": "design/home-desktop.png" },
        { "viewport": "tablet",  "width": 768,  "design": "design/home-tablet.png" },
        { "viewport": "mobile",  "width": 375,  "design": "design/home-mobile.png" },
        {
          "viewport": "desktop",
          "width": 1440,
          "label": "hero",
          "selector": ".hero",
          "design": "design/home-desktop-hero.png"
        }
      ],
      "mask": [".carousel", "video", ".ad-slot"]
    }
  ]
}
```

|Key|Meaning|
|---|---|
|`threshold`|pixelmatch per-pixel colour sensitivity, 0–1. `0.1` is a good start; raise to `0.15–0.2` to ignore anti-aliasing noise.|
|`maxDiffPercent`|Fail the shot if more than this % of pixels differ. Start at 1–2 %, tighten as you polish.|
|`selector`|Screenshot only this element (section-level checks). The design file must be a crop of the same area.|
|`mask`|Elements whose areas are painted over in **both** images (carousels, videos, dates, anything dynamic).|

---

## 12. The design-diff script

`visual/compare.mjs`:

```js
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import fs from 'node:fs/promises';
import path from 'node:path';

const cfg = JSON.parse(await fs.readFile('visual/visual.config.json', 'utf8'));
const out = cfg.outputDir;
await fs.mkdir(out, { recursive: true });

const readPng = async (p) => PNG.sync.read(await fs.readFile(p));

// Put an image on a larger canvas filled with magenta, so size differences
// show up as obvious diff instead of silently failing.
function padTo(img, w, h) {
  if (img.width === w && img.height === h) return img;
  const canvas = new PNG({ width: w, height: h });
  for (let i = 0; i < canvas.data.length; i += 4) {
    canvas.data[i] = 255; canvas.data[i + 1] = 0; canvas.data[i + 2] = 255; canvas.data[i + 3] = 255;
  }
  PNG.bitblt(img, canvas, 0, 0, Math.min(img.width, w), Math.min(img.height, h), 0, 0);
  return canvas;
}

// Fill rectangles with a flat colour (used to ignore dynamic regions).
function fillRects(img, rects) {
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
    const x1 = Math.min(img.width, Math.ceil(r.x + r.width));
    const y1 = Math.min(img.height, Math.ceil(r.y + r.height));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * img.width + x) * 4;
        img.data[i] = 128; img.data[i + 1] = 128; img.data[i + 2] = 128; img.data[i + 3] = 255;
      }
    }
  }
}

const results = [];
const browser = await chromium.launch();

for (const pg of cfg.pages) {
  for (const shot of pg.shots) {
    const id = [pg.name, shot.viewport, shot.label].filter(Boolean).join('-');

    const context = await browser.newContext({
      viewport: { width: shot.width, height: cfg.viewportHeight ?? 900 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(cfg.baseUrl + pg.path, { waitUntil: 'networkidle' });

    // Kill animations/transitions/carets so screenshots are deterministic.
    await page.addStyleTag({
      content: `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
                html{scroll-behavior:auto!important}`,
    });
    await page.evaluate(() => document.fonts.ready);

    // Lazy-loaded images: scroll through the page once, then back to top.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });

    // Optional actions for interactive states (§18), before the screenshot.
    for (const a of shot.actions ?? []) {
      if (a.click) await page.locator(a.click).first().click();
      if (a.hover) await page.locator(a.hover).first().hover();
      if (a.focus) await page.locator(a.focus).first().focus();
    }

    // Collect mask rectangles (relative to the captured area).
    const origin = shot.selector
      ? await page.locator(shot.selector).first().evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left + scrollX, y: r.top + scrollY };
        })
      : { x: 0, y: 0 };

    const rects = [];
    for (const sel of pg.mask ?? []) {
      const found = await page.locator(sel).evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
        })
      );
      for (const r of found) rects.push({ ...r, x: r.x - origin.x, y: r.y - origin.y });
    }

    // Screenshot.
    const actualPath = path.join(out, `${id}.actual.png`);
    if (shot.selector) await page.locator(shot.selector).first().screenshot({ path: actualPath });
    else await page.screenshot({ path: actualPath, fullPage: true });
    await context.close();

    // Compare.
    let actual = await readPng(actualPath);
    let design = await readPng(shot.design);
    const actualSize = `${actual.width}x${actual.height}`;
    const sizeMismatch = actual.width !== design.width || actual.height !== design.height;
    const w = Math.max(actual.width, design.width);
    const h = Math.max(actual.height, design.height);
    actual = padTo(actual, w, h);
    design = padTo(design, w, h);
    fillRects(actual, rects);
    fillRects(design, rects);

    const diff = new PNG({ width: w, height: h });
    const diffPixels = pixelmatch(design.data, actual.data, diff.data, w, h, {
      threshold: cfg.threshold ?? 0.1,
      includeAA: false,          // ignore anti-aliased edge pixels
      alpha: 0.3,
      diffColor: [255, 0, 0],
    });
    const percent = (diffPixels / (w * h)) * 100;

    const diffPath = path.join(out, `${id}.diff.png`);
    const designCopy = path.join(out, `${id}.design.png`);
    await fs.writeFile(diffPath, PNG.sync.write(diff));
    await fs.writeFile(designCopy, PNG.sync.write(design));

    results.push({
      id, percent, sizeMismatch,
      pass: percent <= cfg.maxDiffPercent && !sizeMismatch,
      note: sizeMismatch ? `size: design ${shot.design} (${design.width}x${design.height}) vs actual ${actualSize}` : '',
    });
  }
}
await browser.close();

// Console summary.
console.log('\nVisual diff results');
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(28)} ${r.percent.toFixed(2)}%  ${r.sizeMismatch ? '(SIZE MISMATCH)' : ''}`);
}

// HTML report: design / actual / diff + an opacity slider overlay.
const card = (r) => `
<section>
  <h2>${r.pass ? 'PASS' : 'FAIL'} ${r.id} — ${r.percent.toFixed(2)}% ${r.note}</h2>
  <div class="row">
    <figure><figcaption>Design</figcaption><img src="${r.id}.design.png"></figure>
    <figure><figcaption>Actual</figcaption><img src="${r.id}.actual.png"></figure>
    <figure><figcaption>Diff</figcaption><img src="${r.id}.diff.png"></figure>
  </div>
  <label>Overlay: <input type="range" min="0" max="100" value="50"
    oninput="this.nextElementSibling.querySelector('.top').style.opacity=this.value/100"></label>
  <div class="overlay"><img src="${r.id}.design.png"><img class="top" src="${r.id}.actual.png" style="opacity:.5"></div>
</section>`;
await fs.writeFile(path.join(out, 'report.html'), `<!doctype html><meta charset="utf-8"><title>Visual report</title>
<style>
body{font:14px system-ui;margin:20px;background:#222;color:#eee}
.row{display:flex;gap:12px;align-items:flex-start;overflow-x:auto}
figure{margin:0}figure img{max-width:420px;display:block}
.overlay{position:relative;display:inline-block;margin:12px 0 40px}
.overlay img{display:block;max-width:900px}.overlay .top{position:absolute;inset:0}
</style>${results.map(card).join('')}`);

console.log(`\nReport: ${path.join(out, 'report.html')}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
```

Run it:

```bash
npm run dev      # terminal 1
npm run visual   # terminal 2
open visual-output/report.html
```

---

## 13. The daily loop

1. Build one section (header, hero, features…).
2. Run `npm run visual`.
3. Open `report.html`. Read the **diff** image first:
    - Red bands along one edge → spacing/height drift (cumulative offset).
    - Red text blocks → wrong font size, weight, letter-spacing or line-height.
    - Red solid blocks → wrong colour or missing image.
    - Magenta area → design and page dimensions differ.
4. Fix the **first** (top-most) red region first. Everything below it often shifts and clears up by itself.
5. Use the overlay slider when the cause isn't obvious.
6. Repeat until under `maxDiffPercent`, then tighten the tolerance.

Work top to bottom and use `selector` shots so you are not scrolling a 6000 px diff.

---

## 14. Section-level checks (recommended)

A full-page diff fails entirely if the header is 4 px taller, because everything below shifts. Compare **sections independently** to avoid that:

1. Export a crop of each section from the design (same width as the viewport, e.g. 1440 × 720).
2. Give each section a stable selector (`.hero`, `.features`, `footer`).
3. Add a `shots` entry per section with `selector` and `label`.

Do both: section shots to develop with, one full-page shot per viewport as the final acceptance check.

---

## 15. Realistic tolerances

You will never reach 0.00 %. Expected noise:

|Source|What to do|
|---|---|
|Text anti-aliasing / subpixel rendering differs between the design tool and Chromium|`includeAA: false`, `threshold` 0.1–0.2|
|Font hinting differences|Accept; verify font-size/line-height by measurement instead|
|Image resampling|Use the exact exported asset at its display size|
|Gradients and shadows (blur radius differs)|Accept small diffs; compare visually|
|Different OS rendering (Mac vs Linux)|Always compare on the same machine/Docker image|

Suggested gates:

|Stage|`maxDiffPercent`|
|---|---|
|First pass|3–5 %|
|Polish|1–2 %|
|Sign-off|≤ 1 %, and no visible red blocks|

A low percentage can still hide a small but important error (a missing icon is a tiny % of pixels). **Always look at the diff image**; the number is only a gate.

---

## 16. What the diff cannot tell you (check manually or in DevTools)

- Hover, focus, active, open-menu and disabled states (capture them as extra shots with `actions`; see §18).
- Behaviour **between** the design's breakpoints (test 320, 600, 1024, 1280, 1920 for overflow and broken layouts; there is no design to diff against, so check by eye).
- Real content length (long titles, translations, missing images, 1-line vs 5-line headings).
- Accessibility: contrast (AA), focus visibility, semantic order, alt text, keyboard nav — run axe and Lighthouse (§20).
- Cross-browser spot check: Chromium + Firefox + WebKit. Font and subpixel rendering will differ; check only for structural breakage.
- Measurements: confirm in DevTools computed styles that paddings, font sizes and line-heights match the design specs. They are cleaner to maintain than pixel-chasing.

---

## 17. Making fonts match (biggest source of false diffs)

- Use the **same font files** as the design (check licence), self-hosted in `src/fonts/` as `woff2`.
- Match weight exactly (a 500 vs 600 mismatch changes every glyph).
- Copy `font-size`, `line-height` and `letter-spacing` from the design's type panel. Photoshop tracking is in 1/1000 em: `tracking 50` = `letter-spacing: 0.05em`.
- Photoshop line-height is in px; in CSS prefer unitless `line-height` (e.g. `1.5`), computed to match the design.
- Wait for fonts in the script (`document.fonts.ready`, already included) so you never screenshot the fallback font. Set `font-display: swap` for production, but ensure fonts are loaded before capture.

---

## 18. Capturing interactive states (optional)

Add actions before the screenshot by extending a shot with an `actions` array:

```json
{
  "viewport": "desktop", "width": 1440, "label": "nav-open",
  "selector": "header",
  "actions": [{ "click": ".menu-toggle" }],
  "design": "design/nav-open-desktop.png"
}
```

The handler for `click` / `hover` / `focus` is already included in `compare.mjs` (§12), placed after the lazy-load scroll and before the screenshot. Only do this if the design actually includes those states.

---

## 19. Regression baselines (after the design is approved)

Once a section matches, freeze it so later edits can't silently break it. Use Playwright's own test runner:

```bash
npm i -D @playwright/test
```

`visual/regression.spec.js`:

```js
import { test, expect } from '@playwright/test';

const widths = { desktop: 1440, tablet: 768, mobile: 375 };

for (const [name, width] of Object.entries(widths)) {
  test(`home ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://localhost:5173/index.html');
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`home-${name}.png`, {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.002,
    });
  });
}
```

```bash
npx playwright test --update-snapshots   # create / approve new baselines
npx playwright test                      # compare against baselines
```

These baselines are your own approved build, not the design file. Both jobs are summarized in §2.

---

## 20. Automated QA extras

**Token linting.** Stop hardcoded values slipping into components with Stylelint and `stylelint-declaration-strict-value`:

```json
{
  "plugins": ["stylelint-declaration-strict-value"],
  "rules": {
    "scale-unlimited/declaration-strict-value": [
      ["/color/", "font-size", "spacing"],
      { "ignoreValues": ["inherit", "initial", "transparent", "currentColor"] }
    ]
  }
}
```

**Accessibility.** Use axe via `@axe-core/playwright` in a Playwright test (there is no built-in `toBeAccessible()` matcher):

```js
import AxeBuilder from '@axe-core/playwright';

test('home is accessible', async ({ page }) => {
  await page.goto('http://localhost:5173/index.html');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

axe DevTools and Lighthouse are useful manual backups. Target zero critical/serious violations and AA text contrast.

**Hosted visual diff** (optional, paid): Chromatic, Percy, Applitools Eyes. They handle multi-browser/multi-viewport diffing with a review UI and ignore minor rendering noise; worth it for long-lived client sites. Applitools in particular replaces strict pixel matching with perceptual ("AI") comparison.

---

## 21. Porting to the target platform

Port late, after the static build is approved, and reuse `compare.mjs` by changing only `baseUrl` and `path`:

```json
{ "baseUrl": "http://localhost:8080", "pages": [{ "name": "home", "path": "/", "shots": [ "… same shots …" ] }] }
```

|Platform|Things that break visual matching|Where the CSS goes|
|---|---|---|
|Custom site|Asset optimization; growing page count|Static build ships nearly as-is — add a build step and include mechanism if needed|
|PrestaShop|Debug toolbar, cookie/GDPR modules, demo content differing from the design, carousels (mask them), cached CSS (clear cache)|Copy static components into the classic theme skeleton: `templates/` (Smarty `.tpl`), `assets/css`; add overrides in `prestashop-overrides.css`|
|WordPress|Admin bar when logged in (use a logged-out context), cookie banners, theme/plugin CSS leaking in, `wp_head` extra styles, default `body` margins|Convert HTML → `header.php`, `footer.php`, `index.php`, `single.php`, `page.php` + template parts; enqueue the generated `styles.css` via `wp_enqueue_style` (§3); CMS-only overrides in `wp-overrides.css`|
|React|Hydration delay (wait for a root selector, not only `networkidle`), CSS-in-JS ordering|Import the same CSS; keep component CSS self-contained|

Tips:

- Add `mask` entries for banners and widgets that aren't in the design.
- Make the **approved static HTML screenshots your baselines** (§19). Comparing the ported theme against both the static build and the design isolates "porting bugs" from "design bugs".
- CMS-generated markup (PrestaShop modules, Gutenberg blocks, plugin widgets) outputs its own HTML — style it with targeted overrides rather than fighting the markup.
- Your static components are ~80 % of the work; the remaining ~20 % is overriding CMS markup. Budget for it, then re-run the regression suite against the **live CMS pages**, not just static HTML.

---

## 22. CI

Rendering differs between operating systems, so run the check in the same Playwright Docker image everywhere:

```bash
docker run --rm -v "$PWD":/work -w /work -p 5173:5173 \
  mcr.microsoft.com/playwright:v1.49.0-jammy \
  bash -c "npm ci && (npx serve src -l 5173 &) && sleep 2 && npm run visual"
```

Match the image tag to the Playwright version in `package.json`. Commit `design/`; do not commit `visual-output/` or the generated `src/css/styles.css` (add both to `.gitignore`, and let CI run `npm run css`).

---

## 23. Troubleshooting

|Symptom|Likely cause|Fix|
|---|---|---|
|Size mismatch, magenta band at bottom|Page taller/shorter than design|Fix spacing; check section heights with DevTools|
|100 % of pixels differ|Design exported at 2x, or wrong width|Check the PNG dimensions vs the viewport|
|Whole image slightly off in colour|Colour profile not sRGB|Re-export with _Convert to sRGB_, no embedded profile|
|Whole page wrong after adding Bootstrap/Tailwind|Two resets (library + `base.css`) or library defaults|Settle on one reset and map the library theme to tokens (§7), then re-baseline|
|Text always red despite right values|Font fallback or wrong weight|Confirm font loaded (Network tab), match weight|
|Different result each run|Animations, lazy images, carousels|Keep the animation kill-switch, scroll pass, and `mask`|
|Different result on CI vs laptop|Different OS/font rendering|Run both in the same Docker image|
|Everything below a point is red|Cumulative vertical offset from one earlier element|Fix the first red region, rerun|
|Sticky header repeated in full-page shot|Fixed/sticky elements with `fullPage`|Set `position: static` for the test via `addStyleTag`, or use section shots|

---

## 24. Tooling summary

|Task|Tool|
|---|---|
|Design → tokens|Figma Dev Mode, Tokens Studio, Style Dictionary; Photoshop Copy CSS, `ag-psd`, `psd.js`|
|Local dev server|`serve` / vite / live-server / 11ty|
|Design vs build diff|`compare.mjs` + `pngjs` + `pixelmatch`|
|Regression baselines|Playwright `toHaveScreenshot`|
|Hosted visual diff|Chromatic / Percy / Applitools Eyes|
|Manual overlay|PerfectPixel (Chrome) — development sanity check only; set ~50 % opacity and toggle, don't align borders|
|Token linting|Stylelint + `stylelint-declaration-strict-value`|
|Accessibility|axe (`@axe-core/playwright`, axe DevTools), Lighthouse|
|Cross-browser|Playwright multi-browser / BrowserStack|

---

## 25. Checklist

**Before starting**

- [ ] Design source quality checked (one artboard/frame per viewport? hover states available?)
- [ ] Tokens extracted → `tokens.css`; assets exported → `img/` (SVG for icons/logos)
- [ ] `DESIGN-NOTES.md` written (breakpoints, ambiguities, missing states)
- [ ] PNG exports at 1x, sRGB, named `<page>-<viewport>.png`

**While building**

- [ ] One section at a time: structure → layout → polish
- [ ] `npm run visual`, read the diff image, fix the top-most red region first
- [ ] Verify key measurements in DevTools; components use tokens, not raw values

**Before sign-off (per page, per breakpoint 375 / 768 / 1440)**

- [ ] Screenshot diff passes at chosen tolerance, no visible red blocks
- [ ] Hover/focus/menu/disabled states checked
- [ ] In-between widths checked manually (320 → 1920); no horizontal overflow
- [ ] Contrast AA, keyboard nav and axe pass; Lighthouse has no errors
- [ ] Cross-browser spot check (Chromium / Firefox / WebKit)
- [ ] Baselines frozen with `toHaveScreenshot`

**When porting (WordPress / PrestaShop / React)**

- [ ] Same script, new `baseUrl`; CMS-specific gotchas masked
- [ ] CMS-generated markup styled with dedicated overrides
- [ ] Regression re-run against the live CMS pages

---

## Resolved decisions

Recorded so future edits don't reintroduce the old contradictions:

- **Comparison exports are 1x** (matching `deviceScaleFactor: 1`); only *assets* may be exported at 2× for retina.
- **Spacing uses a 4px base** whose larger steps land on an 8px rhythm — one scale, not competing "4px grid" and "8pt grid" systems.
- **Three distinct sources of truth:** the design file (what to match), the approved static build (snapshot baselines), and tokens (system values). They are not interchangeable.
- **`toHaveScreenshot` baselines are your own earlier screenshots**, never the design export; `compare.mjs` is the design-diff tool.
- **PrestaShop templates are Smarty `.tpl`** (not Twig); WordPress is PHP.
- **axe is an external library** (`@axe-core/playwright`), not a built-in Playwright matcher.
- One consolidated note replaces the four duplicate drafts; no version line is kept, since this vault tracks changes in git.
