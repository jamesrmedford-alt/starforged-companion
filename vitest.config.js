// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Shared setup runs before every test file.
    // Stubs Foundry globals (game, Hooks, foundry, CONST, etc.)
    setupFiles: ['./tests/setup.js'],

    // Node environment — no DOM, no canvas. Integration tests (Quench)
    // run inside live Foundry and are excluded here.
    environment: 'node',

    // Match test files directly in tests/unit/ AND in any subdirectories.
    // Both patterns are needed: Vitest 2.x's glob does not match zero
    // intermediate directories with **, so tests/unit/**/*.test.js alone
    // misses files sitting directly in tests/unit/.
    include: [
      'tests/unit/*.test.js',
      'tests/unit/**/*.test.js',
    ],
    exclude: [
      'tests/integration/**',
      'node_modules/**',
    ],

    // Coverage via v8 — run with: vitest run --coverage
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: [
        'src/ui/**',          // UI panels require Foundry ApplicationV2 — integration only
        'src/**/*.test.js',
      ],
      thresholds: {
        lines:     80,
        functions: 80,
        branches:  75,
      },
    },

    // Give async tests a reasonable timeout — the mocked journal operations
    // are sync-over-async stubs and should resolve instantly.
    testTimeout: 5000,
  },
});
