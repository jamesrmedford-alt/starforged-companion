// Second-client E2E — a GM and a player in two real browsers (issue #282
// item 6).
//
// Quench runs as a single GM, so it cannot see the multiplayer bug families
// the 2026-10 audit found: a player's world write that Foundry refuses, a
// command that runs once per connected client, a card button that applies
// twice. The unit harness (tests/helpers/multiClient.js) simulates them; this
// is the check against real Foundry permissions and real socket delivery.
//
// Runs after the Cypress Quench run (scripts/e2e.sh), against the same live
// world — the first-launch ritual and module enablement are already done.
// One process drives both browsers, so every step happens in a known order:
// the player types or clicks, then the GM's page waits for the result in
// its own `game` state.
//
// Scenarios: the X-Card, `!oracle` producing exactly one card, a player's
// Begin a Session persisting, Burn Momentum applying once, and a player's
// Private Lines reaching campaignState.safety.
//
// Exit code 0 when every scenario passes; 1 otherwise. Failure screenshots
// land in ./artifacts (uploaded by .github/workflows/e2e.yml).

import { chromium } from "playwright";
import {
  MODULE_ID, MODULE_SRC, GM_NAME, STEP_MS, SETTLE_MS,
  sleep, assert, openClient, join, chat, campaignState, cards, newCards, snapshot, logConsoleErrors,
} from "./lib/foundry.mjs";

const PLAYER_NAME = "E2E Player";
const PC_NAME     = "E2E Kira";
const RUN_CAP_MS  = 8 * 60_000;

const results = [];
const log = (...args) => console.log("[multiplayer]", ...args);

// ── scenario runner ──────────────────────────────────────────────────────────

let clients = [];

async function scenario(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err?.message ?? String(err) });
    log(`FAIL  ${name}\n      ${err?.message ?? err}`);
    await snapshot(clients, name, log);
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const browser = await chromium.launch();
  const gm     = await openClient(browser, "gm");
  const player = await openClient(browser, "player");
  clients = [gm, player];

  try {
    await join(gm, GM_NAME, log);

    // GM-side fixtures: the module is active, a player user owning a PC, and
    // the campaign flags the scenarios assert on reset (Quench leaves state).
    const ids = await gm.page.evaluate(async ({ MODULE_ID, PLAYER_NAME, PC_NAME }) => {
      if (!game.modules.get(MODULE_ID)?.active) throw new Error(`${MODULE_ID} is not active in this world — did the Cypress run enable it?`);
      let user = game.users.find(u => u.name === PLAYER_NAME);
      if (!user) user = await User.create({ name: PLAYER_NAME, role: CONST.USER_ROLES.PLAYER });
      const actor = await Actor.create({
        name: PC_NAME, type: "character",
        ownership: { default: 0, [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
      });
      await user.update({ character: actor.id });
      const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
      cs.xCardActive = false;
      cs.sessionActive = false;
      cs.pendingMove = false;
      cs.safety = { ...(cs.safety ?? {}), privateLines: (cs.safety?.privateLines ?? []).filter(e => e.playerId !== user.id) };
      await game.settings.set(MODULE_ID, "campaignState", cs);
      return { gmId: game.user.id, playerId: user.id, actorId: actor.id };
    }, { MODULE_ID, PLAYER_NAME, PC_NAME });
    log("fixtures", JSON.stringify(ids));

    await join(player, PLAYER_NAME, log);

    await scenario("Private Lines: a player's line, added in their settings panel, reaches campaignState.safety", async () => {
      const LINE = "E2E: no spiders";
      await player.page.evaluate(async ({ MODULE_SRC, LINE }) => {
        const { openSettingsPanel } = await import(`${MODULE_SRC}/ui/settingsPanel.js`);
        const app = openSettingsPanel();
        let input = null;
        for (let i = 0; i < 100 && !input; i++) {
          input = app.element?.querySelector?.('[name="newPrivateLine"]') ?? null;
          if (!input) await new Promise(r => setTimeout(r, 100));
        }
        if (!input) throw new Error("the Private Lines input never rendered");
        input.value = LINE;
        app.element.querySelector('[data-action="addPrivateLine"]').click();
        for (let i = 0; i < 50 && !app._lastAction; i++) await new Promise(r => setTimeout(r, 100));
        await app._lastAction;
      }, { MODULE_SRC, LINE });
      await gm.page.waitForFunction(({ MODULE_ID, playerId, LINE }) =>
        (game.settings.get(MODULE_ID, "campaignState")?.safety?.privateLines ?? [])
          .some(e => e.playerId === playerId && e.lines?.includes(LINE)),
      { MODULE_ID, playerId: ids.playerId, LINE }, { timeout: STEP_MS });
    });

    await scenario("X-Card: a player's !x pauses the narrator — recorded on the GM, one card", async () => {
      const before = await cards(gm, "xcardCard");
      await chat(player, "!x");
      await gm.page.waitForFunction((id) => game.settings.get(id, "campaignState")?.xCardActive === true,
        MODULE_ID, { timeout: STEP_MS });
      const added = await newCards(gm, "xcardCard", before);
      assert(added.length === 1, `expected one X-Card card, got ${added.length}`);
      assert(added[0].author === ids.playerId, `X-Card card authored by ${added[0].author}, not the player`);
      assert(added[0].flags.xcardRecorded === true, "the X-Card card says the pause was not recorded");
      await chat(gm, "!x clear");
      await gm.page.waitForFunction((id) => game.settings.get(id, "campaignState")?.xCardActive === false,
        MODULE_ID, { timeout: STEP_MS });
    });

    await scenario("!oracle: a player's roll posts exactly one card, and the GM records it once", async () => {
      const QUESTION = `is the e2e airlock sealed ${Date.now()}`;
      const before = await cards(gm, "oracleCommandCard");
      await chat(player, `!oracle yes ${QUESTION}`);
      const added = await newCards(gm, "oracleCommandCard", before);
      assert(added.length === 1, `expected one oracle card, got ${added.length} (one per client?)`);
      assert(added[0].author === ids.playerId, `oracle card authored by ${added[0].author}, not the player`);
      const onPlayer = (await cards(player, "oracleCommandCard")).filter(c => c.flags.oracleMemory?.question === QUESTION);
      assert(onPlayer.length === 1, `the player's client sees ${onPlayer.length} cards for the roll`);
      const memories = ((await campaignState(gm)).recentOracles ?? []).filter(e => e.question === QUESTION);
      assert(memories.length === 1, `expected one recorded oracle result, got ${memories.length}`);
    });

    await scenario("Burn Momentum: the player and the GM both click — it applies once", async () => {
      const messageId = await gm.page.evaluate(async ({ MODULE_ID, MODULE_SRC, actorId }) => {
        const { buildBurnState, renderBurnButtonHtml } = await import(`${MODULE_SRC}/moves/burnMomentum.js`);
        const actor = game.actors.get(actorId);
        await actor.update({ "system.momentum.value": 8 });
        // A weak hit that 8 momentum turns into a strong hit, as the move
        // pipeline's card offers it (postMoveResult): challenge dice 7 and 3.
        const resolution = {
          _id: `e2e-burn-${Date.now()}`, moveId: "face_danger", moveName: "Face Danger",
          outcome: "weak_hit", outcomeLabel: "Weak Hit", isProgressMove: false,
          challengeDice: [7, 3], consequences: { momentumChange: 0 },
        };
        const burn = buildBurnState(resolution, actor);
        if (!burn?.canBurn) throw new Error(`no burn offered: ${JSON.stringify(burn)}`);
        burn.originalApplied = true;   // the pipeline sets this once the original outcome is persisted
        window.__e2eMomentumWrites = 0;
        Hooks.on("updateActor", (a, changes) => {
          if (a.id === actorId && foundry.utils.hasProperty(changes, "system.momentum.value")) window.__e2eMomentumWrites++;
        });
        const msg = await ChatMessage.create({
          content: `<div class="sf-move-result sf-weak-hit"><div class="sf-move-name">Face Danger</div>`
            + `<div class="sf-move-outcome">Weak Hit</div>${renderBurnButtonHtml(burn)}</div>`,
          flags: { [MODULE_ID]: { moveResolution: true, resolutionId: resolution._id, burn } },
        });
        return msg.id;
      }, { MODULE_ID, MODULE_SRC, actorId: ids.actorId });

      const button = (id) => `[data-message-id="${id}"] [data-action="sf-burn-momentum"]`;
      await player.page.waitForFunction((sel) => !!document.querySelector(sel), button(messageId), { timeout: STEP_MS });
      await gm.page.waitForFunction((sel) => !!document.querySelector(sel), button(messageId), { timeout: STEP_MS });
      // Both click their own copy of the card, back to back.
      await player.page.evaluate((sel) => document.querySelector(sel).click(), button(messageId));
      await gm.page.evaluate((sel) => document.querySelector(sel)?.click(), button(messageId));
      await gm.page.waitForFunction(({ MODULE_ID, messageId }) =>
        game.messages.get(messageId)?.flags?.[MODULE_ID]?.burn?.consumed === true,
      { MODULE_ID, messageId }, { timeout: STEP_MS });
      await sleep(SETTLE_MS);
      // A click after the card re-rendered as spent must do nothing.
      await player.page.evaluate((sel) => document.querySelector(sel)?.click(), button(messageId));
      await sleep(SETTLE_MS);

      const state = await gm.page.evaluate((actorId) => ({
        writes:   window.__e2eMomentumWrites,
        momentum: game.actors.get(actorId)?.system?.momentum?.value,
      }), ids.actorId);
      assert(state.writes === 1, `momentum was written ${state.writes} times (double apply?)`);
      assert(state.momentum === 3, `momentum is ${state.momentum}, expected 3 (reset to 2, +1 for the strong hit)`);
    });

    await scenario("Begin a Session: the dialog opens on the player's screen and the GM records the session", async () => {
      const before = await cards(gm, "sessionLifecycleCard");
      await chat(player, "!begin-session");
      const dialogOpen = () => [...document.querySelectorAll("dialog, .application.dialog")]
        .some(d => /Begin a Session/.test(d.textContent));
      await player.page.waitForFunction(dialogOpen, null, { timeout: STEP_MS });
      await player.page.evaluate(() => {
        const dialog = [...document.querySelectorAll("dialog, .application.dialog")]
          .find(d => /Begin a Session/.test(d.textContent));
        for (const name of ["vignette", "galleyVignette"]) {
          const box = dialog.querySelector(`input[name="${name}"]`);
          if (box) box.checked = false;   // vignettes need a Claude key; CI has none
        }
        dialog.querySelector('button[data-action="ok"]').click();
      });
      await gm.page.waitForFunction((id) => game.settings.get(id, "campaignState")?.sessionActive === true,
        MODULE_ID, { timeout: STEP_MS });
      const gmSawDialog = await gm.page.evaluate(dialogOpen);
      assert(!gmSawDialog, "the Begin a Session dialog also opened on the GM's screen");
      const added = await newCards(gm, "sessionLifecycleCard", before);
      assert(added.length === 1 && added[0].author === ids.playerId,
        `expected one session card from the player, got ${JSON.stringify(added.map(c => c.author))}`);
    });
  } catch (err) {
    results.push({ name: "setup", ok: false, error: err?.message ?? String(err) });
    log(`FAIL  setup\n      ${err?.stack ?? err}`);
    await snapshot(clients, "setup", log);
  } finally {
    const failed = results.filter(r => !r.ok);
    if (failed.length) logConsoleErrors(clients, log);
    log("summary", JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }));
    await browser.close();
    process.exitCode = failed.length || !results.length ? 1 : 0;
  }
}

const cap = setTimeout(() => {
  log(`FAIL  the run exceeded ${RUN_CAP_MS / 60_000} minutes`);
  process.exit(1);
}, RUN_CAP_MS);
cap.unref();

main().catch((err) => {
  log(`FAIL  ${err?.stack ?? err}`);
  process.exitCode = 1;
});
