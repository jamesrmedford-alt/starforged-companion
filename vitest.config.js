// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.js'],
    environment: 'node',

    // Make describe/it/expect etc available as globals (matches Jest behaviour).
    // Required for resolver.test.js and assembler.test.js written in Session 2.
    globals: true,

    // Use Vitest's default include pattern — reliably finds all *.test.js files.
    // Exclude integration tests which require live Foundry + Quench.
    exclude: [
      'tests/integration/**',
      'node_modules/**',
    ],

    coverage: {
      provider: 'v8',

      // Only measure coverage for the pure-logic modules that unit tests can
      // actually reach. Everything else requires live Foundry documents,
      // external APIs (Claude, DALL-E), or browser APIs (Web Speech) and
      // is covered by integration tests instead.
      include: [
        'src/context/**',
        'src/moves/mischief.js',
        'src/moves/resolver.js',
        'src/truths/**',
        'src/schemas.js',
      ],
      exclude: [
        // Foundry entry point — hooks, settings registration, UI wiring
        'src/index.js',
        // Requires live game.modules to check Loremaster presence
        'src/loremaster.js',
        // DALL-E API — requires external network and API key
        'src/art/**',
        // JournalEntry CRUD — requires live Foundry document layer
        'src/entities/**',
        // Web Speech API — browser-only, no Node equivalent
        'src/input/**',
        // Claude API — requires external network and API key
        'src/moves/interpreter.js',
        // JournalEntry + game.settings writes — requires live Foundry
        'src/moves/persistResolution.js',
        // External API proxy — Forge/Electron environment detection, integration only
        'src/api-proxy.js',
        // Pure data tables and roller — no logic branches, integration only
        'src/oracles/**',
        // ApplicationV2 UI panels — require live Foundry rendering
        'src/ui/**',
      ],

      // Thresholds apply only to the included files above.
      // resolver.js drags function coverage to ~54% because its move-specific
      // consequence handlers are data-shaped functions not reachable from unit
      // tests without a full move pipeline mock. All other included files are
      // at 75%+ functions. Threshold set to 50% to give a safe buffer over the
      // current 54% aggregate; raise it once resolver coverage improves.
      thresholds: {
        lines:     80,
        functions: 50,
        branches:  75,
      },
    },

    testTimeout: 5000,
  },
});
