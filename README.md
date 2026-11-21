# Visual Regression Testing with Playwright

Docker-based visual regression testing scaffold using [Playwright](https://playwright.dev/). Designed to be portable across projects.

## Prerequisites

- Docker with the `docker compose` plugin
- Make

The Playwright dependency and browsers run inside the Docker container; Node.js is not required on the host.

## Quick Start

```bash
make up        # Start the Playwright container
make install   # Install dependencies inside the container
make test      # Install dependencies and run all tests
make report    # View the HTML report at http://localhost:9323
```

`make test` depends on `make install`, so it runs `npm install` before each test run. The report command serves the most recent report in the foreground; stop it with Ctrl+C.

if you're running tests frequently,  run `make install` once and then run `docker compose exec playwright npx playwright test` directly

## Available Commands

| Command | Description |
|---|---|
| `make up` | Start the container in detached mode |
| `make down` | Stop and remove the container |
| `make restart` | Restart the container |
| `make build` | Run `docker compose build`; currently no service has a local build context because Playwright uses a prebuilt image |
| `make ps` | Check container status |
| `make install` | Install npm dependencies |
| `make test` | Install npm dependencies and run all tests |
| `make report` | Serve the HTML report on port 9323 |

## Worked Example: Testing an HTML/CSS Template

The repository includes a self-contained example that needs no external site:

- `demo/index.html` and `demo/styles.css` — a responsive template (header, hero, metrics, card grid, footer) with no JS, remote fonts or external assets.
- `tests/template-demo.spec.js` — the specs for that template.
- `playwright.config.js` — `baseURL: http://localhost:8080` plus a `webServer` that runs `python3 -m http.server 8080 --directory demo`. Playwright starts and stops the server for you; no extra terminal is needed.

Run only this example:

```bash
docker compose exec playwright npx playwright test tests/template-demo.spec.js --reporter=line
```

### Viewing the template in a browser while you debug

The config's `webServer` only runs during a test run and is bound inside the container, so its port is not reachable from your host browser. To inspect the page while editing CSS, use one of these:

- **Fastest, no server:** open `demo/index.html` directly in your browser — for example `xdg-open /var/www/html/CSS/testing/demo/index.html` on Linux. The relative `styles.css` link resolves from `file://`, so you get the fully styled page.
- **Served over HTTP, matching Playwright:** from the repository root, run `python3 -m http.server 8080 --directory demo`, then open http://localhost:8080. Stop it with Ctrl+C. Reload after each CSS edit.

Use your browser's responsive/device toolbar to eyeball 375 px, 768 px and 1440 px — those are the exact widths the specs lock. When a screenshot test fails, use `make report` (http://localhost:9323) to compare Expected / Actual / Diff, iterate on the live page, then rerun the scoped test against the baseline.

If you want the page served from the container itself, add `8080:8080` to the ports in `docker-compose.yml`, recreate the container with `make down && make up`, then run:

```bash
docker compose exec playwright python3 -m http.server 8080 --directory demo --bind 0.0.0.0
```

and open http://localhost:8080.

What it demonstrates:

- **Three fixed breakpoints** — mobile 375×812, tablet 768×1024, desktop 1440×900 — set with `test.use({ viewport })` inside a `test.describe`. This locks the layout without adding browser projects, so the existing smoke tests are unaffected.
- **Component screenshots** — `header-<breakpoint>.png`, `card-grid-<breakpoint>.png` and `footer-<breakpoint>.png`, captured from `getByTestId(...)` locators with `animations: 'disabled'` and `maxDiffPixelRatio: 0.01`. Section-level shots are easier to diagnose than one full-page image: a 4 px header shift no longer turns the whole page red.
- **Layout assertions** — no horizontal overflow (`scrollWidth <= clientWidth`) and the card grid really reflows from one column on mobile to two on tablet and three on desktop.

Create the baselines explicitly on the first run — in Playwright 1.60 a missing snapshot **fails** rather than silently creating one:

```bash
docker compose exec playwright npx playwright test tests/template-demo.spec.js --update-snapshots
```

That writes 27 images into `tests/template-demo.spec.js-snapshots/` (one per breakpoint, component and browser, for example `header-mobile-chromium-linux.png`). Review and commit them. Every later run compares against them. Each browser gets its own baseline because font and subpixel rendering differ, even inside the same Docker image.

To adapt this to your own template:

1. Change `webServer.command` and `baseURL` in `playwright.config.js` to serve your template. If your server already runs, remove `webServer` and just set `baseURL`.
2. Add stable `data-testid` attributes to the sections you want to check.
3. Copy the spec pattern: one `describe` per breakpoint, one screenshot per section, plus a few layout assertions.
4. Keep captured areas deterministic — no animations, timestamps, carousels or lazy images — and wait for `document.fonts.ready` before screenshots.
5. Generate the baselines once, review them, then commit them.

## When a Test Fails

There are two different failures and they need different triage.

### A functional or layout assertion failed

1. The line reporter prints the failing locator and expected/received values. Re-run a narrow slice while iterating:

   ```bash
   docker compose exec playwright npx playwright test tests/template-demo.spec.js --project=chromium -g "mobile" --reporter=line
   docker compose exec playwright npx playwright test --last-failed
   ```

2. `make report` opens the HTML report at http://localhost:9323 with the error, call log and failure screenshot.
3. Traces: the config uses `trace: 'on-first-retry'`. Locally `retries: 0`, so the first failure records no trace. Force one when you need it:

   ```bash
   docker compose exec playwright npx playwright test tests/template-demo.spec.js --trace retain-on-failure --reporter=line
   ```

   On CI, `retries: 2` means the first retry already has a trace. Open it from the HTML report (`make report`): the failing test has a **Trace** attachment that opens the viewer in your browser on port 9323. If you run Playwright directly on the host, `npx playwright show-trace test-results/<test-directory>/trace.zip` also works — inside the container the viewer's URL is not published to the host, so prefer the report.
4. Fix the cause instead of weakening the assertion. Use `-g`, `--project` and `--last-failed` to keep the loop short.

### A screenshot comparison failed

1. Open the HTML report and look at **Expected / Actual / Diff**; the same three images are also under `test-results/`. Read the diff image first, not the mismatch percentage — a small percentage can hide a missing icon.
2. Decide which image is wrong:
   - **Unexpected change** (spacing drift, wrong color, broken breakpoint): fix the CSS and rerun. Work top to bottom — a shifted header moves everything below it, so fix the first red region first.
   - **Intentional change**: review the new actual image, then approve only the affected baseline:

     ```bash
     docker compose exec playwright npx playwright test tests/template-demo.spec.js --project=chromium -g "card-grid-mobile" --update-snapshots
     ```

     Rerun without the flag afterwards and inspect the image diff in git before committing. A blanket `--update-snapshots` across all browsers rewrites the reference for every rendering engine and hides real regressions.

These baselines are screenshots of **your own approved build**, not exports of a PSD/Figma design. Comparing a build against a design file is a separate job described in `css-development.md` (§2 and §12). This suite only tells you what changed since the last approval.

| Symptom | Likely cause | Fix |
|---|---|---|
| A whole image is red | Wrong viewport/scale, or a baseline from a different browser | Check the file name against the project and breakpoint; never reuse a Chromium baseline for WebKit |
| Text is red across the shot | Font fallback or different weight | Use system/self-hosted fonts and wait for `document.fonts.ready` |
| Everything below one point shifted | One earlier spacing or height change | Fix the topmost red region, then rerun |
| CSS changed but the test still passed | The change affected fewer pixels than `maxDiffPixelRatio` (1%) | Tighten the threshold for that shot, or add a layout assertion for the property you care about |
| Diff changes between runs | Animations, transitions or dynamic content | `animations: 'disabled'`, remove timers/counters, keep viewports fixed |
| Green locally, red in CI | Different OS/font rendering | Run both in the same Docker image; commit baselines generated in that image |

## Changing the Template Without Breaking Other Sections

Use this loop for any feature request or bug fix. The goal is to know **before** you approve a baseline which sections and viewports are supposed to change.

1. **Start green.** `docker compose exec playwright npx playwright test --reporter=line`. Do not begin on a red suite — you would not be able to tell which failures are yours.
2. **Map the change to tests.** Write down which sections and breakpoints it can touch (table below). If the requirement is about *presence or visibility* rather than appearance, add an assertion — screenshots alone will not notice a hidden section.
3. **Add or change the assertion first** and run it narrowly, expecting red:

   ```bash
   docker compose exec playwright npx playwright test tests/template-demo.spec.js --project=chromium -g "hero" --reporter=line
   ```

4. **Implement the smallest change** that makes it pass. Keep CSS scoped to the component, not global overrides.
5. **Run the whole spec in one browser** (`--project=chromium`) to see exactly which screenshots changed. Expected diffs equal the sections from step 2; anything else is a regression.
6. **Approve only intentional image changes** with a scoped `--update-snapshots`, then run the **full suite in all three browsers**.
7. **Review the commit.** Code and approved baselines go together; inspect the image diffs, not just `git diff --stat`.

### Scenario 1: hide the hero on mobile

Requirement: the hero must not be shown below 768 px, but stays visible on tablet and desktop.

There is currently no screenshot of `hero`, so hiding it would not fail anything — screenshots only see the sections they capture. Add a visibility assertion in each breakpoint describe:

```js
// mobile describe
test('hero is hidden - mobile', async ({ page }) => {
  await expect(page.getByTestId('hero')).toBeHidden();
});

// tablet and desktop describes
test(`hero is visible - ${name}`, async ({ page }) => {
  await expect(page.getByTestId('hero')).toBeVisible();
});
```

Then hide the section for narrow widths in `demo/styles.css`, for example `@media (max-width: 767px) { section[data-testid="hero"] { display: none; } }`.

Expected impact:

- Header: no change.
- Card grid and footer element screenshots: normally **no change** — an element shot captures that element, not the content that moved above it. This is the main benefit of section-level shots.
- Layout assertions: still pass; the grid remains one column and the page still fits.
- **No baseline updates needed.** A full-page screenshot would change on mobile; add one only as a final acceptance check (css-development.md §14), not as the primary diagnostic.

Tip: put a tag such as `@hero` in feature-specific test titles so `-g @hero` runs just that scenario.

### Scenario 2: add a "Sales" link to the menu

Requirement: a fifth nav item in the header at every breakpoint.

1. Add the assertion before touching the markup. Scope it to the header so a same-named footer link cannot cause a strict-mode violation:

   ```js
   test(`Sales link is in the header - ${name}`, async ({ page }) => {
     await expect(
       page.getByTestId('site-header').getByRole('link', { name: 'Sales' }),
     ).toBeVisible();
   });
   ```

2. Add `<a href="#">Sales</a>` to the `<nav>` in `demo/index.html`.
3. Run `--project=chromium`. The new assertion passes, but `header-*.png` fails at all three breakpoints because the nav is wider (and wraps on mobile). `no horizontal overflow - mobile` is the other check to watch: five links must still fit at 375 px.
4. Inspect the three header diffs in the report. If the only change is the added link, approve just those baselines:

   ```bash
   docker compose exec playwright npx playwright test tests/template-demo.spec.js --project=chromium -g "header screenshot" --update-snapshots
   ```

5. Repeat for `firefox` and `webkit` (each browser has its own baseline), then run the full suite.

### Change → affected checks

| Change | Likely affected checks | Baseline action |
|---|---|---|
| Hide/show a section (hero) | Visibility assertion; any screenshot of that section; a full-page shot | Add assertion; section baselines of *other* components stay unchanged |
| Add or rename a nav item | Header screenshots at every breakpoint; mobile overflow; scoped link assertion | Approve header baselines per browser |
| Color or spacing token change | Many section screenshots, plus layout assertions | Approve deliberately; small deltas may pass under the 1% tolerance |
| New component | New `getByTestId` screenshot and layout assertion | Generate one baseline per browser and breakpoint |
| New breakpoint | New entry in `viewports` | Generate its baselines; check overflow and columns |
| Bug fix in CSS | Diff of the affected section; check neighbours for unexpected shifts | Approve only if the diff matches the fix |

### Guardrails

- One logical change at a time; do not mix a bug fix with a refactor.
- Never run a blanket `--update-snapshots` just to get green — scope it with `-g` and `--project`.
- Keep `data-testid` values stable; rename them only together with the tests, in the same commit.
- Scope role locators to a section (`getByTestId('site-header').getByRole(...)`) when the nav and footer share link names.
- Add an assertion for behaviour (visible/hidden, link present, column count). Screenshots prove appearance, not semantics.
- If an intentional change still passes, the delta was under the tolerance — tighten that shot's threshold or add a layout assertion.
- Run in the same Docker image everywhere and commit baselines generated in that image.
- When CI fails but local passes: use `--last-failed`, verify the committed baselines, then inspect the trace from the HTML report.

## Reusing This Setup in Another Project

Only three things are project-specific: **where the page is served**, **which selectors you assert**, and **which screenshots you compare**. Docker, browsers, retries, reporting and the failure workflow stay the same.

1. **Point at the site.** Set `baseURL` in `playwright.config.js`. If Playwright should start the site, set `webServer.command` and `webServer.url`; otherwise delete `webServer`. Keep `reuseExistingServer: !process.env.CI`.
2. **Swap the hooks.** Keep the skeleton from `tests/template-demo.spec.js` — a describe per breakpoint, `beforeEach` navigation, `getByTestId`/role locators, section screenshots, overflow/column assertions — but target your theme's containers. Adding `data-testid` to your templates is more reliable than `div > div:nth-child(2)`.
3. **Start with fresh baselines.** Remove the demo snapshots (or keep the demo as a separate, clearly named spec) and generate your own:

   ```bash
   docker compose exec playwright npx playwright test --update-snapshots
   ```

   Review and commit them per browser. Never reuse a baseline captured with a different rendering engine.
4. **Decide what stays.** Keep `tests/example.spec.js` as a connectivity smoke test or delete it; keep the demo spec as a training example or remove it. The config only needs `testDir` and the specs you actually run.

| Target | `baseURL` / server | What to watch |
|---|---|---|
| PrestaShop theme | Shared Docker network, `baseURL: http://prestashop` (service name); or `http://host.docker.internal:8080` with `extra_hosts` on Linux | Disable the debug toolbar and cookie/GDPR modules for screenshots; add `data-testid` in `.tpl` files; mask carousels and dynamic product blocks; wait for `#js-product-list` rather than using `networkidle` |
| WordPress theme | Shared network, `baseURL: http://wordpress:8080`; for a static build, serve compiled output with `webServer` | Use a logged-out context so the admin bar does not appear; enqueue one compiled stylesheet; hide cookie banners; override CMS-generated markup with dedicated CSS |
| React/SPA or custom app | `webServer` starts the dev server or serves built files; `baseURL` points to it | Wait for a root/testid selector after hydration instead of `networkidle`; mock APIs with `page.route()`; keep viewports fixed and animations off |

Inside the container, `localhost` means the Playwright container itself — use a service name on a shared Docker network or `host.docker.internal` for a server on the host. The "PrestaShop Theme Development or Adapting to Other Projects" and "Migrating This Scaffold to a New Project" sections below have full Compose/network examples; `css-development.md` §21 covers platform-specific porting.

To keep the suite portable:

- Match the Playwright image tag in `docker-compose.yml` to `@playwright/test` in `package.json`, and use the same image locally and in CI.
- Store baselines next to their spec, commit them, and generate them inside this Docker image.
- Add a `BASE_URL` environment override in the config if one suite must run against several environments; keep secrets out of the repo.
- Treat the suite as regression protection for **your approved build**. Comparing a build against a PSD/Figma design is a separate job (css-development.md §2 and §12).

## Project Structure

```
├── AGENTS.md               # Guidance for coding agents
├── css-development.md      # Design-to-code and visual QA workflow notes
├── demo/
│   ├── index.html          # Responsive HTML/CSS template used by the worked example
│   └── styles.css          # Styles for the demo template
├── docker-compose.yml      # Playwright container definition
├── index.html              # Minimal local static HTML page; not automatically served
├── Makefile                # Convenience commands
├── package.json            # Playwright dependency
├── package-lock.json       # Locked npm dependency versions
├── playwright.config.js    # Playwright configuration
├── tests/
│   ├── example.spec.js     # Smoke tests for playwright.dev
│   └── template-demo.spec.js # Responsive template example (screenshots + layout assertions)
├── playwright-report/      # Generated HTML report (gitignored)
└── test-results/           # Generated run artifacts (gitignored)
```

Screenshot baselines are stored next to the spec that creates them, in a generated directory such as `tests/template-demo.spec.js-snapshots/`. Add specs under `tests/`; organize them by page or feature as the suite grows.

The suite contains the two smoke tests in `tests/example.spec.js` plus the responsive-template example in `tests/template-demo.spec.js`. The root `index.html` is still a scratch page and is not served or tested. By default, Playwright runs each spec in Chromium, Firefox, and WebKit. When `CI` is set, the config disallows focused-only tests, retries failures twice, and uses one worker.

## Writing Tests

### Basic Test

```js
import { test, expect } from '@playwright/test';

test('homepage loads correctly', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/My Site/);
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
});
```

Configure `baseURL` in `playwright.config.js` to use relative URLs such as `/`:

```js
use: {
  baseURL: 'http://localhost:8080',
  trace: 'on-first-retry',
},
```

The config currently has `baseURL` commented out. Without setting it, tests must navigate to an absolute URL, as the existing example test does for `https://playwright.dev/`.

### Visual Regression Test (Screenshot Comparison)

```js
test('homepage visual regression', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('homepage.png', {
    maxDiffPixelRatio: 0.01,
  });
});
```

A missing baseline fails the test in Playwright 1.60. Create it with `--update-snapshots`, then later runs compare against it and fail if the difference exceeds the threshold.

### Testing a Specific Element

```js
test('header visual regression', async ({ page }) => {
  await page.goto('/');
  const header = page.locator('header');
  await expect(header).toHaveScreenshot('header.png');
});
```

### Testing a Full Page

```js
test('full page visual regression', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('fullpage.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.02,
  });
});
```

## Structuring Tests by Page

Organize tests by page or feature, not by browser. Playwright already runs each test across all configured browsers via `projects` in `playwright.config.js`.

```
tests/
├── homepage.spec.js
├── product-listing.spec.js
├── product-detail.spec.js
├── cart.spec.js
├── checkout.spec.js
└── account.spec.js
```

### Example: `tests/homepage.spec.js`

```js
import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('has correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/My Store/);
  });

  test('hero banner renders correctly', async ({ page }) => {
    await expect(page.locator('.hero-banner')).toHaveScreenshot('hero-banner.png');
  });

  test('navigation renders correctly', async ({ page }) => {
    await expect(page.locator('nav')).toHaveScreenshot('navigation.png');
  });

  test('footer renders correctly', async ({ page }) => {
    await expect(page.locator('footer')).toHaveScreenshot('footer.png');
  });
});
```

### Example: `tests/product-detail.spec.js`

```js
import { test, expect } from '@playwright/test';

test.describe('Product Detail Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/product/sample-product');
  });

  test('product image gallery renders correctly', async ({ page }) => {
    await expect(page.locator('.product-images')).toHaveScreenshot('product-gallery.png');
  });

  test('add to cart button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /add to cart/i })).toBeVisible();
  });

  test('price displays correctly', async ({ page }) => {
    await expect(page.locator('.product-price')).not.toBeEmpty();
  });
});
```

## PrestaShop Theme Development or Adapting to Other Projects

When testing a PrestaShop theme, your site runs on a separate container or local server. Point Playwright at it using `baseURL`.

### Update `playwright.config.js`

```js
export default defineConfig({
  // ...
  use: {
    baseURL: 'http://prestashop', // Docker service name on a shared network
    trace: 'on-first-retry',
  },
});
```

If PrestaShop runs directly on the host, the Playwright container can typically reach it at `http://host.docker.internal:8080`. On Linux, add this to the Playwright service if that hostname is not available:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

`http://localhost:8080` is appropriate when Playwright runs directly on the host; inside the Playwright container, `localhost` refers to that container, not the host.

### Connect the containers

If PrestaShop already runs in Docker, attach both services to the same network and use the PrestaShop service name in `baseURL`. Add the network to the existing Compose configuration; the PrestaShop service also needs its usual database and installation configuration, which are not included here.

```yaml
services:
  playwright:
    image: mcr.microsoft.com/playwright:v1.60.0-jammy
    # Required for Chromium shared memory in Docker; avoids /dev/shm exhaustion
    ipc: host
    ports:
      - "9323:9323"
    volumes:
      - .:/work
    working_dir: /work
    command: tail -f /dev/null
    networks:
      - prestashop-net

  prestashop:
    # Keep the image, database, and environment from your existing setup.
    networks:
      - prestashop-net

networks:
  prestashop-net:
```

Do not commit real store credentials. Keep local secrets in an ignored environment file or your deployment's secret manager.

### PrestaShop Test Examples
Create specs under tests/ for pages or components you want to check—for example, the homepage, product listing, etc.
```js
// tests/prestashop/homepage.spec.js
import { test, expect } from '@playwright/test';

test.describe('PrestaShop Homepage', () => {
  test('homepage visual regression', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveScreenshot('ps-homepage.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test('header with logo and cart', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#header')).toHaveScreenshot('ps-header.png');
  });

  test('featured products section', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.featured-products')).toHaveScreenshot('ps-featured.png');
  });
});
```

```js
// tests/prestashop/category.spec.js
import { test, expect } from '@playwright/test';

test.describe('Category Page', () => {
  test('product listing layout', async ({ page }) => {
    await page.goto('/en/3-women');
    await expect(page.locator('#js-product-list')).toHaveScreenshot('ps-product-list.png');
  });

  test('filters sidebar', async ({ page }) => {
    await page.goto('/en/3-women');
    await expect(page.locator('#search_filters')).toHaveScreenshot('ps-filters.png');
  });
});
```

#### Waiting for PrestaShop content

Pages may load content asynchronously. Wait for the content being tested rather than relying on `networkidle`, which may not occur on pages with ongoing network activity:

```js
test('category page fully loaded', async ({ page }) => {
  await page.goto('/en/3-women');
  await expect(page.locator('#js-product-list')).toBeVisible();
  await expect(page).toHaveScreenshot('ps-category.png', { fullPage: true });
});
```
### If your app is Node-served (or you want Playwright to start it)
```js
webServer: {
  command: 'npm run start',
  url: 'http://localhost:8080',
  reuseExistingServer: !process.env.CI,
},
```

## Migrating This Scaffold to a New Project
1. Copy the scaffold, excluding node_modules/, playwright-report/, test-results/, tests/*-snapshots/, tests/.auth/.
2. Set baseURL in playwright.config.js (or via BASE_URL env var — add this and document it).
3. Replace tests/example.spec.js.
4. Delete inherited baseline snapshots.
5. Verify .gitignore covers the generated dirs.
6. Confirm @playwright/test and the image tag match.


This scaffold is designed to be portable. Follow these steps to adapt it for WordPress theme development, PrestaShop, or any custom web project.
1. Porting the Scaffold
Copy the core configuration files into the root of your target project:

    * docker-compose.yml
    * Makefile
    * playwright.config.js
    * package.json
    * tests/ directory

2. Docker Network Integration
Ensure the Playwright container can communicate with your application container. Update docker-compose.yml to attach the playwright service to your application's existing Docker network.
Example for a WordPress Docker setup:

```yaml
services:
  playwright:
    image: mcr.microsoft.com/playwright:v1.60.0-jammy # Update to match package.json
    ipc: host
    ports:
      - "9323:9323"
    volumes:
      - .:/work
    working_dir: /work
    command: tail -f /dev/null
    networks:
      - wp_local_network # Match the network of your WordPress container

networks:
  wp_local_network:
    external: true # Or define it in the same compose file
```


3. Environment Configuration
Create a .env file in the project root to manage environment-specific variables without hardcoding them:

```env
BASE_URL=http://wordpress:8080
ADMIN_USER=admin
ADMIN_PASSWORD=password
CI=false
```

Update playwright.config.js to read these variables:

```js
export default defineConfig({
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8080',
    trace: 'on-first-retry',
  },
});
```
4. Scenario-Specific Adaptations
🎨 WordPress Theme Development

    **Test Data Seeding**: Use beforeAll hooks to trigger wp-cli commands inside the WordPress container to create test posts, users, or activate the theme before running tests.
    **Admin Testing**: Test theme customizer settings, widget placements, or block editor (Gutenberg) outputs.

    ```js
    test('dashboard loads successfully', async ({ page }) => {
      await page.goto('/wp-admin/');
      await expect(page).toHaveTitle(/Dashboard ‹ .* — WordPress/);
      await expect(page.locator('#wpadminbar')).toBeVisible();
    });
    ```

    **Responsive Testing**: Add explicit viewport projects in _playwright.config.js_ to test theme responsiveness across mobile, tablet, and desktop.

🛒 PrestaShop / E-commerce

    **Checkout Flows**: Test the entire user journey: add to cart, guest checkout, and payment gateway redirections (mock external payment APIs if needed).
    **Data Attributes**: Add data-testid attributes to critical PrestaShop theme templates (e.g., product price, "Add to Cart" button) to make selectors resilient to DOM changes.
    **Database Cleanup**: Use a globalTeardown script to clean up test orders and customers from the database after the test suite completes.

    ```js
    test('product listing layout', async ({ page }) => {
      await page.goto('/en/3-women');
      await expect(page.locator('#js-product-list')).toBeVisible();
      await expect(page).toHaveScreenshot('ps-product-list.png');
    });
    ```

⚙️ General Custom Web Applications

    **API Mocking**: Use page.route() to mock backend API responses, allowing you to test frontend edge cases (e.g., empty states, error messages) without relying on a real, mutable backend.
    **Authentication State**: Reuse saved login states (cookies/local storage) to bypass repetitive login flows for protected areas. Generate the state once and load it via storageState in playwright.config.js.

5. Host vs. Container URL Guidance
If your application runs directly on the host machine (not in Docker), the Playwright container can reach it at http://host.docker.internal:8080. On Linux, you may need to add this to the Playwright service in docker-compose.yml:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

Note: http://localhost:8080 is appropriate when Playwright runs directly on the host. Inside the Playwright container, localhost refers to that container, not the host.


## Avoiding False Positives

False positives are the biggest threat to visual regression test adoption. Here is how to minimize them.

### 1. Ignore Dynamic Content

False positives are the biggest threat to visual regression test adoption. Here is how to minimize them.
Elements like timestamps, random ads, or counters change on every load. Hide them before taking screenshots:

```js
test('homepage ignores dynamic content', async ({ page }) => {
  await page.goto('/');
  // hidding them
  await page.locator('.timestamp, .ad-banner, .visitor-counter').evaluateAll(
    (els) => els.forEach(el => el.style.visibility = 'hidden')
  );

  await expect(page).toHaveScreenshot('homepage.png');
});
```

Or use Playwright's built-in masking:

```js
await expect(page).toHaveScreenshot('homepage.png', {
  mask: [
    page.locator('.timestamp'),
    page.locator('.ad-banner'),
    page.locator('.visitor-counter'),
  ],
});
```

### 2. Disable Animations and Transitions

CSS animations cause pixel-level differences between runs:

```js
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `,
  });
});
```

### 3. Set Fixed Viewport Sizes

Different viewport sizes produce different layouts. Lock the viewport:

```js
// playwright.config.js
export default defineConfig({
  use: {
    viewport: { width: 1280, height: 720 },
  },
});
```

Or test specific breakpoints explicitly:

```js
test.describe('Responsive breakpoints', () => {
  const viewports = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 720 },
  ];

  for (const vp of viewports) {
    test(`homepage at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await expect(page).toHaveScreenshot(`homepage-${vp.name}.png`);
    });
  }
});
```

### 4. Use `maxDiffPixelRatio` Instead of Exact Match

A small tolerance absorbs sub-pixel rendering differences across OS/browser updates:

```js
await expect(page).toHaveScreenshot('homepage.png', {
  maxDiffPixelRatio: 0.01,  // 1% tolerance
});
```

| Threshold | Use Case |
|---|---|
| `0` | Pixel-perfect (fragile, avoid in most cases) |
| `0.01` | Tight, good for component-level screenshots |
| `0.02 - 0.05` | Reasonable for full-page screenshots |
| `> 0.05` | Too loose, defeats the purpose |

### 5. Wait for Fonts and Images

Fonts loading late cause text reflow. Images loading late cause blank areas:

```js
await page.goto('/');
await page.evaluate(() => document.fonts.ready);
await expect(page).toHaveScreenshot('homepage.png');
```

### 6. Use Stable Selectors

Avoid selectors that depend on generated class names or DOM position:

```js
// Bad
await expect(page.locator('div > div:nth-child(2) > span')).toHaveScreenshot();

// Good
await expect(page.locator('[data-testid="product-price"]')).toHaveScreenshot();
```

Add `data-testid` attributes to elements you want to test:

```html
<div class="product-card" data-testid="product-card">
  <h2 data-testid="product-title">Product Name</h2>
</div>
```

### 7. Run in a Consistent Environment

Run tests inside the same Docker image to reduce OS-level font and rendering differences. This project provides that environment via `docker-compose.yml`.

### 8. Update Baselines Intentionally

When you make a deliberate visual change, update the baselines:

```bash
docker compose exec playwright npx playwright test --update-snapshots
```

Review the diff before committing updated snapshots. Never blindly update all baselines.

### Authenticated Tests
```js
// tests/auth.setup.js
import { test as setup } from '@playwright/test';
setup('authenticate', async ({ page }) => {
  await page.goto('/wp-login.php');
  await page.fill('#user_login', process.env.WP_USER);
  await page.fill('#user_pass', process.env.WP_PASS);
  await page.click('#wp-submit');
  await page.context().storageState({ path: 'tests/.auth/admin.json' });
});
```
Then reference it from projects[].use.storageState and gitignore tests/.auth/

## Recommendations

1. **Start small.** Test the most critical pages first (homepage, product page, checkout). Add more over time.
2. **Screenshot components, not just pages.** Testing individual sections (header, footer, product card) makes failures easier to diagnose.
3. **Combine visual and functional tests.** Use visual regression for layout/CSS and standard assertions for behavior (clicks, navigation, form submissions).
4. **Use `test.describe` to group related tests.** It keeps output readable and allows shared `beforeEach` setup.
5. **Run tests in CI.** Add the Docker-based commands to your pipeline so regressions are caught before merge. This repository does not currently include CI configuration.
6. **Keep baselines in version control.** The snapshot images in `tests/` should be committed so the whole team shares the same reference.
7. **Review snapshot diffs in PRs.** Treat visual diffs like code diffs. Require approval for baseline updates.

## Test Reports and Filtering

The configured reporter is HTML. Open the latest report with `make report` after running tests. To print test results and a summary in the terminal, override the reporter:

```bash
docker compose exec playwright npx playwright test --reporter=line
```

Combine terminal output with the HTML report, list tests without running them, or produce JSON output:

```bash
docker compose exec playwright npx playwright test --reporter=line,html
docker compose exec playwright npx playwright test --list
docker compose exec playwright npx playwright test --reporter=json
```

The line-only and JSON reporter commands replace the configured HTML reporter for that run. Use `--reporter=line,html` if you want both terminal output and an HTML report.

Run one spec, one browser project, or tests matching a name:

```bash
docker compose exec playwright npx playwright test tests/example.spec.js
docker compose exec playwright npx playwright test --project=chromium
docker compose exec playwright npx playwright test -g "Get started"
```

## Browser and Dependency Versions

The Docker image and `@playwright/test` version should match so the installed browser binaries match the Playwright client. Update both together and commit `package-lock.json` when dependencies change. The current image is `v1.60.0-jammy`, and the lockfile resolves `@playwright/test` to `1.60.0`.

## Updating the Playwright Version

1. Update the image tag in `docker-compose.yml`:
   ```yaml
   image: mcr.microsoft.com/playwright:v1.XX.0-jammy
   ```
2. Update the dependency in `package.json`:
   ```json
   "@playwright/test": "1.XX.0"
   ```
   Prefer an exact version so npm does not resolve a newer Playwright release than the Docker image.
3. Update and commit `package-lock.json`, then recreate the container and install dependencies:
   ```bash
   make down && make up && make install
   ```
