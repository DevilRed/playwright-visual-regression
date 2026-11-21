// @ts-check
/**
 * template-demo.spec.js — worked example for testing an HTML/CSS template.
 *
 * Techniques here are meant to be copied into other scenarios:
 *  1. Per-describe viewport overrides instead of extra browser projects.
 *  2. A web-first readiness gate in beforeEach (navigate + visible heading).
 *  3. Await document.fonts.ready before any screenshot (no fixed waits).
 *  4. getByTestId locators + section-level screenshots with unique names,
 *     animations disabled and a small pixel tolerance.
 *  5. Structural layout assertions (bounding boxes, scrollWidth) that catch
 *     CSS regressions a screenshot tolerance can miss.
 *
 * The template lives in demo/ and is served by the webServer in playwright.config.js.
 * Baselines are approved screenshots of your own build, not design exports.
 * See css-development.md §2, §14, §19 and §23 for the surrounding workflow.
 */
import { test, expect } from '@playwright/test';

/**
 * One entry per breakpoint worth locking.
 *
 * To add a breakpoint, add an entry here, then create its baselines once with:
 *   npx playwright test tests/template-demo.spec.js --update-snapshots
 */
const viewports = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};

for (const [name, viewport] of Object.entries(viewports)) {
  test.describe(`Responsive template - ${name}`, () => {
    // Technique 1: fixture override scoped to this describe. Every test here
    // runs at this size in every configured browser project, so the existing
    // smoke tests are untouched. Setting the fixture is preferable to calling
    // page.setViewportSize() inside tests: the context starts at this size.
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      // Technique 2: baseURL lives in playwright.config.js, so keep paths
      // relative. The same spec then works with localhost, a Docker service
      // name, or a CI URL by changing config only.
      await page.goto('/');

      // A web-first assertion retries until the heading is really rendered.
      // Prefer this to waitForTimeout() or networkidle as a readiness gate.
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      // Technique 3: fonts arriving late reflow text and produce phantom diffs.
      // Await fonts before screenshots; no arbitrary sleep required.
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
    });

    // Techniques 4: section-level visual regression.
    // Screenshot a stable locator rather than the full page: a 4 px header
    // shift then only fails the header shot, not every section below it.
    // Include the breakpoint in the name; Playwright appends the browser
    // project and platform suffix (header-mobile-chromium-linux.png).
    // animations: 'disabled' removes CSS transition/animation noise.
    // maxDiffPixelRatio: 0.01 tolerates anti-aliasing and sub-pixel rendering
    // differences; tighten it for small components, loosen it for full pages.
    // To reuse: add a test with a new getByTestId(...) and a unique name,
    // then approve just that baseline with --update-snapshots and -g.
    // Keep testid values in sync with the template markup.

    test(`header screenshot - ${name}`, async ({ page }) => {
      await expect(page.getByTestId('site-header')).toHaveScreenshot(
        `header-${name}.png`,
        { animations: 'disabled', maxDiffPixelRatio: 0.01 },
      );
    });

    test(`card grid screenshot - ${name}`, async ({ page }) => {
      await expect(page.getByTestId('card-grid')).toHaveScreenshot(
        `card-grid-${name}.png`,
        { animations: 'disabled', maxDiffPixelRatio: 0.01 },
      );
    });

    test(`footer screenshot - ${name}`, async ({ page }) => {
      await expect(page.getByTestId('site-footer')).toHaveScreenshot(
        `footer-${name}.png`,
        { animations: 'disabled', maxDiffPixelRatio: 0.01 },
      );
    });

    // Technique 5: structural layout assertions complement screenshots.
    // A screenshot can pass while a layout rule is wrong if the changed area
    // is under the pixel tolerance; geometry checks catch that, and they are
    // cheaper to diagnose than a red image.
    test(`no horizontal overflow - ${name}`, async ({ page }) => {
      // scrollWidth > clientWidth means the page scrolls sideways — usually a
      // fixed-width child, an oversized min-width, or an unbroken long string.
      // Fix the CSS rather than masking it with overflow-x: hidden.
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });

    test(`card columns - ${name}`, async ({ page }) => {
      // boundingBox() returns viewport-relative geometry. Stacked cards share
      // the same x; side-by-side cards have a clearly larger second x. This
      // asserts the CSS breakpoint itself, independent of colors or fonts.
      // For a larger suite, prefer one expectation per breakpoint over this
      // branch on the name, or switch on test.info().project.name.
      const cards = page.getByTestId('card');
      const firstBox = await cards.nth(0).boundingBox();
      const secondBox = await cards.nth(1).boundingBox();

      if (name === 'mobile') {
        // Stacked: both cards have effectively the same x position
        expect(Math.abs(firstBox.x - secondBox.x)).toBeLessThan(1);
      } else {
        // Side-by-side: second card starts clearly to the right of the first
        expect(secondBox.x - firstBox.x).toBeGreaterThan(10);
      }
    });
  });
}
