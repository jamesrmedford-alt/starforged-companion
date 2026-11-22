// First launch of the test stack, on the session's own browser — what the
// Cypress spec (cypress/e2e/quench.cy.js) does before it runs Quench, for a
// session that cannot run the Cypress image (scripts/cloud.sh):
//
//   /license  tick "I agree", Agree      (Foundry then signs the licence)
//   /auth     the admin key
//   /setup    dismiss the onboarding tour, launch the test world,
//             begin its data migration without a backup
//   /join     join as Gamemaster
//   /game     enable Starforged Companion and Quench, reload, join again
//
// Gated by route, as the spec is: Foundry's markup shifts between v13
// builds, its routes do not. Safe to run again — a step already done is
// skipped. The admin key comes from FOUNDRY_ADMIN_KEY and is not printed.
// Exit code 0 when the world is live with the module active; 1 otherwise,
// with a screenshot in ./artifacts.

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { BASE_URL, MODULE_ID, GM_NAME, ARTIFACTS } from "./lib/foundry.mjs";

const WORLD_ID  = "starforged-ci-world";
const ADMIN_KEY = process.env.FOUNDRY_ADMIN_KEY ?? "";
const log = (...args) => console.log("[first-launch]", ...args);
const route = (page) => new URL(page.url()).pathname;

async function dismissTour(page) {
  const exits = ['.tour-step header .close', '.tour-step [data-action="exit"]', '.tour-step [data-action="close"]',
    '.tour-overlay [data-action="cancel"]', '.tour [data-action="exit"]'];
  for (const selector of exits) {
    const el = page.locator(selector).first();
    if (await el.isVisible().catch(() => false)) { await el.click({ force: true }).catch(() => {}); break; }
  }
  // The tour's overlay fades out over the world tile: a click made at the
  // tile's coordinates before it is gone lands on the overlay.
  await page.waitForFunction(() => !document.querySelector(".tour-overlay, .tour-center-step, .tour-step"), null, { timeout: 15_000 })
    .catch(() => log("a tour overlay is still showing"));
}

/** "World Data Migration": a freshly staged template is older than the build. No backup of an empty world. */
async function beginMigration(page) {
  if (!(await page.getByText("World Data Migration").first().isVisible().catch(() => false))) return;
  const boxes = page.locator('input[type="checkbox"]');
  for (let i = 0; i < await boxes.count(); i++) {
    const label = await boxes.nth(i).evaluate((el) => `${el.parentElement?.textContent ?? ""} ${el.getAttribute("aria-label") ?? ""}`);
    if (/backup/i.test(label)) await boxes.nth(i).uncheck({ force: true }).catch(() => {});
  }
  await page.locator("button", { hasText: /begin migration/i }).first().click({ force: true });
  log("world data migration begun");
  await page.waitForTimeout(2000);
  if (await page.getByText("Creating Backup").first().isVisible().catch(() => false)) {
    await page.locator("button", { hasText: /^\s*(✓\s*)?backup\s*$/i }).first().click({ force: true });
  }
}

async function joinAsGm(page) {
  const select = page.locator('select[name="userid"], select#join-game-user').first();
  await select.waitFor({ state: "visible", timeout: 120_000 });
  const value = await select.evaluate((el, name) => {
    const options = [...el.options];
    return (options.find(o => o.textContent.trim() === name) ?? options.find(o => o.textContent.includes(name)) ?? options[1])?.value ?? null;
  }, GM_NAME);
  await select.selectOption(value);
  await page.locator('form#join-game button[type="submit"], button[name="join"]').first().click();
}

const gameReady = (page) => page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 180_000 });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
try {
  await page.goto(`${BASE_URL}/`, { timeout: 120_000 });

  if (route(page).startsWith("/license")) {
    await page.locator('input#eula-agree, input[name="agree"]').first().check({ force: true });
    await page.locator('button[name="accept"], button[data-action="accept"]').first().click();
    // Still here after the click: Foundry could not sign the licence — its
    // server log says why (most often: api.foundryvtt.com is not reachable).
    await page.waitForURL((u) => !u.pathname.startsWith("/license"), { timeout: 90_000 });
    log("licence agreement accepted");
  }
  if (route(page).startsWith("/auth")) {
    if (!ADMIN_KEY) throw new Error("Foundry asks for the admin key: set FOUNDRY_ADMIN_KEY");
    const input = page.locator("input:visible").first();
    await input.fill(ADMIN_KEY);
    await input.press("Enter");
    await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 60_000 });
    log("admin key accepted");
  }
  if (route(page).startsWith("/setup")) {
    await page.waitForTimeout(3000);
    await dismissTour(page);
    const tab = page.locator('a[data-tab="worlds"], button[data-tab="worlds"], [data-action="tab"][data-tab="worlds"], nav.tabs [data-tab="worlds"]').first();
    if (await tab.count()) await tab.click({ force: true }).catch(() => {});
    const tile = page.locator(`[data-world="${WORLD_ID}"], [data-package-id="${WORLD_ID}"]`).first();
    await tile.waitFor({ state: "attached", timeout: 90_000 });
    await dismissTour(page);
    // The control itself, not its coordinates. No Escape after it: that
    // would close the migration dialog the launch opens.
    await tile.locator('[data-action="worldLaunch"], a.control.play').first().evaluate((el) => el.click());
    await page.waitForTimeout(4000);
    await beginMigration(page);
    await page.waitForURL((u) => u.pathname.startsWith("/join") || u.pathname.startsWith("/game"), { timeout: 180_000 });
    log("world launched");
  }
  if (route(page).startsWith("/join")) await joinAsGm(page);
  await page.waitForURL((u) => u.pathname.startsWith("/game"), { timeout: 120_000 });
  await gameReady(page);

  const active = await page.evaluate((id) => ({ module: game.modules.get(id)?.active === true, quench: game.modules.get("quench")?.active === true }), MODULE_ID);
  if (!active.module || !active.quench) {
    await page.evaluate(async (id) => {
      const config = game.settings.get("core", "moduleConfiguration") ?? {};
      config[id] = true;
      config.quench = true;
      await game.settings.set("core", "moduleConfiguration", config);
    }, MODULE_ID);
    await page.reload({ timeout: 120_000 });
    await page.waitForTimeout(3000);
    if (route(page).startsWith("/join")) await joinAsGm(page);
    await page.waitForURL((u) => u.pathname.startsWith("/game"), { timeout: 120_000 });
    await gameReady(page);
  }
  const state = await page.evaluate((id) => ({
    core: game.version, system: `${game.system.id} ${game.system.version}`, world: game.world?.id,
    module: game.modules.get(id)?.active === true, quench: game.modules.get("quench")?.active === true,
    user: game.user?.name, isGM: game.user?.isGM === true,
  }), MODULE_ID);
  log("world is live:", JSON.stringify(state));
  if (!state.module || !state.isGM) throw new Error("the module is not active for a GM after the reload");
} catch (err) {
  log(`FAILED at ${route(page)} — ${String(err?.message ?? err).split("\n")[0]}`);
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  await page.screenshot({ path: path.join(ARTIFACTS, "first-launch-failure.png") }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
