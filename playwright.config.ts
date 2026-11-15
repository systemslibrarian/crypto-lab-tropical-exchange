import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the production build served by `vite preview`, so what
 * passes here is what ships.
 *
 * Port 4752 is this lab's own, taken from the catalog's port registry
 * (`node tools/port-sync.js`) and never the Vite default 4173: a shared port
 * means `reuseExistingServer` silently scans a DIFFERENT lab's preview, and
 * during a mutation check it can scan an unmutated checkout still running from
 * a previous run — which reads as "the mutation was not caught" and sends
 * someone to fix a check that works.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // The axe driver walks six panels, runs a real trial batch, and scans ~30
  // states twice over. This is generous on purpose; `timeout-minutes` on the
  // CI job is the real backstop.
  timeout: 1_800_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4752/crypto-lab-tropical-exchange/',
  },
  projects: [
    { name: 'a11y', testMatch: /a11y\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    // Claims run in one engine: they assert what the page SAYS, which does not
    // vary by browser.
    { name: 'claims', testMatch: /claims\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // Build before serving: `vite preview` only serves whatever is already in
    // dist/, so without this a failing build leaves the previous good bundle
    // in place and the suite passes green against code that no longer
    // compiles. With the build in front, a compile error aborts the run.
    command: 'npm run build && npm run preview -- --port 4752 --strictPort',
    url: 'http://localhost:4752/crypto-lab-tropical-exchange/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
