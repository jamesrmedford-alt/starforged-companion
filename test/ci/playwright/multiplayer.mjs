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
// Begin a Session persisting, Burn Momentum applying once, a player's
// Private Lines reaching campaignState.safety, and a Batch Mode round (the
// window opening in the player's browser, Send now, one round card).
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
const GM_PC_NAME  = "E2E Ren (GM)";
const ROUND_WINDOW = `#${MODULE_ID}-round-window`;
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

    await scenario("Batch Mode round: the window opens on the player's screen, chat is table talk, Send now narrates one round for its roller", async () => {
      try {
        // GM side: Claude answered at the fetch boundary (CI has no key; the
        // keyed canonical GM reads and narrates), a PC of the GM's own — the
        // round then waits for the GM until Send now — and nothing for the
        // player to burn, so the round never waits on an upgrade.
        await gm.page.evaluate(async ({ MODULE_ID, GM_PC_NAME, actorId }) => {
          const real = window.fetch;
          const calls = [];
          window.__e2eBatch = { real, calls, keyBefore: game.settings.get(MODULE_ID, "claudeApiKey"), characterBefore: game.user.character?.id ?? null };
          window.fetch = async (url, init) => {
            const target = typeof url === "string" ? url : url?.url ?? String(url);
            if (!target.includes("api.anthropic.com")) return real(url, init);
            const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
            const system = (body.system ?? []).map(b => b?.text ?? "").join("\n\n");
            const user = (body.messages ?? []).map(m => (typeof m.content === "string"
              ? m.content : (m.content ?? []).map(c => c?.text ?? "").join(""))).join("\n\n");
            calls.push({ system: system.slice(0, 120), user });
            let text;
            if (system.startsWith("You are the pacing pre-classifier")) {
              text = JSON.stringify({ decision: "MOVE", suggestedMove: "face_danger", category: "exploration", confidence: 0.9, reasoning: "E2E" });
            } else if (system.startsWith("You are the move interpreter")) {
              text = JSON.stringify({ moveId: "face_danger", statUsed: "edge", rationale: "E2E: a dash under fire.", mischiefApplied: false, confidence: "high" });
            } else if (system.includes("## RESPONSE FORMAT — MANDATORY SIDECAR")) {
              text = "E2E: the round turns.\n\n```json\n{\"newTruths\":[],\"stateChanges\":[]}\n```";
            } else {
              text = /json/i.test(system) ? "{}" : "E2E: the round turns.";
            }
            return new Response(JSON.stringify({ content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 } }),
              { status: 200, headers: { "Content-Type": "application/json" } });
          };
          await game.settings.set(MODULE_ID, "claudeApiKey", "sk-ant-e2e-batch-stub");
          for (let i = 0; i < 50 && !(game.settings.get(MODULE_ID, "keyedGmUserIds") ?? []).includes(game.user.id); i++) {
            await new Promise(r => setTimeout(r, 100));
          }
          const gmPc = await Actor.create({ name: GM_PC_NAME, type: "character" });
          await game.user.update({ character: gmPc.id });
          await game.actors.get(actorId).update({ "system.momentum.value": 0 });
          const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
          cs.sessionActive = true;
          cs.xCardActive = false;
          cs.pendingMove = false;
          cs.currentSessionId ??= `e2e-batch-${Date.now()}`;
          await game.settings.set(MODULE_ID, "campaignState", cs);
        }, { MODULE_ID, GM_PC_NAME, actorId: ids.actorId });

        // The GM turns the mode on from the toolbar.
        await gm.page.evaluate(async (MODULE_SRC) => {
          let btn = document.querySelector('[data-tool="sfBatchMode"]');
          if (!btn) {
            const { CompanionToolbarApp } = await import(`${MODULE_SRC}/ui/companionToolbar.js`);
            CompanionToolbarApp.open();
            for (let i = 0; i < 50 && !btn; i++) {
              await new Promise(r => setTimeout(r, 100));
              btn = document.querySelector('[data-tool="sfBatchMode"]');
            }
          }
          if (!btn) throw new Error("the GM's toolbar has no Batch Mode switch");
          btn.click();
        }, MODULE_SRC);
        const roundId = await gm.page.waitForFunction(({ MODULE_ID, playerId, gmId }) => {
          const r = game.settings.get(MODULE_ID, "batchMode.round");
          return r?.phase === "collecting" && r.entries?.[playerId] && r.entries?.[gmId] ? r.id : null;
        }, { MODULE_ID, playerId: ids.playerId, gmId: ids.gmId }, { timeout: STEP_MS }).then(h => h.jsonValue());

        // The window opens on the player's screen.
        const box = `${ROUND_WINDOW} textarea[name="sf-round-text"]`;
        await player.page.waitForFunction((sel) => !!document.querySelector(sel), box, { timeout: STEP_MS });

        // A typed line is table talk: not narrated, not rolled — it becomes the window's draft.
        const TALK = "E2E: keep an eye on the corridor behind us.";
        const narratedBefore = (await cards(gm, "narratorCard")).length;
        const rolledBefore = (await cards(gm, "moveResolution")).length;
        await chat(player, TALK);
        await player.page.waitForFunction(({ sel, TALK }) => document.querySelector(sel)?.value === TALK,
          { sel: box, TALK }, { timeout: STEP_MS });
        await sleep(SETTLE_MS);
        assert((await cards(gm, "narratorCard")).length === narratedBefore, "a chat line was narrated while Batch Mode is on");
        assert((await cards(gm, "moveResolution")).length === rolledBefore, "a chat line was rolled while Batch Mode is on");

        // The player submits an action and confirms the reading in the window.
        const ACTION = "E2E: I vault the barricade and sprint for the hatch.";
        await player.page.evaluate(({ win, box, ACTION }) => {
          const input = document.querySelector(box);
          input.value = ACTION;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          document.querySelector(`${win} [data-action="submit"]`).click();
        }, { win: ROUND_WINDOW, box, ACTION });
        const confirm = `${ROUND_WINDOW} [data-action="confirm"]`;
        await player.page.waitForFunction((sel) => !!document.querySelector(sel), confirm, { timeout: STEP_MS });
        await player.page.evaluate((sel) => document.querySelector(sel).click(), confirm);
        await gm.page.waitForFunction(({ MODULE_ID, playerId }) =>
          game.settings.get(MODULE_ID, "batchMode.round")?.entries?.[playerId]?.status === "ready",
        { MODULE_ID, playerId: ids.playerId }, { timeout: STEP_MS });
        const waiting = await gm.page.evaluate((MODULE_ID) => game.settings.get(MODULE_ID, "batchMode.round")?.phase, MODULE_ID);
        assert(waiting === "collecting", `the round should wait for the GM's PC, but it is ${waiting}`);

        // The GM sends it now, without acting.
        const sendNow = `${ROUND_WINDOW} [data-action="sendNow"]`;
        await gm.page.waitForFunction((sel) => !!document.querySelector(sel), sendNow, { timeout: STEP_MS });
        await gm.page.evaluate((sel) => document.querySelector(sel).click(), sendNow);
        await gm.page.waitForFunction(({ MODULE_ID, roundId }) =>
          game.messages.contents.some(m => m.flags?.[MODULE_ID]?.narratorCard && m.flags[MODULE_ID].roundId === roundId),
        { MODULE_ID, roundId }, { timeout: STEP_MS * 2 });
        await sleep(SETTLE_MS);

        const roundCards = (await cards(gm, "narratorCard")).filter(c => c.flags.roundId === roundId);
        assert(roundCards.length === 1, `expected one round card, got ${roundCards.length}`);
        const entries = roundCards[0].flags.roundEntries ?? [];
        assert(entries.length === 1 && entries[0].actorId === ids.actorId,
          `the round card lists ${JSON.stringify(entries.map(e => e.playerName))} — expected the player's PC alone`);
        const results = (await cards(gm, "moveResolution")).filter(c => c.flags.roundId === roundId);
        assert(results.length === 1, `expected one result card for the round, got ${results.length}`);
        assert(results[0].flags.actorId === ids.actorId, `the move was credited to ${results[0].flags.actorId}, not the player's PC`);
        const onPlayer = (await cards(player, "narratorCard")).filter(c => c.flags.roundId === roundId);
        assert(onPlayer.length === 1, `the player's client sees ${onPlayer.length} round cards`);
        const narrations = await gm.page.evaluate(() => window.__e2eBatch.calls.filter(c => c.user.includes("## THIS ROUND")).map(c => c.user));
        assert(narrations.length === 1, `expected one narration request for the round, got ${narrations.length}`);
        assert(narrations[0].includes(PC_NAME), "the round's narration request doesn't name the player's PC");
        assert(!narrations[0].includes(GM_PC_NAME), "the GM's PC, which didn't act, is named in the round's narration request");
        assert(!narrations[0].includes(TALK), "table talk reached the narrator");
        await gm.page.waitForFunction(({ MODULE_ID, roundId }) => {
          const r = game.settings.get(MODULE_ID, "batchMode.round");
          return r && r.id !== roundId && r.phase === "collecting";
        }, { MODULE_ID, roundId }, { timeout: STEP_MS });
      } finally {
        // The mode off (the switch itself, not the toolbar's toggle: a round
        // left collecting after a failure would ask the GM first), the windows
        // closed, and the GM's key, PC and fetch put back.
        await gm.page.evaluate(async ({ MODULE_ID }) => {
          await game.settings.set(MODULE_ID, "batchMode.enabled", false);
          const saved = window.__e2eBatch;
          if (!saved) return;
          await new Promise(r => setTimeout(r, 2500));   // the passes a narration schedules land on the stub
          window.fetch = saved.real;
          await game.settings.set(MODULE_ID, "claudeApiKey", saved.keyBefore ?? "");
          await game.user.update({ character: saved.characterBefore });
          window.__e2eBatch = null;
        }, { MODULE_ID }).catch(err => log(`Batch Mode cleanup failed: ${err?.message ?? err}`));
      }
      await player.page.waitForFunction((sel) => !document.querySelector(sel), ROUND_WINDOW, { timeout: STEP_MS })
        .catch(() => { throw new Error("the player's Round window stayed open after Batch Mode was turned off"); });
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
