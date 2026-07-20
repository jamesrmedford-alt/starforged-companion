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
      'src/integration/**',
      'node_modules/**',
    ],

    coverage: {
      provider: 'v8',

      // Measure EVERYTHING the unit suite can structurally reach (rewritten in
      // the 2026-07 test-suite review — the old include list was a Session-2
      // fossil that measured 9 files / ~8% of src while narrator.js, entities,
      // and the roller went ungated). Exclusions below are limited to code a
      // Node unit test cannot execute meaningfully; each names its real
      // instrument. Do NOT re-add exclusions for modules that merely LOOK
      // Foundry-bound — entities/, moves/, narration/ all test fine through
      // the tests/setup.js stubs.
      include: ['src/**/*.js'],
      exclude: [
        // Quench integration suite — runs only inside live Foundry.
        'src/integration/**',
        // Entry point: hooks, settings registration, chat dispatch, UI wiring.
        // Protected by the Quench batches + the Cypress e2e stack.
        'src/index.js',
        // ApplicationV2 panels / DialogV2 dialogs — need live Foundry
        // rendering; under units they are import-only (function coverage ~14%
        // proved the statement numbers were inflation, not protection).
        'src/ui/**',
        'src/safety/**',
        'src/character/chroniclePanel.js',
        'src/world/worldJournalPanel.js',
        'src/world/clarificationDialog.js',
        'src/sectors/sectorPanel.js',
        'src/factContinuity/correctionDialog.js',
        'src/private-channel/app.js',
        // Browser Web Speech API — no Node equivalent.
        'src/input/**',
        // Static help content — consumed by scripts/build-help-site.mjs and
        // the in-world journal; no logic to cover.
        'src/help/helpJournal.js',
      ],

      // Two-tier gate (see decisions.md → "Coverage gate: ratchet + core bar").
      // A flat 95% was considered and rejected: coverage measures execution,
      // not consumption — the retired assembler carried ~1,400 lines of tests
      // (high coverage, dead in production), and none of the 2026-07 audit's
      // ~46 defects would have been caught by more line coverage. What a gate
      // CAN do is (a) hold a hard bar where the logic is pure and the bar is
      // real, and (b) ratchet everywhere else so regressions fail loudly.
      thresholds: {
        // Floor over every included file — calibrated ~2pts under measured
        // actuals (73.6 lines / 72.3 branches / 64.9 funcs at adoption).
        // If a change drops below this, coverage regressed materially: add
        // tests or consciously re-calibrate in its own reviewed commit.
        lines:     70,
        branches:  68,
        functions: 60,

        // Core bar — the pure-logic spine, held at 95-class. These files are
        // at 97-100% lines today; the bar makes that a promise, not a fact.
        'src/{schemas.js,moves/resolver.js,moves/mischief.js,narration/narratorPrompt.js,character/chronicle.js,context/safety.js,truths/tables.js}': {
          lines:     95,
          functions: 95,
          branches:  80,
        },
      },
    },

    testTimeout: 5000,
  },
});
