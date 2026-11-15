import { defineConfig } from 'vitest/config';

// The rate-measurement suite (brief check E): at least 1,000 fresh instances
// per preset for the heuristic and 200 for the general attack. It takes tens
// of seconds, so it runs under `npm run test:slow` (and in CI) rather than in
// every `npm test`. Vitest exits non-zero when a config matches no files, so a
// renamed test file cannot turn this step into a silent zero-test pass.
export default defineConfig({
  test: {
    include: ['src/**/*.slow.test.ts'],
    testTimeout: 600_000,
  },
});
