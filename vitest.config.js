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

    // Use Vitest's default include pattern rather than a custom one —
    // Vitest 2.x glob resolution against custom paths proved unreliable.
    // Default pattern: **/*.{test,spec}.?(c|m)[jt]s?(x)
    // We only need to exclude integration tests explicitly.
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
