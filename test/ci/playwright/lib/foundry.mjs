// Shared Foundry client helpers for the Playwright suites: the multiplayer
// suite (multiplayer.mjs, issue #282 item 6) and the scripted playthroughs
// (playthrough.mjs, issue #290 part 2). Each suite drives a GM and a player in
// two real browsers against the world the Cypress run left live.

import fs from "node:fs";
import path from "node:path";

export const BASE_URL   = process.env.BASE_URL ?? "http://foundry:30000";
export const MODULE_ID  = "starforged-companion";
export const MODULE_SRC = `/modules/${MODULE_ID}/src`;
export const GM_NAME    = process.env.GM_USER_NAME ?? "Gamemaster";
export const ARTIFACTS  = path.resolve("artifacts");
export const STEP_MS    = 30_000;
export const SETTLE_MS  = 4_000;   // time for a duplicate (another client's copy) to show up

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export function assert(cond, message) {
  if (!cond) throw new Error(message);
}

/**
 * A browser context + page for one user. `prepare(page)` runs before the first
 * navigation — the place for exposeFunction / addInitScript hooks.
 */
export async function openClient(browser, label, { prepare } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  if (prepare) await prepare(page);
  return { label, context, page, errors };
}

/** Join the running world as `userName` (blank password) and wait for game.ready. */
export async function join(client, userName, log = console.log) {
  const { page, label } = client;
  await page.goto(`${BASE_URL}/join`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const select = page.locator('select[name="userid"], select#join-game-user').first();
  await select.waitFor({ state: "visible", timeout: 120_000 });
  const value = await select.evaluate((el, name) => {
    const options = [...el.options];
    const opt = options.find(o => o.textContent.trim() === name) ?? options.find(o => o.textContent.includes(name));
    return opt?.value ?? null;
  }, userName);
  assert(value, `${label}: no user "${userName}" on the join screen`);
  await select.selectOption(value);
  await page.locator('form#join-game button[type="submit"], button[name="join"]').first().click();
  await page.waitForFunction(() => window.game?.ready === true, null, { timeout: 120_000 });
  log(`${label} joined as ${userName} (${await page.evaluate(() => game.user.id)})`);
}

/**
 * Send a chat line the way typing it does: ChatLog#processMessage fires the
 * chatMessage hook (the X-Card interception) and creates the message. Falls
 * back to typing into the chat box if this Foundry build has no
 * processMessage.
 */
export async function chat(client, text) {
  const used = await client.page.evaluate(async (t) => {
    if (typeof ui?.chat?.processMessage !== "function") return null;
    await ui.chat.processMessage(t);
    return "processMessage";
  }, text);
  if (used) return;
  const box = client.page.locator("#chat-message, textarea[name='content']").first();
  await box.fill(text);
  await box.press("Enter");
}

export const campaignState = (client) =>
  client.page.evaluate((id) => game.settings.get(id, "campaignState") ?? {}, MODULE_ID);

/** Messages carrying `flags[MODULE_ID][flag]`, as this client sees them. */
export const cards = (client, flag) =>
  client.page.evaluate(({ id, flag }) => game.messages.contents
    .filter(m => m.flags?.[id]?.[flag])
    .map(m => ({ id: m.id, author: m.author?.id ?? null, flags: m.flags[id] })), { id: MODULE_ID, flag });

export async function newCards(client, flag, before, { atLeast = 1 } = {}) {
  await client.page.waitForFunction(({ id, flag, n }) =>
    game.messages.contents.filter(m => m.flags?.[id]?.[flag]).length >= n,
  { id: MODULE_ID, flag, n: before.length + atLeast }, { timeout: STEP_MS });
  await sleep(SETTLE_MS);
  const seen = new Set(before.map(c => c.id));
  return (await cards(client, flag)).filter(c => !seen.has(c.id));
}

/** Screenshot every client's page into ./artifacts. */
export async function snapshot(clients, name, log = console.log) {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const slug = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60);
  for (const c of clients) {
    await c.page.screenshot({ path: path.join(ARTIFACTS, `${slug}-${c.label}.png`) })
      .catch(err => log(`screenshot of ${c.label} failed: ${err?.message ?? err}`));
  }
}

/** The last 30 console errors of every client that logged any. */
export function logConsoleErrors(clients, log = console.log) {
  for (const c of clients) {
    if (!c.errors.length) continue;
    log(`${c.label} console errors (last 30):`);
    for (const e of c.errors.slice(-30)) log(`  ${e}`);
  }
}
