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
 *
 * Gates by URL, not DOM selectors — Foundry's form IDs and class names
 * shift between minor v13 releases, but the routes (/license, /setup,
 * /join, /game) are stable. Inside each route, we use the visible
 * label text or input name (also stable) instead of generated CSS.
 */
function maybeAcceptEulaAndAuth() {
  // 1. /license — EULA. v13 markup: a checkbox labelled "I agree to
  //    these terms" plus a submit button reading "Agree". Tick the box
  //    (force: true — the label may overlap the input visually) then
  //    click Agree. Wait for the redirect away from /license.
  cy.url({ timeout: 30000 }).then((url) => {
    if (!url.includes("/license")) return;

    // Force the checkbox: the layout uses a custom-styled label that
    // sits on top of the input. force-check bypasses the visibility
    // covered-by-other-element heuristic.
    cy.contains("label", /i agree to these terms/i, { timeout: 10000 })
      .find('input[type="checkbox"]')
      .check({ force: true });

    cy.contains("button", /^\s*(✓\s*)?agree\s*$/i).click();

    cy.url({ timeout: 30000 }).should("not.include", "/license");
  });

  // 2. Admin auth. Foundry v13 routes this to /auth. The form has
  //    exactly one input on a fresh world; rather than guess at its
  //    name / type / placeholder (Foundry has shipped at least three
  //    different shapes across v13 patch releases), just type into
  //    the first visible input on the page.
  cy.url({ timeout: 30000 }).then((url) => {
    if (!url.includes("/auth")) return;

    cy.get("input:visible", { timeout: 30000 })
      .first()
      .type(Cypress.env("ADMIN_KEY"), { log: false })
      .type("{enter}");

    // After login, Foundry lands on /setup. Wait for the redirect so the
    // next step (world-tile search) sees the right DOM.
    cy.url({ timeout: 60000 }).should("not.include", "/auth");
  });
}

/**
 * Dismiss any visible Foundry tour overlay. v13 ships onboarding tours
 * ("Backups Overview", "Sidebar Tour", etc.) that auto-launch on first
 * /setup visit. They overlay clickable UI and can intercept clicks.
 *
 * Hits multiple close-button shapes Foundry has shipped (tour-step
 * close icon, tour-overlay cancel button, generic .close inside tour).
 * No-op when no tour is showing.
 */
function dismissAnyTour() {
  cy.get("body").then(($body) => {
    const tourSelectors = [
      '.tour-step header .close',
      '.tour-step [data-action="exit"]',
      '.tour-step [data-action="close"]',
      '.tour-overlay [data-action="cancel"]',
      '.tour [data-action="exit"]',
    ];
    for (const sel of tourSelectors) {
      const $el = $body.find(sel).filter(":visible");
      if ($el.length) {
        cy.wrap($el.first()).click({ force: true });
        return;
      }
    }
  });
  // Also send an ESC keypress as a fallback — Foundry binds it to close
  // the active tour / dialog in most builds. Harmless if no overlay.
  cy.get("body").type("{esc}", { force: true });
}

/**
 * Handle the "World Data Migration" dialog Foundry pops when a world's
 * stored data version is older than the running Foundry build (which
 * is always true on first launch of a freshly-staged world template:
 * the template carries coreVersion "13" while Foundry runs 13.351).
 *
 * Uncheck the "Create a backup" checkbox first so migration is a
 * one-step click — backing up an empty test world is pointless and
 * spawns a second dialog. If that fails (older Foundry builds, custom
 * label markup), we fall back to clicking the follow-up Backup dialog
 * with an empty note.
 */
function maybeBeginMigration() {
  cy.get("body", { timeout: 15000 }).then(($body) => {
    const showing =
      $body.find('.dialog, dialog, [data-appid]').filter(':contains("Migration")').length ||
      $body.text().includes("World Data Migration");
    if (!showing) return;

    // Try to uncheck "Create a backup before migrating?". Match by
    // checkbox's surrounding label text; ignore if not found.
    const $bkCheckbox = $body.find('input[type="checkbox"]').filter((i, el) => {
      const $el = Cypress.$(el);
      const labelText =
        ($el.parent().text() || "") +
        " " +
        ($el.attr("aria-label") || "") +
        " " +
        (Cypress.$(`label[for="${$el.attr("id")}"]`).text() || "");
      return /backup/i.test(labelText);
    });
    if ($bkCheckbox.length) {
      cy.wrap($bkCheckbox.first()).uncheck({ force: true });
    }

    cy.contains("button", /begin migration/i, { timeout: 10000 })
      .click({ force: true });
  });

  // Fallback: if the uncheck didn't take (or the dialog flow on this
  // Foundry build always runs a backup), Foundry shows a "Creating
  // Backup of <world>" prompt with an optional note field and a
  // "Backup" submit button. Submit it empty.
  cy.get("body", { timeout: 30000 }).then(($body) => {
    if (!$body.text().includes("Creating Backup")) return;
    cy.contains("button", /^\s*(✓\s*)?backup\s*$/i, { timeout: 10000 })
      .click({ force: true });
  });
}

/** Launch the test world from the setup screen, then join as Gamemaster. */
function launchAndJoinWorld() {
  // Foundry's onboarding tour overlays the setup screen on first launch.
  // Get rid of it before searching for the world tile.
  dismissAnyTour();

  // Setup screen — Foundry v13 puts world tiles inside a tabbed layout
  // (Worlds / Systems / Modules / …). If a Worlds tab is visible,
  // click it first; no-op otherwise (already-active tab, or older
  // markup without tabs).
  cy.get("body", { timeout: 30000 }).then(($body) => {
    const tabSelectors = [
      'a[data-tab="worlds"]',
      'button[data-tab="worlds"]',
      '[data-action="tab"][data-tab="worlds"]',
      'nav.tabs [data-tab="worlds"]',
    ];
    const match = tabSelectors.find((sel) => $body.find(sel).length);
    if (match) cy.get(match).first().click({ force: true });
  });

  // World tile — try multiple attribute patterns Foundry has used
  // across v13 patch releases. Falls back to text-match if neither
  // attribute is present.
  cy.get("body", { timeout: 90000 }).should(($body) => {
    const has =
      $body.find('[data-world="starforged-ci-world"]').length ||
      $body.find('[data-package-id="starforged-ci-world"]').length ||
      $body.text().includes("Starforged CI Test World");
    expect(has, "world tile or text").to.be.ok;
  });

  cy.get("body").then(($body) => {
    const direct = $body.find(
      // v13 has shipped at least four shapes for the launch control.
      '[data-world="starforged-ci-world"] [data-action="worldLaunch"], ' +
      '[data-package-id="starforged-ci-world"] [data-action="worldLaunch"], ' +
      '[data-world="starforged-ci-world"] a.control.play, ' +
      '[data-package-id="starforged-ci-world"] a.control.play'
    );
    if (direct.length) {
      cy.wrap(direct.first()).click({ force: true });
      return;
    }
    // Fallback: any "Launch World" / play control next to the world's text.
    cy.contains("Starforged CI Test World")
      .closest('[data-package-id], [data-world], .package, .world')
      .within(() => {
        cy.contains("a, button", /launch( world)?|^play$/i).click({ force: true });
      });
  });

  // First-launch interstitial: world-data migration dialog. Dismiss any
  // tour that auto-launched alongside it, then begin migration. The
  // migration of an empty test world is a few-second no-op.
  dismissAnyTour();
  maybeBeginMigration();

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

    // 4. Run all our Quench batches.
    //
    //    quench.runBatches() returns a promise that resolves when the
    //    Mocha runner emits its internal "end" event — no hook
    //    listener, no polling, no guessing at which property name
    //    holds the runner instance across Quench builds. Just await.
    //
    //    900 s cap on BOTH cy.window AND .then(): cy.window's timeout
    //    only governs the initial window-ready check; cy.then's
    //    callback returns a Cypress.Promise that has its OWN default
    //    timeout (30 s) which would otherwise abort mid-Quench.
    //
    //    Run #8 spent 9m58s here before my old polling loop hit its
    //    deadline — Quench had finished but neither
    //    `quench._mochaRunner` nor `quench.runner` carried the post-
    //    completion stats this build expected. Trusting the promise
    //    resolution sidesteps that.
    cy.window({ timeout: 900000 }).then({ timeout: 900000 }, async (win) => {
      // ─── PRE-FLIGHT DIAGNOSTIC ────────────────────────────────────────
      // Surface the shape of win.quench so failures in Quench's internal
      // UI paths can be diagnosed from the PR sticky-comment log. Logged
      // first so even a same-tick throw in runBatches doesn't suppress it.
      const quenchModule = win.game?.modules?.get?.("quench");
      const introspection = {
        phase:              "pre-run-introspection",
        hasQuench:          !!win.quench,
        quenchKeys:         win.quench ? Object.keys(win.quench) : [],
        quenchProtoKeys:    win.quench ? Object.getOwnPropertyNames(Object.getPrototypeOf(win.quench) ?? {}) : [],
        hasGameQuenchMod:   !!quenchModule,
        moduleApiKeys:      quenchModule?.api ? Object.keys(quenchModule.api) : null,
        hasWinQuenchResults: !!win.QuenchResults,
      };
      cy.task("logQuenchStats", introspection);

      // ─── ENSURE RESULTS PANEL EXISTS ──────────────────────────────────
      // Run #9: QuenchResults._setElementDisabled hit a `Cannot read
      // properties of undefined (reading 'querySelector')` because the
      // results panel was never rendered (in normal use the GM clicks a
      // toolbar button to open it; headless Cypress doesn't). Two defenses:
      //
      // (a) Render the panel up front via whatever path the Quench build
      //     exposes. Tries a handful of known shapes.
      // (b) Monkey-patch _setElementDisabled to a try/swallow so a UI-
      //     update failure can't take the whole run down. Headless runs
      //     don't care about button state — we're reading stats only.
      const renderPanel = async () => {
        const candidates = [
          win.quench?.QuenchResults,
          win.QuenchResults,
          quenchModule?.api?.QuenchResults,
        ].filter(Boolean);
        for (const Cls of candidates) {
          if (Cls?.prototype?.render) {
            try {
              const inst = new Cls();
              await inst.render(true);
              return `class:${Cls.name ?? "anon"}`;
            } catch (e) { /* fall through to next candidate */ }
          }
        }
        const instances = [
          win.quench?.app,
          win.quench?.results,
          win.quench?.quenchResults,
          quenchModule?.api?.app,
        ].filter(Boolean);
        for (const inst of instances) {
          if (typeof inst?.render === "function") {
            try {
              await inst.render(true);
              return "instance.render";
            } catch (e) { /* fall through */ }
          }
        }
        return "(none worked)";
      };

      const monkeyPatch = () => {
        const targets = [
          win.quench?.QuenchResults?.prototype,
          win.QuenchResults?.prototype,
          quenchModule?.api?.QuenchResults?.prototype,
        ].filter(p => p && typeof p._setElementDisabled === "function");
        for (const proto of targets) {
          const orig = proto._setElementDisabled;
          proto._setElementDisabled = function safelyDisabled(...args) {
            try { return orig.apply(this, args); }
            catch { /* UI doesn't matter headless */ }
          };
        }
        return targets.length;
      };

      const panelMethod = await renderPanel();
      const patchedCount = monkeyPatch();
      cy.task("logQuenchStats", {
        phase:         "pre-run-prep",
        panelMethod,
        patchedCount,
      });

      // Give Foundry a tick for the panel render to settle.
      await new Promise(r => setTimeout(r, 1500));

      // ─── ACTUAL RUN ───────────────────────────────────────────────────
      const ret = await win.quench.runBatches(
        "starforged-companion.**",
        { json: true },
      );

      // Resolution value varies across Quench builds. Try several
      // shapes; the json-report shape is what `{ json: true }` is
      // documented to populate. Fall back to live runner state if
      // the return is empty (older Quench builds resolve void).
      let report = null;
      if (ret && typeof ret === "object" && ret.json && ret.json.stats) {
        report = ret.json;                            // newer Quench: { json: report, … }
      } else if (ret && ret.stats) {
        report = ret;                                 // mocha runner returned directly
      } else if (win.quench?._mochaRunner?.stats) {
        report = win.quench._mochaRunner;             // legacy
      } else if (win.quench?.runner?.stats) {
        report = win.quench.runner;                   // alternate legacy
      }

      if (!report || !report.stats) {
        // Last-ditch diagnostic: dump every key on win.quench so the
        // next iteration knows where the stats actually live.
        const keys = win.quench ? Object.keys(win.quench) : [];
        throw new Error(
          `Quench finished but no stats available. ` +
          `win.quench keys: [${keys.join(", ")}]. ` +
          `runBatches returned: ${JSON.stringify(ret)?.slice(0, 200)}`,
        );
      }

      return report;
    }).then({ timeout: 30000 }, (report) => {
      const stats    = report?.stats    ?? {};
      const failures = report?.failures ?? [];

      cy.task("logQuenchStats", stats);
      cy.task("logQuenchFailures", failures.map((f) => ({
        fullTitle: f.fullTitle ?? f.title,
        err: { message: f.err?.message ?? String(f.err ?? "(no message)") },
      })));

      expect(stats.tests,    "stats.tests").to.be.greaterThan(0);
      expect(stats.failures, "stats.failures").to.equal(0);
    });
  });
});
