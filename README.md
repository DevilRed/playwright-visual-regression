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

## Project Structure

```
├── AGENTS.md               # Guidance for coding agents
├── docker-compose.yml      # Playwright container definition
├── index.html              # Minimal local static HTML page; not automatically served
├── Makefile                # Convenience commands
├── package.json            # Playwright dependency
├── package-lock.json       # Locked npm dependency versions
├── playwright.config.js    # Playwright configuration
├── tests/
│   └── example.spec.js     # Smoke tests for playwright.dev
├── playwright-report/      # Generated HTML report (gitignored)
└── test-results/           # Generated run artifacts (gitignored)
```

Screenshot baselines are stored next to the spec that creates them, in a generated directory such as `tests/example.spec.js-snapshots/`. Add specs under `tests/`; organize them by page or feature as the suite grows.

The current test suite contains only the two smoke tests in `tests/example.spec.js`; it does not yet test `index.html` or include screenshot comparisons. By default, Playwright runs each spec in Chromium, Firefox, and WebKit. When `CI` is set, the config disallows focused-only tests, retries failures twice, and uses one worker.

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

The first run generates the baseline screenshot. Subsequent runs compare against it and fail if the difference exceeds the threshold.

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
    image: mcr.microsoft.com/playwright:v1.48.0-jammy # Update to match package.json
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
