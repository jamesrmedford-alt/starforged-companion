// The module's Quench batches, run in the live world from the session's own
// browser — what the Cypress spec (cypress/e2e/quench.cy.js) runs, for a
// session that cannot run the Cypress image (scripts/cloud.sh). CI's gate is
// still the Cypress run: in a cloud session a few batches time out that pass
// there (known-issues CLOUD-QUENCH-TIMEOUTS).
//
// The spec's guards are kept: Quench's results panel is made safe to run
// without its window, the batches are named (a pattern that matches none
// would "pass" with no tests), and a run counts only once its Mocha runner
// has ended. Exit code 0 when no test failed; 1 otherwise. The failed tests
// are listed, and the whole result is written to ./artifacts/quench.json.

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { MODULE_ID, GM_NAME, ARTIFACTS, openClient, join } from "./lib/foundry.mjs";

const RUN_CAP_MS = 15 * 60_000;
const log = (...args) => console.log("[quench]", ...args);

const browser = await chromium.launch();
let result = null;
try {
  const gm = await openClient(browser, "gm");
  await join(gm, GM_NAME, log);
  await gm.page.waitForFunction(() => !!globalThis.quench, null, { timeout: 60_000 });
  await gm.page.waitForTimeout(3000);

  result = await gm.page.evaluate(async ({ moduleId, capMs }) => {
    const quench = globalThis.quench;
    const api = game.modules.get("quench")?.api;
    for (const proto of [quench?.QuenchResults?.prototype, globalThis.QuenchResults?.prototype, api?.QuenchResults?.prototype]) {
      if (typeof proto?._setElementDisabled !== "function") continue;
      const original = proto._setElementDisabled;
      proto._setElementDisabled = function headlessSafe(...args) { try { return original.apply(this, args); } catch { return undefined; } };
    }
    try { await (quench?.app ?? quench?.results)?.render?.(true); } catch { /* the panel is optional */ }
    await new Promise(r => setTimeout(r, 1500));

    const registered = quench?._testBatches;
    const ids = (registered ? (typeof registered.keys === "function" ? Array.from(registered.keys()) : Object.keys(registered)) : [])
      .filter(id => typeof id === "string" && id.startsWith(`${moduleId}.`));
    if (!ids.length) return { error: `no ${moduleId}.* batches are registered — is the module enabled?` };

    const runner = await quench.runBatches(ids, { json: true });
    // The promise can resolve with a runner that has not finished.
    if (typeof runner?.on === "function" && !runner?.stats?.end) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("the Mocha runner never ended")), capMs);
        runner.once("end", () => { clearTimeout(timer); resolve(); });
        if (runner?.stats?.end) { clearTimeout(timer); resolve(); }
      });
    }
    if (!runner?.stats?.end) return { error: "the run never ended (stats.end unset) — not counted", batches: ids.length };

    const failed = [];
    const walk = (suite) => {
      for (const t of suite?.tests ?? []) {
        if (t.state === "failed") failed.push({ title: typeof t.fullTitle === "function" ? t.fullTitle() : t.title, message: String(t.err?.message ?? "").slice(0, 400) });
      }
      for (const s of suite?.suites ?? []) walk(s);
    };
    walk(runner.suite);
    const { tests, passes, failures, pending, duration } = runner.stats;
    return { batches: ids.length, stats: { tests, passes, failures, pending, duration }, failed };
  }, { moduleId: MODULE_ID, capMs: RUN_CAP_MS });

  if (result.error) {
    log(`FAILED — ${result.error}`);
  } else {
    const { tests, passes, failures, pending, duration } = result.stats;
    log(`${result.batches} batches: ${tests} tests, ${passes} passed, ${failures} failed, ${pending} pending (${Math.round(duration / 1000)}s)`);
    for (const f of result.failed) log(`  FAILED ${f.title}\n         ${f.message}`);
    if (failures > result.failed.length) log(`  (${failures - result.failed.length} more failure(s) in hooks)`);
  }
} catch (err) {
  result = { error: String(err?.message ?? err).split("\n")[0] };
  log(`FAILED — ${result.error}`);
} finally {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACTS, "quench.json"), `${JSON.stringify(result, null, 2)}\n`);
  await browser.close();
}
process.exit(result && !result.error && result.stats?.failures === 0 && result.stats?.tests > 0 ? 0 : 1);
