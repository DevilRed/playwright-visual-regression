# AGENTS.md

## Project Overview

This repository is a Docker-based Playwright test scaffold for functional and visual regression testing. It is intended to be portable to web projects, especially storefront or theme projects such as PrestaShop.

The Playwright runtime runs inside a Docker container, while test files remain in the repository and are mounted into `/work`.

## Repository Structure

- `tests/` - Playwright test specifications.
- `tests/example.spec.js` - Basic Playwright smoke tests against `https://playwright.dev/`.
- `playwright.config.js` - Test discovery and browser/project configuration.
- `package.json` - Playwright test dependency.
- `docker-compose.yml` - Playwright container and report port configuration.
- `Makefile` - Convenience commands for Docker and Playwright operations.
- `README.md` - Detailed setup, visual testing, and PrestaShop examples.
- `playwright-report/` - Generated HTML test report.
- `test-results/` - Generated Playwright traces, screenshots, diffs, and other run artifacts.

## Technology and Runtime

- Node.js/npm dependencies are managed inside the Playwright Docker container.
- Playwright Test is the test runner and assertion library.
- Configured desktop browser projects:
  - Chromium
  - Firefox
  - WebKit
- Tests are discovered from `./tests`.
- Tests run fully in parallel by default.
- CI runs use one worker and retry failures twice.
- CI mode is detected through the `CI` environment variable.

## Working in Docker

The authoritative Playwright environment is the Docker container defined by `docker-compose.yml`.

```bash
make up        # Start the container
make install   # Install npm dependencies
make test      # Install dependencies and run tests
make report    # Serve the HTML report on http://localhost:9323
make restart   # Restart the container
make down      # Stop and remove the container
```

For a direct Playwright command, use:

```bash
docker compose exec playwright npx playwright test
```

When changing browser versions, update both:

1. The Playwright image tag in `docker-compose.yml`.
2. `@playwright/test` in `package.json`.

Then rebuild and reinstall the environment.

## Test Conventions

- Use Playwright Test imports:

  ```js
  import { test, expect } from '@playwright/test';
  ```

- Place tests in `tests/` and use the `.spec.js` naming convention.
- Group related scenarios with `test.describe`.
- Use `test.beforeEach` for shared setup such as navigation.
- Prefer stable locators such as roles and `data-testid` attributes over DOM-position selectors.
- Use web-first assertions such as `toBeVisible`, `toHaveTitle`, and `toHaveScreenshot`.
- Do not use `test.only`; Playwright rejects it in CI.
- Keep tests independent and avoid shared mutable state.
- Test behavior with assertions and test layout/CSS with screenshots.

## Running Tests

Run the complete suite:

```bash
make test
```

Run a specific file:

```bash
docker compose exec playwright npx playwright test tests/example.spec.js
```

Run with a single browser project:

```bash
docker compose exec playwright npx playwright test --project=chromium
```

Playwright can filter tests by name:

```bash
docker compose exec playwright npx playwright test -g "Get started"
```

## Visual Regression Testing

For screenshot comparison:

```js
test('homepage visual regression', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('homepage.png', {
    maxDiffPixelRatio: 0.01,
  });
});
```

Recommended practices:

- Keep the screenshot environment identical to avoid OS and font differences.
- Lock viewport sizes or test explicit mobile/tablet/desktop viewports.
- Mask or hide timestamps, ads, counters, and other dynamic content.
- Disable animations and transitions before screenshots.
- Wait for images and fonts to finish loading.
- Use a small `maxDiffPixelRatio`, typically `0.01` for components and `0.02` to `0.05` for full pages.
- Review snapshot diffs before updating baselines.
- Commit approved baseline screenshots and generated reports should not be treated as source files.

Update all baselines intentionally:

```bash
docker compose exec playwright npx playwright test --update-snapshots
```

## Report and Artifacts

After tests finish, view the HTML report:

```bash
make report
```

The report is published at `http://localhost:9323`.

Generated directories may include failing screenshots and Playwright traces. Do not treat `playwright-report/` or `test-results/` as source-code directories unless a repository-specific workflow explicitly requires an artifact to be retained.

## Configuration Guidance

Add a base URL when tests target a fixed application:

```js
use: {
  baseURL: 'http://localhost:8080',
}
```

If a web server must start before tests, configure `webServer` in `playwright.config.js`. For PrestaShop, use the Docker service name or `localhost` with the application's published port, and keep Playwright and the application on a shared Docker network.
