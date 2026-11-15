import { configDefaults, defineConfig } from 'vitest/config';

// base must match the GitHub Pages project subpath:
// https://systemslibrarian.github.io/crypto-lab-tropical-exchange/
export default defineConfig({
  base: '/crypto-lab-tropical-exchange/',
  test: {
    // Colocated unit tests only. Playwright specs in e2e/ stay out of the
    // Vitest run, and the slow rate-measurement suite has its own config
    // (vitest.slow.config.ts) so `npm test` stays quick.
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**', 'src/**/*.slow.test.ts'],
  },
});
