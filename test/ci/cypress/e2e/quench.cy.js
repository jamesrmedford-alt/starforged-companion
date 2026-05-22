// Phase 2 — drive a browser through the manual first-launch ritual
// you'd otherwise do by hand (EULA → admin key → world launch → enable
// modules → reload → run Quench), then assert the Mocha result has
// zero failures.
//
// Failure modes worth knowing:
//   - Foundry v13 first-launch screens are gated by full-page renders;
//     selectors are picked to be resilient to minor markup changes
//     (button[name] AND button text alternatives where both exist).
//   - The post-module-enable reload uses cy.reload() and re-joins. Some
//     Foundry builds bounce to /setup instead of staying on /join; the
//     spec handles both.
//   - Quench's runner has no event we can `await` directly; we resolve
//     on the `quenchReports` hook (mocha-shape JSON) or fall back to
//     polling the runner state.

// Helpers ---------------------------------------------------------------

/** Wait for Foundry's `game.ready` to become true on the window. */
function waitForGameReady() {
  return cy.window({ timeout: 120000 }).should((win) => {
    expect(win.game, "window.game").to.exist;
    expect(win.game.ready, "game.ready").to.equal(true);
  });
}

/** Wait for Quench global to be available + ready (post-`init` hook). */
function waitForQuenchReady() {
  return cy.window({ timeout: 60000 }).should((win) => {
    expect(win.quench, "window.quench").to.exist;
    expect(win.Hooks, "window.Hooks").to.exist;
  });
}

/**
 * Walk past the EULA + admin-auth screens if they're showing. Idempotent:
 * a no-op when Foundry has already cleared them (post-reload, etc.).
 */
function maybeAcceptEulaAndAuth() {
  // EULA — Foundry shows a `<form id="eula">` with an "I Agree" button
  // on the absolute first hit. Skip if not present.
  cy.get("body", { timeout: 30000 }).then(($body) => {
    if ($body.find("form#eula").length) {
      cy.get('form#eula button[name="agree"], form#eula button[type="submit"]')
        .first()
        .click();
    }
  });

  // Admin auth — the setup screen requires the admin key before showing
  // the world list. The form has `input[name="adminPassword"]` in v13.
  cy.get("body", { timeout: 60000 }).then(($body) => {
    if ($body.find('input[name="adminPassword"]').length) {
      cy.get('input[name="adminPassword"]').type(Cypress.env("ADMIN_KEY"), {
        log: false,
      });
      cy.get('form button[type="submit"], button[name="adminAuth"]')
        .first()
        .click();
    }
  });
}

/** Launch the test world from the setup screen, then join as Gamemaster. */
function launchAndJoinWorld() {
  // Setup screen — wait for the world tile to render, then click its
  // launch button. The tile carries `data-world="starforged-ci-world"`.
  cy.contains("Starforged CI Test World", { timeout: 90000 }).should("be.visible");
  cy.get('[data-world="starforged-ci-world"] [data-action="worldLaunch"], ' +
         '[data-package-id="starforged-ci-world"] [data-action="worldLaunch"]')
    .first()
    .click({ force: true });

  // Join screen — `<select name="userid">` lists the GM. Some Foundry
  // builds use `<select id="join-game-user">` instead.
  cy.get('select[name="userid"], select#join-game-user', { timeout: 120000 })
    .should("be.visible")
    .then(($select) => {
      // Prefer the option labelled "Gamemaster"; fall back to the first
      // option if Foundry hasn't surfaced that label yet.
      const $gm = $select.find('option:contains("Gamemaster")').first();
      if ($gm.length) {
        cy.wrap($select).select($gm.text().trim());
      } else {
        // First option is usually the GM in a fresh world.
        cy.wrap($select).select(1);
      }
    });

  // Submit. Password is blank on a fresh world.
  cy.get('form#join-game button[type="submit"], button[name="join"]')
    .first()
    .click();
}

// Spec ------------------------------------------------------------------

describe("Quench full suite", () => {
  it("all starforged-companion batches pass", () => {
    // 1. First hit — EULA, admin auth, world launch, join.
    cy.visit("/", { timeout: 120000 });
    maybeAcceptEulaAndAuth();
    launchAndJoinWorld();
    waitForGameReady();

    // 2. Enable Starforged Companion + Quench, then reload.
    cy.window().then(async (win) => {
      const cfg = win.game.settings.get("core", "moduleConfiguration") ?? {};
      cfg["starforged-companion"] = true;
      cfg.quench = true;
      await win.game.settings.set("core", "moduleConfiguration", cfg);
    });

    cy.reload();

    // 3. After reload, Foundry usually drops us at the join screen again
    //    (no auto-rejoin on reload). Walk through it.
    cy.get("body", { timeout: 60000 }).then(($body) => {
      if ($body.find('select[name="userid"], select#join-game-user').length) {
        cy.get('select[name="userid"], select#join-game-user').then(($select) => {
          const $gm = $select.find('option:contains("Gamemaster")').first();
          if ($gm.length) cy.wrap($select).select($gm.text().trim());
          else cy.wrap($select).select(1);
        });
        cy.get('form#join-game button[type="submit"], button[name="join"]')
          .first()
          .click();
      }
    });

    waitForGameReady();
    waitForQuenchReady();

    // 4. Run all our Quench batches. The runner emits a `quenchReports`
    //    hook with the mocha-shape JSON report — listen for it from
    //    inside the page, settle the promise when it fires, and pull
    //    the stats out for the assertion.
    //
    //    600 s cap: the full suite is ~130 s on a Docker host, plus
    //    headroom for slow CI runners.
    cy.window({ timeout: 600000 }).then((win) => {
      return new Cypress.Promise((resolve, reject) => {
        let report = null;
        let hookId = null;

        const hookHandler = (data) => {
          // `data.json` is the mocha JSON report per Quench docs.
          report = data?.json ?? data;
          resolve(report);
        };

        hookId = win.Hooks.on("quenchReports", hookHandler);

        // Kick off the run. The promise it returns resolves with the
        // Mocha runner; we still wait on the hook for the JSON shape.
        win.quench
          .runBatches("starforged-companion.**", { json: true })
          .catch((err) => {
            if (hookId) win.Hooks.off("quenchReports", hookId);
            reject(err);
          });

        // Safety net: if quenchReports never fires (older Quench builds
        // without the hook), poll the runner state.
        const deadline = Date.now() + 590000;
        const poll = () => {
          if (report) return;
          const runner = win.quench?._mochaRunner ?? win.quench?.runner;
          if (runner?.stats?.end) {
            // Mocha sets `stats.end` once the runner finishes. Synthesise
            // a minimal report from the runner state.
            const stats = runner.stats;
            resolve({
              stats,
              failures: runner.failures ?? [],
              passes:   runner.passes ?? [],
              tests:    runner.tests ?? [],
            });
            return;
          }
          if (Date.now() > deadline) {
            reject(new Error("quench.runBatches: timed out waiting for completion"));
            return;
          }
          setTimeout(poll, 1000);
        };
        setTimeout(poll, 5000);
      });
    }).then((report) => {
      const stats = report?.stats ?? {};
      cy.task("logQuenchStats", stats);
      cy.task("logQuenchFailures", (report?.failures ?? []).map((f) => ({
        fullTitle: f.fullTitle ?? f.title,
        err: { message: f.err?.message ?? String(f.err ?? "(no message)") },
      })));

      expect(stats.tests, "stats.tests").to.be.greaterThan(0);
      expect(stats.failures, "stats.failures").to.equal(0);
      expect(stats.passes, "stats.passes").to.equal(stats.tests - (stats.pending ?? 0));
    });
  });
});
