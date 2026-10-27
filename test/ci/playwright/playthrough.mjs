// Scripted playthroughs — a GM and a player play short sessions in two real
// browsers, and the GM's client narrates through the real pipeline (issue #290
// part 2). Claude is answered from each scenario's recorded replies, so CI
// needs no key (lib/claude.mjs).
//
// Scenarios are data (playthroughs/*.json): a world seed, the settings the run
// pins, and steps — the player's turns with scripted dice, the GM's clicks, and
// the checks to make in the GM's world afterwards. Part 3's AI playtester
// reuses the same format.
//
// A scenario marked `"strict": true` (issue #302 slice A) names every step
// (`id`) and declares the Claude calls each step makes: `calls` (required, each
// with an optional prompt contract) and `optionalCalls` (allowed; the
// scenario's own `optionalCalls` apply to every step). After each step the
// runner checks them: a required call that never happened, was answered by the
// stub, or breaks its contract fails the step, and so does a call nothing
// declared. A permissive scenario only reports such drift.
//
// Modes (PLAYTHROUGH_MODE):
//   replay (default) — answer Claude from recordings/<scenario>.json;
//   record           — answer Claude from Anthropic with ANTHROPIC_API_KEY and
//                      write recordings/<scenario>.json. Run it outside CI
//                      (test/ci/scripts/e2e.sh --record-playthroughs) and
//                      commit the result; re-record when a prompt changes. A
//                      run that fails writes nothing there: its capture goes
//                      to artifacts/recordings/<scenario>.rejected.json.
// PLAYTHROUGH=<name> runs one scenario.
//
// Runs after the multiplayer suite (scripts/e2e.sh), against the same live
// world. Each scenario starts by clearing what earlier suites left — chat,
// actors, journals, campaign state — so a replay meets the world its recording
// met. Exit code 0 when every scenario passes; 1 otherwise. Failure
// screenshots and the run's Claude request log land in ./artifacts. Each
// result says separately whether the replay was valid, whether the checks
// passed, and that the narrator's prose quality was not assessed.

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import {
  MODULE_ID, MODULE_SRC, GM_NAME, ARTIFACTS, STEP_MS,
  sleep, assert, openClient, join, chat, snapshot, logConsoleErrors,
} from "./lib/foundry.mjs";
import {
  createClaudeHarness, PAGE_KEY, SETUP_STEP, AFTER_STEP,
  recordingProblem, scenarioRevision, stepId, validateScenario,
} from "./lib/claude.mjs";

const MODE          = process.env.PLAYTHROUGH_MODE === "record" ? "record" : "replay";
const ONLY          = process.env.PLAYTHROUGH || null;
const SCENARIO_DIR  = path.resolve("playthroughs");
const RECORDING_DIR = path.resolve("recordings");
const PLAYER_NAME   = "Playthrough Player";
const CHECK_MS      = 20_000;
const RUN_CAP_MS    = 12 * 60_000;

const results = [];
const log = (...args) => console.log("[playthrough]", ...args);

// ── page hooks ───────────────────────────────────────────────────────────────

/**
 * Scripted dice (GM page, before any script). The resolver rolls with
 * Math.random inside rollDie (src/moves/resolver.js) — challenge dice first,
 * then the action die. While window.__sfcDice holds values, a call made
 * directly from rollDie takes the next one; every other caller (ids, oracle
 * tables) gets real randomness.
 */
function installDiceScript() {
  const realRandom = Math.random;
  Math.random = function sfcPlaythroughRandom() {
    const queue = window.__sfcDice;
    if (Array.isArray(queue) && queue.length) {
      const limit = Error.stackTraceLimit;
      Error.stackTraceLimit = 4;
      const caller = (new Error().stack || "").split("\n")[2] || "";
      Error.stackTraceLimit = limit;
      if (/\brollDie\b/.test(caller) && caller.includes("/moves/resolver.js")) return queue.shift();
    }
    return realRandom();
  };
}

/** A die face as the uniform value that rolls it: Math.floor(u * faces) + 1 === face. */
const uniformFor = (face, faces) => (face - 0.5) / faces;

function diceQueue(dice) {
  if (!dice) return [];
  const [c1, c2] = dice.challenge ?? [];
  assert(Number.isInteger(c1) && Number.isInteger(c2) && Number.isInteger(dice.action),
    `dice need challenge: [d10, d10] and action: d6 — got ${JSON.stringify(dice)}`);
  return [uniformFor(c1, 10), uniformFor(c2, 10), uniformFor(dice.action, 6)];
}

// ── GM-side world setup ──────────────────────────────────────────────────────

/** Clear what earlier suites left behind, pin the scenario's settings, seed its world. */
async function setUpWorld(gm, scenario) {
  return gm.page.evaluate(async ({ MODULE_ID, MODULE_SRC, PLAYER_NAME, PAGE_KEY, scenario }) => {
    if (!game.modules.get(MODULE_ID)?.active) throw new Error(`${MODULE_ID} is not active in this world — did the Cypress run enable it?`);

    // A fresh world: no chat, actors or journals from earlier suites (the help
    // journal stays), and the campaign state's registered default.
    const drop = async (cls, docs) => { if (docs.length) await cls.deleteDocuments(docs.map(d => d.id)); };
    await drop(CONFIG.ChatMessage.documentClass, game.messages.contents);
    await drop(CONFIG.Actor.documentClass, game.actors.contents);
    await drop(CONFIG.JournalEntry.documentClass, game.journal.contents.filter(j => !/help/i.test(j.name)));
    await drop(CONFIG.Scene.documentClass, game.scenes.contents.filter(sc => sc.flags?.[MODULE_ID]?.sectorScene));
    const fresh = game.settings.settings.get(`${MODULE_ID}.campaignState`)?.default ?? {};
    await game.settings.set(MODULE_ID, "campaignState", foundry.utils.deepClone(fresh));

    // Pinned settings, restored after the run.
    const restore = {};
    for (const [key, value] of Object.entries(scenario.settings ?? {})) {
      restore[key] = game.settings.get(MODULE_ID, key);
      await game.settings.set(MODULE_ID, key, value);
    }
    // The GM holds the Claude key (a placeholder: replies come from the
    // harness) — the keyed canonical GM runs the narrator.
    restore.claudeApiKey = game.settings.get(MODULE_ID, "claudeApiKey");
    await game.settings.set(MODULE_ID, "claudeApiKey", PAGE_KEY);
    for (let i = 0; i < 50 && !(game.settings.get(MODULE_ID, "keyedGmUserIds") ?? []).includes(game.user.id); i++) {
      await new Promise(r => setTimeout(r, 100));
    }
    window.__sfcRestore = restore;

    // The seed: a player owning a PC, the command vehicle, where they are.
    const seed = scenario.seed ?? {};
    let user = game.users.find(u => u.name === PLAYER_NAME);
    if (!user) user = await User.create({ name: PLAYER_NAME, role: CONST.USER_ROLES.PLAYER });
    const pc = await Actor.create({
      name:      seed.pc.name,
      type:      "character",
      system:    { pronouns: seed.pc.pronouns ?? "", ...(seed.pc.stats ?? {}) },
      ownership: { default: 0, [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
    });
    await user.update({ character: pc.id });

    const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
    let sectorId = null;
    if (seed.sector) {
      sectorId = "playthrough-sector";
      cs.sectors = [{ id: sectorId, ...seed.sector }];
      cs.activeSectorId = sectorId;
    }
    let shipActorId = null;
    if (seed.ship) {
      const { createShip } = await import(`${MODULE_SRC}/entities/ship.js`);
      await createShip({ name: seed.ship.name, isCommandVehicle: true }, cs);
      shipActorId = cs.shipIds.at(-1);
    }
    const settlementIds = {};
    if (seed.settlements?.length) {
      const { createSettlement } = await import(`${MODULE_SRC}/entities/settlement.js`);
      for (const { pin: _pin, ...data } of seed.settlements) {
        await createSettlement({ ...data, sectorId }, cs, { persist: false });
        settlementIds[data.name] = cs.settlementIds.at(-1);
      }
      if (settlementIds[seed.at]) {
        cs.currentLocationId   = settlementIds[seed.at];
        cs.currentLocationType = "settlement";
      }
    }
    await game.settings.set(MODULE_ID, "campaignState", cs);

    // The sector map: a pin per settlement and the command vehicle's token
    // on `seed.map.shipAt` — placing it records where the ship is (the
    // createToken hook, v1.7.10 F5).
    if (seed.map) {
      const scene = await CONFIG.Scene.documentClass.create({
        name: `${seed.sector?.name ?? "Sector"} (playthrough)`, width: 2000, height: 1200, padding: 0,
        grid: { size: 100 },
        flags: { [MODULE_ID]: { sectorScene: true, sectorId } },
      });
      await scene.createEmbeddedDocuments("Note", seed.settlements.filter(s => s.pin).map(s => ({
        x: s.pin[0], y: s.pin[1], text: s.name,
        flags: { [MODULE_ID]: { settlementId: settlementIds[s.name], actorId: settlementIds[s.name] } },
      })));
      const at = seed.settlements.find(s => s.name === seed.map.shipAt)?.pin;
      if (shipActorId && at) {
        const ship = game.actors.get(shipActorId);
        const token = await ship.getTokenDocument({ x: at[0], y: at[1] });
        await scene.createEmbeddedDocuments("Token", [token.toObject()]);
      }
    }
    return { gmId: game.user.id, playerId: user.id, pcId: pc.id };
  }, { MODULE_ID, MODULE_SRC, PLAYER_NAME, PAGE_KEY, scenario });
}

async function restoreWorld(gm) {
  await gm.page.evaluate(async (MODULE_ID) => {
    for (const [key, value] of Object.entries(window.__sfcRestore ?? {})) {
      await game.settings.set(MODULE_ID, key, value).catch(() => {});
    }
  }, MODULE_ID).catch(err => log(`restoring settings failed: ${err?.message ?? err}`));
}

// ── waiting on the GM's world ────────────────────────────────────────────────

/** Ids of the messages a client holds now — the "before" of a step. */
const messageIds = (client) => client.page.evaluate(() => game.messages.contents.map(m => m.id));

/** Wait for a new message (not in `before`) whose module flags pass `test` (a function body over `f`). */
async function waitForCard(client, before, test, label, timeout = STEP_MS) {
  try {
    return await client.page.waitForFunction(({ MODULE_ID, before, test }) => {
      const pass = new Function("f", `return (${test});`);
      const msg = game.messages.contents.find(m => !before.includes(m.id) && m.flags?.[MODULE_ID] && pass(m.flags[MODULE_ID]));
      return msg ? { id: msg.id, flags: msg.flags[MODULE_ID] } : null;
    }, { MODULE_ID, before, test }, { timeout }).then(h => h.jsonValue());
  } catch {
    throw new Error(`timed out waiting for ${label}`);
  }
}

const gmState = (gm) => gm.page.evaluate((id) => game.settings.get(id, "campaignState") ?? {}, MODULE_ID);

async function waitForState(gm, test, label, timeout = STEP_MS) {
  try {
    await gm.page.waitForFunction(({ MODULE_ID, test }) =>
      new Function("cs", `return (${test});`)(game.settings.get(MODULE_ID, "campaignState") ?? {}),
    { MODULE_ID, test }, { timeout });
  } catch {
    throw new Error(`timed out waiting for ${label}`);
  }
}

/** Retry `fn` (which throws on failure) until it passes or `timeout` runs out. */
async function eventually(fn, timeout = CHECK_MS) {
  const deadline = Date.now() + timeout;
  let lastErr = null;
  while (Date.now() < deadline) {
    try { return await fn(); } catch (err) { lastErr = err; }
    await sleep(500);
  }
  throw lastErr ?? new Error("check never passed");
}

// ── session dialogs (the player's screen) ────────────────────────────────────

async function submitDialog(client, title, fill) {
  const open = (t) => [...document.querySelectorAll("dialog, .application.dialog")].some(d => d.textContent.includes(t));
  await client.page.waitForFunction(open, title, { timeout: STEP_MS });
  await client.page.evaluate(({ title, fill }) => {
    const dialog = [...document.querySelectorAll("dialog, .application.dialog")].find(d => d.textContent.includes(title));
    for (const [name, value] of Object.entries(fill)) {
      const input = dialog.querySelector(`input[name="${name}"]`);
      if (!input) continue;
      if (input.type === "checkbox") input.checked = !!value;
      else input.value = String(value);
    }
    dialog.querySelector('button[data-action="ok"]').click();
  }, { title, fill });
}

// ── moves ────────────────────────────────────────────────────────────────────

/** The command vehicle's token on the sector map, as the GM's world holds it. */
const shipTokenAt = (gm) => gm.page.evaluate((MODULE_ID) => {
  const scene = game.scenes.find(sc => sc.flags?.[MODULE_ID]?.sectorScene);
  const token = scene?.tokens.find(t => t.flags?.[MODULE_ID]?.commandVehicle);
  return token ? { x: token.x, y: token.y } : null;
}, MODULE_ID);

/**
 * The GM's half of a move: the confirmation dialog (its proposed move checked,
 * `beforeAccept` run while it is open), then the narration, the scripted dice
 * all rolled, the outcome, and the move lock released.
 */
async function resolveMove(ctx, step, before, beforeAccept = null) {
  const dialog = ctx.gm.page.locator(".move-confirm-dialog").last();
  await dialog.waitFor({ state: "visible", timeout: STEP_MS }).catch(() => {
    throw new Error("the GM never got the move confirmation dialog");
  });
  const moveId = await dialog.locator(".confirm-move-id").getAttribute("data-move-id");
  if (step.move) assert(moveId === step.move, `the dialog proposes ${moveId}, the scenario expects ${step.move}`);
  if (beforeAccept) await beforeAccept();
  // A DOM click, as on the cards: no hit-testing against notifications
  // that may overlap the window.
  await dialog.locator('[data-action="accept"]').evaluate(el => el.click());

  const card = await waitForCard(ctx.gm, before, "f.narratorCard === true && !!f.moveId", "the move's narration", STEP_MS * 2);
  const left = await ctx.gm.page.evaluate(() => (window.__sfcDice ?? []).length);
  assert(left === 0, `${left} scripted dice were never rolled — did the resolver stop using rollDie?`);
  if (step.outcome) assert(card.flags.outcome === step.outcome, `the move resolved ${card.flags.outcome}, the scenario expects ${step.outcome}`);
  await waitForState(ctx.gm, "cs.pendingMove !== true", "the move lock to release");
}

// ── steps ────────────────────────────────────────────────────────────────────

const STEPS = {
  /** `!begin-session` on the player's screen; waits for the opening vignette when asked for. */
  async beginSession(ctx, step) {
    const actor = ctx.client(step.as);
    const before = await messageIds(ctx.gm);
    await chat(actor, "!begin-session");
    await submitDialog(actor, "Begin a Session", { vignette: !!step.spotlight, galleyVignette: step.galley !== false });
    await waitForState(ctx.gm, "cs.sessionActive === true", "the session to start");
    if (step.galley !== false) {
      await waitForCard(ctx.gm, before, "f.sessionVignetteCard === true && f.vignetteKind === 'galley_begin'", "the opening galley vignette");
    }
  },

  /** `!end-session` on the player's screen, with the foci the step names. */
  async endSession(ctx, step) {
    const actor = ctx.client(step.as);
    const before = await messageIds(ctx.gm);
    await chat(actor, "!end-session");
    await submitDialog(actor, "End a Session", { questFocus: step.questFocus ?? "", connectionFocus: step.connectionFocus ?? "" });
    await waitForState(ctx.gm, "cs.sessionActive === false", "the session to end");
    if (step.closingVignette !== false) {
      await waitForCard(ctx.gm, before, "f.sessionVignetteCard === true && f.vignetteKind !== 'galley_begin'", "the closing vignette");
    }
  },

  /** A player's line the pipeline resolves as a move: the GM confirms it, the dice are scripted. */
  async move(ctx, step) {
    const actor = ctx.client(step.as);
    const before = await messageIds(ctx.gm);
    await ctx.gm.page.evaluate((q) => { window.__sfcDice = q; }, diceQueue(step.dice));
    await chat(actor, step.text);
    await resolveMove(ctx, step, before);
  },

  /**
   * Drag the command vehicle's token onto a settlement's pin on the sector
   * map. The drop is cancelled and becomes a Set a Course (sectorSceneHooks
   * handleCommandVehicleTokenDrag); the token stays where it was until the
   * move resolves, and moves to the pin on a hit.
   */
  async dragShip(ctx, step) {
    const actor = ctx.client(step.as ?? "gm");
    const before = await messageIds(ctx.gm);
    await ctx.gm.page.evaluate((q) => { window.__sfcDice = q; }, diceQueue(step.dice));
    const from = await actor.page.evaluate(async ({ MODULE_ID, to }) => {
      const scene = game.scenes.find(sc => sc.flags?.[MODULE_ID]?.sectorScene);
      const token = scene?.tokens.find(t => t.flags?.[MODULE_ID]?.commandVehicle);
      const pin = scene?.notes.find(n => n.text === to);
      if (!token || !pin) throw new Error(`no ship token or no "${to}" pin on the sector map`);
      const at = { x: token.x, y: token.y };
      await token.update({ x: pin.x, y: pin.y });
      return at;
    }, { MODULE_ID, to: step.to });
    await resolveMove(ctx, { ...step, move: "set_a_course" }, before, async () => {
      const now = await shipTokenAt(ctx.gm);
      assert(now && now.x === from.x && now.y === from.y,
        `the ship token moved to ${JSON.stringify(now)} before the move resolved (it was at ${JSON.stringify(from)})`);
    });
  },

  /** A player's line the pacing classifier sends to the narrator without a roll. */
  async say(ctx, step) {
    const actor = ctx.client(step.as);
    const before = await messageIds(ctx.gm);
    await chat(actor, step.text);
    await waitForCard(ctx.gm, before, "f.narratorCard === true && f.pacedNarrative === true", "the paced narration");
  },

  /** The GM confirms the pending draft for `name` on the "New Entities Detected" card. */
  async confirmDraft(ctx, step) {
    const target = await ctx.gm.page.waitForFunction(({ MODULE_ID, name }) => {
      for (const m of game.messages.contents) {
        const d = (m.flags?.[MODULE_ID]?.drafts ?? []).find(x => x.name === name && x.status === "pending");
        if (m.flags?.[MODULE_ID]?.draftEntityCard && d) return { id: m.id, index: d.index, type: d.type };
      }
      return null;
    }, { MODULE_ID, name: step.name }, { timeout: STEP_MS }).then(h => h.jsonValue()).catch(() => {
      throw new Error(`no pending draft for "${step.name}" was posted`);
    });
    const selector = `[data-message-id="${target.id}"] [data-action="sf-draft-confirm"][data-index="${target.index}"]`;
    await ctx.gm.page.waitForFunction((sel) => !!document.querySelector(sel), selector, { timeout: STEP_MS });
    await ctx.gm.page.evaluate((sel) => document.querySelector(sel).click(), selector);
    await ctx.gm.page.waitForFunction(({ MODULE_ID, name }) =>
      game.actors.some(a => a.name === name && a.flags?.[MODULE_ID]?.entityType),
    { MODULE_ID, name: step.name }, { timeout: STEP_MS }).catch(() => {
      throw new Error(`confirming "${step.name}" created no entity card`);
    });
    if (step.type) assert(target.type === step.type, `"${step.name}" was drafted as ${target.type}, the scenario expects ${step.type}`);
  },

  /**
   * Build a Private Channel turn in the player's own browser, without sending
   * it (#289's open question: can a player's client read the cards of NPCs it
   * doesn't own?).
   */
  async privateChannel(ctx, step) {
    const actor = ctx.client(step.as ?? "player");
    const found = await actor.page.evaluate(async ({ MODULE_ID, MODULE_SRC, message, npc }) => {
      const { buildPrivateContext } = await import(`${MODULE_SRC}/private-channel/context.js`);
      const card = game.actors.find(a => a.name === npc);
      const built = await buildPrivateContext({
        campaignState: game.settings.get(MODULE_ID, "campaignState"),
        userId: game.user.id, actorId: game.user.character?.id ?? null,
        transcriptTurns: [], playerMessage: message,
      });
      const heading = `## ${npc.toUpperCase()}`;
      return {
        inPlayersWorld: !!card,
        permission:     card ? card.permission : null,
        carriesCard:    built.system.includes(heading) || built.user.includes(heading),
        headings:       `${built.system}\n${built.user}`.split("\n").filter(l => /^##\s/.test(l)).map(l => l.slice(3)),
      };
    }, { MODULE_ID, MODULE_SRC, message: step.message, npc: step.npc });
    log(`FINDING private channel: the player's client ${found.inPlayersWorld ? `holds "${step.npc}" (permission ${found.permission})` : `does not hold "${step.npc}"`}; `
      + `the prompt ${found.carriesCard ? "carries" : "does not carry"} the card. Sections: ${found.headings.join(" | ")}`);
    ctx.findings.push({ step: "privateChannel", npc: step.npc, ...found });
    if (typeof step.expectCard === "boolean") {
      assert(found.carriesCard === step.expectCard,
        `the private prompt ${found.carriesCard ? "carries" : "lacks"} ${step.npc}'s card — the scenario expects it ${step.expectCard ? "carried" : "absent"}`);
    }
    for (const heading of step.carries ?? []) {
      assert(found.headings.some(h => h === heading || h.startsWith(`${heading} `)), `the private prompt lacks ${heading}`);
    }
  },

  /** Run checks (each retried until it passes or CHECK_MS runs out). */
  async expect(ctx, step) {
    for (const check of step.checks ?? []) await runCheck(ctx, check);
  },
};

// ── checks ───────────────────────────────────────────────────────────────────

/** The entity card named `name`, as the GM's world holds it. */
const entityCard = (gm, name) => gm.page.evaluate(({ MODULE_ID, name }) => {
  const actor = game.actors.find(a => a.name === name && a.flags?.[MODULE_ID]?.entityType);
  if (!actor) return null;
  const type = actor.flags[MODULE_ID].entityType;
  const record = actor.flags[MODULE_ID][type] ?? {};
  return {
    id: actor.id, type,
    sheetClass:  actor.getFlag("core", "sheetClass") ?? null,
    sheetName:   (() => { try { return actor.sheet?.constructor?.name ?? null; } catch { return null; } })(),
    description: record.description ?? "",
    pronouns:    record.pronouns ?? "",
    details:     (record.generativeTier ?? []).map(e => e.detail),
    lastKnown:   record.lastKnown ?? {},
  };
}, { MODULE_ID, name });

const CHECKS = {
  /** No move holds the pipeline lock (PLAYTEST-1712 M, N). */
  async moveLockReleased(ctx) {
    const cs = await gmState(ctx.gm);
    assert(cs.pendingMove !== true, "campaignState.pendingMove is still set");
  },

  /** A scene truth about `about` is in the ledger — keyed to its entity once it has a card. */
  async ledgerTruth(ctx, c) {
    const cs = await gmState(ctx.gm);
    const card = await entityCard(ctx.gm, c.about);
    const truths = (cs.sceneTruths ?? []).filter(t => !t.retracted);
    const hit = truths.find(t => (card && t.subject?.kind === "entity" && t.subject.entityId === card.id)
      || (t.subject?.kind === "text" && String(t.subject.text ?? "").toLowerCase() === c.about.toLowerCase()));
    assert(hit, `no scene truth about ${c.about} — the ledger holds: ${truths.map(t => `${JSON.stringify(t.subject)} ${t.fact}`).join(" | ") || "(nothing)"}`);
    if (c.entityKeyed) assert(hit.subject.kind === "entity", `the truth about ${c.about} is still keyed to the text, not the card`);
    for (const text of c.includes ?? []) assert(String(hit.fact).includes(text), `the truth about ${c.about} should say "${text}" — it says "${hit.fact}"`);
  },

  /** The entity card: its type, sheet, the description the draft carried, the narrator's details, where it was last. */
  async npcCard(ctx, c) {
    const card = await entityCard(ctx.gm, c.name);
    assert(card, `no entity card named ${c.name}`);
    if (c.type) assert(card.type === c.type, `${c.name} is a ${card.type}, expected ${c.type}`);
    if (c.sheet === "starforged") {
      assert(card.sheetClass === "ironsworn.StarforgedCharacterSheet",
        `${c.name} opens with ${card.sheetClass ?? "the system default"} (${card.sheetName}), not the Starforged sheet (v1.7.10 F1)`);
    }
    if (c.description) assert(card.description.trim().length > 0, `${c.name}'s record has an empty description (v1.6.1 F19)`);
    for (const text of c.descriptionIncludes ?? []) assert(card.description.includes(text), `${c.name}'s description should say "${text}" — it says "${card.description}"`);
    if (c.details) assert(card.details.length >= c.details, `${c.name} has ${card.details.length} narrator-added detail(s), expected at least ${c.details}`);
    for (const text of c.detailsInclude ?? []) {
      assert(card.details.some(d => d.includes(text)), `${c.name}'s details should mention "${text}" — they are: ${card.details.join(" | ") || "(none)"}`);
    }
    for (const attribute of c.lastKnown ?? []) {
      assert(String(card.lastKnown?.[attribute]?.value ?? "").trim(),
        `${c.name} has no last-known ${attribute} — LAST KNOWN holds ${JSON.stringify(card.lastKnown)}`);
    }
  },

  /** No draft was proposed for `name` — a PC is never offered as a new connection (PLAYTEST-1712 F). */
  async noDraftFor(ctx, c) {
    const offered = await ctx.gm.page.evaluate(({ MODULE_ID, name }) => game.messages.contents
      .flatMap(m => m.flags?.[MODULE_ID]?.draftEntityCard ? (m.flags[MODULE_ID].drafts ?? []) : [])
      .filter(d => String(d.name ?? "").toLowerCase() === name.toLowerCase())
      .map(d => d.type), { MODULE_ID, name: c.name });
    assert(!offered.length, `${c.name} was offered as a new ${offered.join(", ")}`);
  },

  /** The Session Log page for session `session` exists and carries the session's summary (v1.6.1 F18). */
  async sessionLog(ctx, c) {
    const page = await ctx.gm.page.evaluate(({ MODULE_ID, session }) => {
      const journal = game.journal.find(j => j.name === "World Journal — Session Log");
      const p = journal?.pages?.contents?.find(x => x.flags?.[MODULE_ID]?.sessionLogPage?.sessionNumber === session) ?? null;
      return p ? { content: p.text?.content ?? "", narrative: p.flags[MODULE_ID].sessionLogPage.summary?.narrative ?? "" } : null;
    }, { MODULE_ID, session: c.session });
    assert(page, `no Session Log page for session ${c.session}`);
    assert(page.narrative.trim(), `the Session Log page for session ${c.session} has no summary`);
    assert(page.content.includes("Session summary"), `the Session Log page for session ${c.session} doesn't render its summary`);
  },

  /** An actor's momentum — a PC-only grant never reaches an NPC card (PLAYTEST-176). */
  async momentum(ctx, c) {
    const value = await ctx.gm.page.evaluate((name) => {
      const actor = game.actors.find(a => a.name === name);
      return actor ? actor.system?.momentum?.value ?? null : undefined;
    }, c.of);
    assert(value !== undefined, `no actor named ${c.of}`);
    assert(value === c.is, `${c.of} has momentum ${value}, expected ${c.is}`);
  },

  /** A World Journal page exists and its body isn't empty (v1.6.1 F15). */
  async journalPage(ctx, c) {
    const page = await ctx.gm.page.evaluate(({ journal, page }) => {
      const j = game.journal.find(x => x.name === journal);
      const p = j?.pages?.contents?.find(x => x.name === page) ?? null;
      return p ? { text: String(p.text?.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() } : null;
    }, { journal: c.journal, page: c.page });
    assert(page, `no "${c.page}" page in ${c.journal}`);
    assert(page.text.replace(c.page, "").trim().length > 0, `the "${c.page}" page in ${c.journal} has an empty body`);
    for (const text of c.bodyIncludes ?? []) assert(page.text.includes(text), `the "${c.page}" page should say "${text}"`);
  },

  /**
   * The command vehicle's position record is at `at` (v1.7.10 F5). Which writer
   * wrote it last isn't checked: a recorded narration may report the ship's
   * position itself (the sidecar's ship stateChange) after the move's own
   * write. The move's write is pinned by the narration request it precedes
   * (the step's call contract for the SHIP POSITION line).
   */
  async shipPosition(ctx, c) {
    const pos = await ctx.gm.page.evaluate(async ({ MODULE_ID, MODULE_SRC }) => {
      const { getCommandVehicle } = await import(`${MODULE_SRC}/entities/ship.js`);
      const position = getCommandVehicle(game.settings.get(MODULE_ID, "campaignState"))?.position ?? null;
      if (!position) return null;
      return { ...position, settlement: game.actors.get(position.nearestSettlementId)?.name ?? null };
    }, { MODULE_ID, MODULE_SRC });
    assert(pos, "the command vehicle has no position record");
    assert(pos.settlement === c.at, `the ship's position is ${pos.settlement ?? (pos.freeText || "unset")}, expected ${c.at}`);
  },

  /** The command vehicle's token sits on `at`'s pin on the sector map. */
  async shipToken(ctx, c) {
    const found = await ctx.gm.page.evaluate(({ MODULE_ID, at }) => {
      const scene = game.scenes.find(sc => sc.flags?.[MODULE_ID]?.sectorScene);
      const token = scene?.tokens.find(t => t.flags?.[MODULE_ID]?.commandVehicle);
      const pin = scene?.notes.find(n => n.text === at);
      return { token: token ? { x: token.x, y: token.y } : null, pin: pin ? { x: pin.x, y: pin.y } : null };
    }, { MODULE_ID, at: c.at });
    assert(found.token, "no command-vehicle token on the sector map");
    assert(found.pin, `no "${c.at}" pin on the sector map`);
    assert(found.token.x === found.pin.x && found.token.y === found.pin.y,
      `the ship token is at ${JSON.stringify(found.token)}, ${c.at}'s pin at ${JSON.stringify(found.pin)}`);
  },

  /** campaignState's current location (what `!at` and an arrival write). */
  async currentLocation(ctx, c) {
    const name = await ctx.gm.page.evaluate((MODULE_ID) => {
      const id = game.settings.get(MODULE_ID, "campaignState")?.currentLocationId ?? null;
      return id ? (game.actors.get(id)?.name ?? `(unresolved ${id})`) : null;
    }, MODULE_ID);
    assert(name === c.is, `the current location is ${name ?? "unset"}, expected ${c.is}`);
  },

  /** `count` cards carry `flags[MODULE_ID][flag]` (outcome-filtered when given). */
  async card(ctx, c) {
    const n = await ctx.gm.page.evaluate(({ MODULE_ID, flag, outcome }) => game.messages.contents
      .filter(m => m.flags?.[MODULE_ID]?.[flag] && (!outcome || m.flags[MODULE_ID].outcome === outcome)).length,
    { MODULE_ID, flag: c.flag, outcome: c.outcome ?? null });
    assert(n === (c.count ?? 1), `${n} card(s) carry ${c.flag}${c.outcome ? ` (${c.outcome})` : ""}, expected ${c.count ?? 1}`);
  },

  /** No chat card shows the narrator's `<npc>` voice markup, raw or escaped (v1.6.1 F9, PLAYTEST-1717 A). */
  async noMarkup(ctx) {
    const leaks = await ctx.gm.page.evaluate(() => game.messages.contents
      .filter(m => /<\/?npc\b|&lt;\/?npc\b/i.test(m.content ?? ""))
      .map(m => (m.content ?? "").replace(/\s+/g, " ").slice(0, 160)));
    assert(!leaks.length, `<npc> markup shows in ${leaks.length} card(s): ${leaks.join(" || ")}`);
  },
};

async function runCheck(ctx, check) {
  const fn = CHECKS[check.check];
  assert(fn, `unknown check "${check.check}"`);
  await eventually(() => fn(ctx, check), check.timeoutMs ?? CHECK_MS);
}

// ── scenarios ────────────────────────────────────────────────────────────────

function loadScenarios() {
  const files = fs.readdirSync(SCENARIO_DIR).filter(f => f.endsWith(".json")).sort();
  return files
    .map(f => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(SCENARIO_DIR, f), "utf8")) }))
    .filter(s => !ONLY || s.name === ONLY);
}

function loadRecording(name) {
  const file = path.join(RECORDING_DIR, `${name}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeArtifact(name, data) {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACTS, name), JSON.stringify(data, null, 2));
}

/** Record a scenario that never reached its browsers (a bad scenario or recording). */
function refuse(scenario, failure, error) {
  results.push({ name: scenario.name, ok: false, failure, error, verdict: { replay: failure === "replay" ? "invalid" : "not run", integration: "not run", narratorQuality: "not assessed" } });
  log(`FAIL  ${scenario.name}: ${error}`);
}

async function runScenario(browser, scenario) {
  const started = Date.now();
  const strict = scenario.strict === true;
  const problems = validateScenario(scenario);
  if (problems.length) return refuse(scenario, "scenario", `the scenario is not valid: ${problems.join("; ")}`);
  const recording = MODE === "replay" ? loadRecording(scenario.name) : null;
  if (MODE === "replay" && !recording) {
    return refuse(scenario, "replay", `no recordings/${scenario.name}.json — record it (scripts/e2e.sh --record-playthroughs)`);
  }
  const unusable = MODE === "replay" ? recordingProblem(recording, { strict }) : null;
  if (unusable) return refuse(scenario, "replay", `recordings/${scenario.name}.json can't be replayed: ${unusable}`);
  if (recording?.source && recording.source !== "recorded") log(`${scenario.name}: replaying ${recording.source} replies (${recording.note ?? "not recorded from Claude"})`);
  const revision = scenarioRevision(scenario);
  if (recording?.scenarioRevision && recording.scenarioRevision !== revision) {
    log(`SCENARIO-REVISED ${scenario.name}: recorded against revision ${recording.scenarioRevision}, now ${revision} — the seed, settings or steps changed since; re-record if the replies no longer fit`);
  }

  const harness = createClaudeHarness({ mode: MODE, recording, apiKey: process.env.ANTHROPIC_API_KEY ?? null, strict, log });
  const gm = await openClient(browser, "gm", { prepare: async (page) => {
    await harness.attach(page, "gm");
    await page.addInitScript(installDiceScript);
  } });
  const player = await openClient(browser, "player", { prepare: (page) => harness.attach(page, "player") });
  const ctx = {
    gm, player, harness, findings: [],
    client: (who) => (who === "gm" ? gm : player),
  };
  const clients = [gm, player];
  const optional = scenario.optionalCalls ?? [];
  const steps = scenario.steps ?? [];
  const variations = [];
  let failed = null;
  let failure = null;        // "infrastructure" | "replay" | "integration"
  let stepLabel = "setup";
  let current = null;        // { id, step } — the step running now
  let stepsRun = 0;

  /** A strict step's calls against its declarations; throws on a failure. */
  const checkCalls = (id, declared) => {
    const report = harness.checkStep(id, declared, optional);
    for (const v of report.variations) log(`  ${v}`);
    variations.push(...report.variations);
    if (report.failures.length) {
      failure = "replay";
      throw new Error(`strict replay — ${report.failures.join("; ")}`);
    }
    return report;
  };

  try {
    await join(gm, GM_NAME, log);
    ctx.ids = await setUpWorld(gm, scenario);
    log(`${scenario.name}: world seeded ${JSON.stringify(ctx.ids)}`);
    await join(player, PLAYER_NAME, log);

    for (const [i, step] of steps.entries()) {
      const id = stepId(step, i);
      current = { id, step };
      harness.setStep(id);
      stepLabel = `step ${i + 1} "${id}" (${step.do}${step.text ? `: "${step.text.slice(0, 40)}"` : step.name ? `: ${step.name}` : ""})`;
      const fn = STEPS[step.do];
      assert(fn, `unknown step "${step.do}"`);
      const t0 = Date.now();
      await fn(ctx, step);
      // Let the passes a step schedules (detection, tier updates, summaries —
      // 2 s after a narration) land before checking: a negative check passes
      // vacuously while they are still pending, and a strict step's calls are
      // counted once they have all started. A slow runner fires those timers
      // late (CI run 245), so a strict step first waits for the calls it
      // expects to start.
      if (strict) await harness.waitForCalls(id, step, optional, { timeoutMs: CHECK_MS });
      await harness.idle({ quietMs: 4000 });
      const report = strict ? checkCalls(id, step) : null;
      for (const check of step.then ?? []) await runCheck(ctx, check);
      stepsRun += 1;
      log(`  ok  ${stepLabel} (${Math.round((Date.now() - t0) / 100) / 10}s${report ? `; ${report.calls.length} call(s): ${report.calls.join(", ") || "none"}` : ""})`);
    }
    current = null;
    harness.setStep(AFTER_STEP);
    for (const check of scenario.always ?? []) await runCheck(ctx, check);
    if (strict) {
      stepLabel = "outside the steps";
      checkCalls(SETUP_STEP, {});
      checkCalls(AFTER_STEP, {});
    }
  } catch (err) {
    failed = `${stepLabel}: ${err?.message ?? err}`;
    failure ??= stepLabel === "setup" ? "infrastructure" : "integration";
    // A missing reply often surfaces as a wait that timed out: say what the
    // step's calls looked like when it failed.
    if (strict && current && failure === "integration") {
      const report = harness.checkStep(current.id, current.step, optional);
      if (report.failures.length) {
        failed += ` — at the failure, strict replay: ${report.failures.join("; ")}`;
        if (report.failures.some(f => f.startsWith("UNRECORDED"))) failure = "replay";
      }
    }
  }

  const summary = harness.summary();
  log(`${scenario.name}: Claude calls ${JSON.stringify(summary.byKind)}`);
  if (summary.unusedRecordings.length) log(`${scenario.name}: recordings never asked for — ${summary.unusedRecordings.join(", ")}`);
  // What a result means, kept apart: whether the replay answered every call
  // it had to from recordings, whether the checks passed, and that the
  // narrator's prose quality is not assessed here at all.
  const verdict = {
    replay: MODE === "record" ? "live (recording run)"
      : failure === "replay" ? "invalid"
      : strict ? (failed ? `valid through ${stepsRun} of ${steps.length} step(s)` : "valid")
      : `permissive (${harness.requests.filter(r => r.source === "stub").length} stubbed call(s))`,
    integration: failure === "integration" ? "fail" : failed ? "not reached" : "pass",
    narratorQuality: MODE === "record" ? "live replies — not assessed" : "not assessed (recorded replies)",
  };

  if (failed) {
    results.push({ name: scenario.name, ok: false, failure, error: failed, verdict, ms: Date.now() - started });
    log(`FAIL  ${scenario.name} (${failure})\n      ${failed}`);
    await snapshot(clients, `playthrough-${scenario.name}`, log);
    logConsoleErrors(clients, log);
    writeArtifact(`playthrough-${scenario.name}-requests.json`, {
      summary, verdict, variations, findings: ctx.findings,
      requests: harness.requests.map(({ n, client, step, kind, model, source, recordedStep, user, system }) => ({
        n, client, step, kind, model, source, recordedStep, user, systemSections: system.split("\n").filter(l => /^##\s/.test(l)),
      })),
    });
  } else {
    results.push({ name: scenario.name, ok: true, verdict, ms: Date.now() - started, calls: summary.calls, variations, findings: ctx.findings });
    log(`PASS  ${scenario.name} (${Math.round((Date.now() - started) / 1000)}s, ${summary.calls} Claude calls; replay ${verdict.replay})`);
  }

  if (MODE === "record") {
    const out = harness.recordingOut({
      scenario: scenario.name, scenarioFile: scenario.file, revision, passed: !failed,
      commit: process.env.PLAYTHROUGH_COMMIT || null,
    });
    // A failed run never becomes the baseline: its capture is kept for
    // diagnosis, and recordings/ keeps what was there.
    if (failed) {
      const dir = path.join(ARTIFACTS, "recordings");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${scenario.name}.rejected.json`), `${JSON.stringify(out, null, 2)}\n`);
      log(`${scenario.name}: the recording run FAILED — recordings/${scenario.name}.json is unchanged; the capture is in artifacts/recordings/${scenario.name}.rejected.json`);
    } else {
      fs.mkdirSync(RECORDING_DIR, { recursive: true });
      fs.writeFileSync(path.join(RECORDING_DIR, `${scenario.name}.json`), `${JSON.stringify(out, null, 2)}\n`);
      log(`${scenario.name}: wrote recordings/${scenario.name}.json (${out.exchanges.length} exchanges) — review the run's checks and the replies before committing it`);
    }
  }

  await restoreWorld(gm);
  await gm.context.close().catch(() => {});
  await player.context.close().catch(() => {});
}

async function main() {
  const scenarios = loadScenarios();
  assert(scenarios.length, ONLY ? `no scenario named "${ONLY}"` : "no scenarios in playthroughs/");
  log(`mode ${MODE}; ${scenarios.length} scenario(s): ${scenarios.map(s => s.name).join(", ")}`);
  const browser = await chromium.launch();
  try {
    for (const scenario of scenarios) await runScenario(browser, scenario);
  } finally {
    const failed = results.filter(r => !r.ok);
    log("summary", JSON.stringify({ mode: MODE, passed: results.length - failed.length, failed: failed.length, results }));
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
