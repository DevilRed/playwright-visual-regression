# Visual Regression Testing with Playwright

Docker-based visual regression testing scaffold using [Playwright](https://playwright.dev/). Designed to be portable across projects.

## Prerequisites

- Docker & Docker Compose
- Make

## Quick Start

```bash
make up        # Start the Playwright container
make install   # Install dependencies inside the container
make test      # Run all tests
make report    # View the HTML report at http://localhost:9323
```

## Available Commands

| Command | Description |
|---|---|
| `make up` | Start the container in detached mode |
| `make down` | Stop and remove the container |
| `make restart` | Restart the container |
| `make build` | Rebuild the container image |
| `make ps` | Check container status |
| `make install` | Install npm dependencies |
| `make test` | Run all tests (auto-installs if needed) |
| `make report` | Serve the HTML report on port 9323 |

## Project Structure

```
├── docker-compose.yml      # Playwright container definition
├── Makefile                # Convenience commands
├── playwright.config.js    # Playwright configuration
├── package.json            # Dependencies
├── tests/
│   ├── homepage.spec.js    # Homepage tests
│   ├── product.spec.js     # Product page tests
│   └── ...
└── tests/
    └── visual/             # Visual regression snapshots (auto-generated)
```

## Writing Tests

### Basic Test

```js
import { test, expect } from '@playwright/test';

test('homepage loads correctly', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await expect(page).toHaveTitle(/My Site/);
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
});
```

### Visual Regression Test (Screenshot Comparison)

```js
test('homepage visual regression', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await expect(page).toHaveScreenshot('homepage.png', {
    maxDiffPixelRatio: 0.01,
  });
});
```

The first run generates the baseline screenshot. Subsequent runs compare against it and fail if the difference exceeds the threshold.

### Testing a Specific Element

```js
test('header visual regression', async ({ page }) => {
  await page.goto('http://localhost:8080');
  const header = page.locator('header');
  await expect(header).toHaveScreenshot('header.png');
});
```

### Testing a Full Page

```js
test('full page visual regression', async ({ page }) => {
  await page.goto('http://localhost:8080');
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
    await page.goto('http://localhost:8080');
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
    await page.goto('http://localhost:8080/product/sample-product');
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

## PrestaShop Theme Development

When testing a PrestaShop theme, your site runs on a separate container or local server. Point Playwright at it using `baseURL`.

### Update `playwright.config.js`

```js
export default defineConfig({
  // ...
  use: {
    baseURL: 'http://prestashop',  // Docker service name or localhost with port
    trace: 'on-first-retry',
  },
});
```

### Add PrestaShop to `docker-compose.yml`

```yaml
services:
  playwright:
    image: mcr.microsoft.com/playwright:v1.60.0-jammy
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
    image: prestashop/prestashop:8.1.7
    ports:
      - "8080:80"
    environment:
      PS_DOMAIN: localhost:8080
      PS_FOLDER_ADMIN: admin1
      ADMIN_MAIL: admin@example.com
      ADMIN_PASSWD: admin123
    networks:
      - prestashop-net

networks:
  prestashop-net:
```

### PrestaShop Test Examples

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

### Using `page.waitForLoadState` for PrestaShop

PrestaShop pages often load content asynchronously. Wait for the page to be fully loaded before taking screenshots:

```js
test('category page fully loaded', async ({ page }) => {
  await page.goto('/en/3-women');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('ps-category.png', { fullPage: true });
});
```

## Avoiding False Positives

False positives are the biggest threat to visual regression test adoption. Here is how to minimize them.

### 1. Ignore Dynamic Content

Elements like timestamps, random ads, or counters change on every load. Hide them before taking screenshots:

```js
test('homepage ignores dynamic content', async ({ page }) => {
  await page.goto('/');
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
await page.goto('/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.fonts.ready);
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

Always run tests inside the same Docker image. This eliminates OS-level font and rendering differences. This project already does this via `docker-compose.yml`.

### 8. Update Baselines Intentionally

When you make a deliberate visual change, update the baselines:

```bash
docker compose exec playwright npx playwright test --update-snapshots
```

Review the diff before committing updated snapshots. Never blindly update all baselines.

## Recommendations

1. **Start small.** Test the most critical pages first (homepage, product page, checkout). Add more over time.
2. **Screenshot components, not just pages.** Testing individual sections (header, footer, product card) makes failures easier to diagnose.
3. **Combine visual and functional tests.** Use visual regression for layout/CSS and standard assertions for behavior (clicks, navigation, form submissions).
4. **Use `test.describe` to group related tests.** It keeps output readable and allows shared `beforeEach` setup.
5. **Run tests in CI.** Add to your pipeline so regressions are caught before merge. The Docker setup makes this trivial since the environment is reproducible.
6. **Keep baselines in version control.** The snapshot images in `tests/` should be committed so the whole team shares the same reference.
7. **Review snapshot diffs in PRs.** Treat visual diffs like code diffs. Require approval for baseline updates.

## Updating the Playwright Version

1. Update the image tag in `docker-compose.yml`:
   ```yaml
   image: mcr.microsoft.com/playwright:v1.XX.0-jammy
   ```
2. Update the dependency in `package.json`:
   ```json
   "@playwright/test": "^1.XX.0"
   ```
3. Rebuild:
   ```bash
   make down && make up && make install
   ```
