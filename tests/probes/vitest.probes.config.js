// tests/probes/vitest.probes.config.js
//
// Runs the bug-audit probes (issues #321, #322; see README.md here). The probes
// are named *.probe.js so the normal `npm test` never collects them: each one
// asserts the correct behaviour and fails until its finding is fixed.
//
//   npx vitest run --config tests/probes/vitest.probes.config.js [tests/probes/<area>/]
//
// Everything else (setup file, globals, excludes) comes from the root config.
import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../vitest.config.js';

export default mergeConfig(base, defineConfig({
  test: {
    include: ['tests/probes/**/*.probe.js'],
  },
}));
