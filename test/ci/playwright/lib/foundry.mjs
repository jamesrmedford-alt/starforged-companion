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
  // The module reports a pass it gave up on as a warning ("… failed: …") and
  // carries on: a step that waits for that pass's call then times out with
  // nothing in the errors. Its own warnings are kept for the failure report.
  const warnings = [];
  // Its debug lines say which branch a flow took ("… has already begun —
  // start effects not repeated"): the last of them go in the report too.
  const debug = [];
  page.on("console", (msg) => {
    const own = msg.text().startsWith(`${MODULE_ID} |`);
    if (msg.type() === "error") errors.push(msg.text());
    else if (msg.type() === "warning" && own) warnings.push(msg.text());
    else if (msg.type() === "debug" && own) { debug.push(msg.text()); if (debug.length > 200) debug.shift(); }
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  if (prepare) await prepare(page);
  return { label, context, page, errors, warnings, debug };
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

/**
 * What each client's page holds at a failure — the session's state, the open
 * windows, the last chat lines. A step that waited for a dialog or a card that
 * never came says nothing about why; this does.
 */
export async function logPageState(clients, log = console.log) {
  for (const c of clients) {
    const state = await c.page.evaluate((id) => {
      const cs = game.settings?.get?.(id, "campaignState") ?? {};
      const text = (el) => String(el?.textContent ?? "").replace(/\s+/g, " ").trim();
      return {
        route: location.pathname, user: game.user?.name ?? null, ready: game.ready === true,
        session: { active: cs.sessionActive ?? null, number: cs.sessionNumber ?? null, pendingMove: !!cs.pendingMove,
          id: cs.currentSessionId ?? null, startedId: cs.sessionStartedId ?? null, endedId: cs.sessionEndedId ?? null },
        windows: [...document.querySelectorAll("dialog, .application")]
          .map(el => text(el.querySelector(".window-title, header h1, header h4")) || el.id).filter(Boolean).slice(0, 12),
        notifications: [...document.querySelectorAll("#notifications .notification")].map(el => text(el).slice(0, 140)).slice(-4),
        chat: game.messages.contents.slice(-6).map(m => `${m.author?.name ?? "?"}: ${String(m.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 90)}`),
      };
    }, MODULE_ID).catch(err => ({ error: String(err?.message ?? err).split("\n")[0] }));
    log(`${c.label} page: ${JSON.stringify(state)}`);
  }
}

/** The last 30 console errors of every client that logged any, and the module's own last warnings. */
export function logConsoleErrors(clients, log = console.log) {
  for (const c of clients) {
    if (!c.errors.length) continue;
    log(`${c.label} console errors (last 30):`);
    for (const e of c.errors.slice(-30)) log(`  ${e}`);
  }
  for (const c of clients) {
    if (!c.warnings?.length) continue;
    log(`${c.label} module warnings (last 40):`);
    for (const w of c.warnings.slice(-40)) log(`  ${w.slice(0, 400)}`);
  }
  for (const c of clients) {
    if (!c.debug?.length) continue;
    log(`${c.label} module debug lines (last 25):`);
    for (const d of c.debug.slice(-25)) log(`  ${d.slice(0, 300)}`);
  }
}
