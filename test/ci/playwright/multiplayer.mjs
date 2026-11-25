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
// Private Lines reaching campaignState.safety, a Batch Mode round (the
// window opening in the player's browser, Send now, one round card), and a
// Notes-tab removal crossing clients (issue #364: the stamp the player's
// preUpdateActor puts on their edit of an NPC card they own is on the options
// the GM's updateActor receives, and the GM reports the removal).
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
            // The line reader (src/moves/reader.js), the one call that reads a
            // round's line: Face Danger +edge at risk high, which the table
            // rolls at any dial (a round has no density window).
            if (system.startsWith("You are the line reader")) {
              text = JSON.stringify({ move: "face_danger", risk: "high", category: "exploration", confidence: "high", reason: "E2E: a dash under fire.", stat: "edge" });
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

    await scenario("Notes tab: a line the player takes off an NPC card they own reaches the GM's updateActor stamped, and the GM reports it — a line they add is not", async () => {
      // Issue #364 QUENCH-CROSS-CLIENT-STAMP. The notes as they were are
      // readable only where an edit is requested, so the editing client
      // compares them in preUpdateActor and stamps the update's options, and
      // the canonical GM reports `entity_detail_removed` when the stamped
      // update reaches its own updateActor (registry.js
      // registerSheetNotesRemovalHook). Quench (documentHookAssumptions) proves
      // the stamp reaches updateActor on the client that made the edit; this is
      // the hop between two clients.
      const NAME  = `E2E Broker ${Date.now()}`;
      const HELD  = "E2E: keeps a berth at Bleakhold.";
      const LINE  = "E2E-SENTINEL: owes the Iron League a blood debt.";
      const ADDED = "E2E-ADDED: limps since the riots.";
      try {
        // GM side: the settings the case rests on pinned (a new card's creation
        // hook writes nothing to its Notes tab; nothing is reported with the
        // world snapshot switched off), an NPC card as the module makes one — a
        // `character` Actor flagged a connection — with two paragraphs on its
        // Notes tab, the player made its owner, and a probe on every later
        // Notes edit of it: who made it, and whether the module's stamp
        // (registry.js NOTES_LOST_OPTION) was on the options this client got.
        const cardId = await gm.page.evaluate(async ({ MODULE_ID, MODULE_SRC, NAME, HELD, LINE, playerId }) => {
          const { createConnection } = await import(`${MODULE_SRC}/entities/connection.js`);
          const { isCanonicalGM } = await import(`${MODULE_SRC}/multiplayer/gmGate.js`);
          if (!isCanonicalGM()) throw new Error("the GM's page is not the canonical GM — no client would report the removal");
          const saved = window.__e2eNotes = { settingsBefore: {}, edits: [], hookId: null, since: 0 };
          for (const [key, value] of Object.entries({ worldSnapshot: true, autoSeedConnection: false })) {
            const before = game.settings.get(MODULE_ID, key);
            if (before === value) continue;
            saved.settingsBefore[key] = before;
            await game.settings.set(MODULE_ID, key, value);
          }
          await createConnection({ name: NAME, role: "Broker" },
            foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {}));
          const card = game.actors.find(a => a.name === NAME && a.flags?.[MODULE_ID]?.entityType === "connection");
          if (!card) throw new Error("the NPC card was not made");
          await card.update({ "system.notes": `<p>${HELD}</p><p>${LINE}</p>` });
          if (!String(card.system?.notes ?? "").includes(LINE)) throw new Error("the NPC card's Notes tab does not hold the line the GM wrote");
          await card.update({ ownership: { [playerId]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER } });
          saved.hookId = Hooks.on("updateActor", (doc, change, options, userId) => {
            if (doc?.id !== card.id || !foundry.utils.hasProperty(change, "system.notes")) return;
            saved.edits.push({ userId, stamped: options?.[MODULE_ID]?.sheetNotesLostText === true });
          });
          // The events this client reported are read back by time
          // (snapshotEvents.js namedSnapshotCauses): start strictly after any
          // reported while the card was made.
          const started = Date.now();
          while (Date.now() <= started) await new Promise(r => setTimeout(r, 1));
          saved.since = Date.now();
          return card.id;
        }, { MODULE_ID, MODULE_SRC, NAME, HELD, LINE, playerId: ids.playerId });

        // The card, its notes and the ownership reach the player's client: the
        // player's preUpdateActor compares an edit with the notes it holds.
        await player.page.waitForFunction(({ cardId, LINE }) => {
          const card = game.actors.get(cardId);
          return card?.isOwner === true && String(card.system?.notes ?? "").includes(LINE);
        }, { cardId, LINE }, { timeout: STEP_MS })
          .catch(() => { throw new Error("the player's client never held the NPC card as its owner, with the notes the GM wrote"); });

        // An edit made on the player's client, and whether the player's own
        // updateActor got the stamp — which tells a stamp never made from one
        // lost between the clients when the GM's did not get it.
        const playerWrites = (notes) => player.page.evaluate(async ({ MODULE_ID, cardId, notes }) => {
          const card = game.actors.get(cardId);
          const own = [];
          const hook = Hooks.on("updateActor", (doc, _change, options) => {
            if (doc?.id === cardId) own.push(options?.[MODULE_ID]?.sheetNotesLostText === true);
          });
          try {
            await card.update({ "system.notes": notes });
          } finally {
            Hooks.off("updateActor", hook);
          }
          return { stamped: own.includes(true), notes: String(card.system?.notes ?? "") };
        }, { MODULE_ID, cardId, notes });
        // The GM's probe has seen `n` Notes edits made by the player.
        const gmSeesPlayerEdits = (n) => gm.page.waitForFunction(({ playerId, n }) =>
          (window.__e2eNotes?.edits ?? []).filter(e => e.userId === playerId).length >= n,
        { playerId: ids.playerId, n }, { timeout: STEP_MS })
          .catch(() => { throw new Error(`the GM's updateActor never fired for the player's Notes edit (waiting for ${n})`); });
        // What the GM's client holds: the player's edits as its updateActor
        // got them, and whether it reported a detail removed since the start
        // (`onRecord`: every event it has reported, for a failure's message).
        const onGm = () => gm.page.evaluate(async ({ MODULE_SRC, playerId }) => {
          const { namedSnapshotCauses } = await import(`${MODULE_SRC}/narration/snapshotEvents.js`);
          const saved = window.__e2eNotes;
          return {
            edits: saved.edits.filter(e => e.userId === playerId),
            removalReported: namedSnapshotCauses([], { sinceMs: saved.since }).includes("entity_detail_removed"),
            onRecord: namedSnapshotCauses([], { sinceMs: 0 }),
          };
        }, { MODULE_SRC, playerId: ids.playerId });

        // The control: the player adds a paragraph — nothing is taken off.
        const added = await playerWrites(`<p>${HELD}</p><p>${LINE}</p><p>${ADDED}</p>`);
        assert(added.notes.includes(ADDED) && added.notes.includes(LINE), "the paragraph the player added is not on the Notes tab");
        await gmSeesPlayerEdits(1);
        const afterAdd = await onGm();
        assert(!afterAdd.edits.some(e => e.stamped), "an edit that only adds text reached the GM's updateActor stamped as a removal");
        assert(!afterAdd.removalReported, "the GM reported a detail removed for an edit that only adds text");

        // The player takes a paragraph off.
        const removed = await playerWrites(`<p>${HELD}</p><p>${ADDED}</p>`);
        assert(!removed.notes.includes(LINE), "the line the player took off is still on the Notes tab");
        await gmSeesPlayerEdits(afterAdd.edits.length + 1);
        const afterRemove = await onGm();
        assert(afterRemove.edits.slice(afterAdd.edits.length).some(e => e.stamped),
          `the player's edit reached the GM's updateActor without the stamp — ${removed.stamped
            ? "the player's own updateActor got it, so it was lost between the clients"
            : "the player's own updateActor did not get it either: their preUpdateActor never stamped the edit"}`);
        assert(afterRemove.removalReported, "the canonical GM did not report entity_detail_removed for the line the player took off"
          + ` (events its client has reported in all: ${afterRemove.onRecord.join(", ") || "none"})`);
      } finally {
        // The probe off, the card deleted — the delete hook's teardown takes
        // its id off connectionIds (connection.js onConnectionActorDeleted):
        // wait for it to land — and the pinned settings put back.
        const cleaned = await gm.page.evaluate(async ({ MODULE_ID, NAME }) => {
          const saved = window.__e2eNotes;
          window.__e2eNotes = null;
          if (saved?.hookId != null) Hooks.off("updateActor", saved.hookId);
          const out = { deleted: false, tornDown: true };
          try {
            const card = game.actors.find(a => a.name === NAME && a.flags?.[MODULE_ID]?.entityType === "connection");
            if (card) {
              const cardId = card.id;
              await card.delete();
              out.deleted = true;
              const listed = () => (game.settings.get(MODULE_ID, "campaignState")?.connectionIds ?? []).includes(cardId);
              for (let i = 0; i < 100 && listed(); i++) await new Promise(r => setTimeout(r, 50));
              out.tornDown = !listed();
            }
          } finally {
            for (const [key, value] of Object.entries(saved?.settingsBefore ?? {})) await game.settings.set(MODULE_ID, key, value);
          }
          return out;
        }, { MODULE_ID, NAME }).catch(err => { log(`Notes tab cleanup failed: ${err?.message ?? err}`); return null; });
        if (cleaned?.deleted && !cleaned.tornDown) log("Notes tab cleanup: the deleted NPC card's id is still in connectionIds");
      }
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
