// Cypress config for the Phase 2 Quench-driver suite.
//
// One spec — drives a browser through the Foundry first-launch ritual
// (EULA, admin auth, world launch, module enable) and then invokes
// `quench.runBatches("starforged-companion.**")` programmatically. Pass /
// fail is asserted against the Mocha-style result object.
//
// Timeouts are generous: Foundry's fresh-install boot takes ~30 s while
// it downloads + extracts the licensed zip, and the full Quench suite
// is ~130 s on a Docker host.

const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_baseUrl || "http://foundry:30000",
    specPattern: "e2e/**/*.cy.js",
    supportFile: "support/e2e.js",

    // Artifacts on failure only.
    video: false,
    screenshotOnRunFailure: true,
    screenshotsFolder: "/e2e/screenshots",
    videosFolder: "/e2e/videos",

    // Wide timeouts — Foundry's first boot + Quench run dominate.
    defaultCommandTimeout: 30000,
    pageLoadTimeout: 120000,
    requestTimeout: 30000,
    responseTimeout: 30000,

    // Disable test isolation — we run a single it() that walks the
    // entire ritual; resetting session between commands inside that
    // it() would kick us back to the EULA.
    testIsolation: false,

    setupNodeEvents(on /* , config */) {
      on("task", {
        // Surface Quench's mocha-shape result object to stdout. The
        // orchestrator (`scripts/e2e.sh`) consumes the docker compose
        // run logs, so anything logged here lands in CI output.
        logQuenchStats(stats) {
          // eslint-disable-next-line no-console
          console.log("[quench]", JSON.stringify(stats, null, 2));
          return null;
        },
        logQuenchFailures(failures) {
          if (!Array.isArray(failures) || !failures.length) return null;
          // eslint-disable-next-line no-console
          console.log(`[quench] ${failures.length} failure(s):`);
          for (const f of failures) {
            // eslint-disable-next-line no-console
            console.log(`  - ${f.fullTitle}\n      ${f.err?.message ?? f.err}`);
          }
          return null;
        },
      });
    },
  },
});
