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
// Modes (PLAYTHROUGH_MODE):
//   replay (default) — answer Claude from recordings/<scenario>.json;
//   record           — answer Claude from Anthropic with ANTHROPIC_API_KEY and
//                      write recordings/<scenario>.json. Run it outside CI
//                      (test/ci/scripts/e2e.sh --record-playthroughs) and
//                      commit the result; re-record when a prompt changes.
// PLAYTHROUGH=<name> runs one scenario.
//
// Runs after the multiplayer suite (scripts/e2e.sh), against the same live
// world. Each scenario starts by clearing what earlier suites left — chat,
// actors, journals, campaign state — so a replay meets the world its recording
// met. Exit code 0 when every scenario passes; 1 otherwise. Failure
// screenshots and the run's Claude request log land in ./artifacts.

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import {
  MODULE_ID, MODULE_SRC, GM_NAME, ARTIFACTS, STEP_MS,
  sleep, assert, openClient, join, chat, snapshot, logConsoleErrors,
} from "./lib/foundry.mjs";
import { createClaudeHarness, PAGE_KEY, findSection } from "./lib/claude.mjs";

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
    if (seed.ship) {
      const { createShip } = await import(`${MODULE_SRC}/entities/ship.js`);
      await createShip({ name: seed.ship.name, isCommandVehicle: true }, cs);
    }
    if (seed.settlement) {
      const { createSettlement } = await import(`${MODULE_SRC}/entities/settlement.js`);
      await createSettlement({ ...seed.settlement }, cs, { persist: false });
      if (seed.at === seed.settlement.name) {
        cs.currentLocationId   = cs.settlementIds.at(-1);
        cs.currentLocationType = "settlement";
      }
    }
    await game.settings.set(MODULE_ID, "campaignState", cs);
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

    const dialog = ctx.gm.page.locator(".move-confirm-dialog").last();
    await dialog.waitFor({ state: "visible", timeout: STEP_MS }).catch(() => {
      throw new Error("the GM never got the move confirmation dialog");
    });
    const moveId = await dialog.locator(".confirm-move-id").getAttribute("data-move-id");
    if (step.move) assert(moveId === step.move, `the interpreter proposed ${moveId}, the scenario expects ${step.move}`);
    // A DOM click, as on the cards: no hit-testing against notifications
    // that may overlap the window.
    await dialog.locator('[data-action="accept"]').evaluate(el => el.click());

    const card = await waitForCard(ctx.gm, before, "f.narratorCard === true && !!f.moveId", "the move's narration", STEP_MS * 2);
    const left = await ctx.gm.page.evaluate(() => (window.__sfcDice ?? []).length);
    assert(left === 0, `${left} scripted dice were never rolled — did the resolver stop using rollDie?`);
    if (step.outcome) assert(card.flags.outcome === step.outcome, `the move resolved ${card.flags.outcome}, the scenario expects ${step.outcome}`);
    await waitForState(ctx.gm, "cs.pendingMove !== true", "the move lock to release");
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

  /** No chat card shows the narrator's `<npc>` voice markup, raw or escaped (v1.6.1 F9, PLAYTEST-1717 A). */
  async noMarkup(ctx) {
    const leaks = await ctx.gm.page.evaluate(() => game.messages.contents
      .filter(m => /<\/?npc\b|&lt;\/?npc\b/i.test(m.content ?? ""))
      .map(m => (m.content ?? "").replace(/\s+/g, " ").slice(0, 160)));
    assert(!leaks.length, `<npc> markup shows in ${leaks.length} card(s): ${leaks.join(" || ")}`);
  },

  /**
   * A request the narrator (or a helper) was sent: the `nth` call of `kind`
   * (negative counts from the end). `carries` / `lacks` name sections;
   * `section` maps a heading to text it must contain, `sectionLacks` to text it
   * must not.
   */
  async request(ctx, c) {
    const calls = ctx.harness.requests.filter(r => r.kind === c.kind);
    const nth = c.nth ?? -1;
    const r = nth < 0 ? calls.at(nth) : calls[nth];
    assert(r, `no ${c.kind} call #${nth} — the run made ${calls.length} (kinds seen: ${[...new Set(ctx.harness.requests.map(x => x.kind))].join(", ")})`);
    const sectionOf = (heading) => findSection(r.system, heading) ?? findSection(r.user, heading);
    for (const heading of c.carries ?? []) assert(sectionOf(heading), `${c.kind} #${nth} lacks ${heading}`);
    for (const heading of c.lacks ?? []) assert(!sectionOf(heading), `${c.kind} #${nth} carries ${heading}`);
    for (const [heading, texts] of Object.entries(c.section ?? {})) {
      const s = sectionOf(heading);
      assert(s, `${c.kind} #${nth} lacks ${heading}`);
      for (const t of [].concat(texts)) assert(s.includes(t), `${c.kind} #${nth}: ${heading} should say "${t}"`);
    }
    for (const [heading, texts] of Object.entries(c.sectionLacks ?? {})) {
      const s = sectionOf(heading) ?? "";
      for (const t of [].concat(texts)) assert(!s.includes(t), `${c.kind} #${nth}: ${heading} should not say "${t}"`);
    }
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

async function runScenario(browser, scenario) {
  const started = Date.now();
  const recording = MODE === "replay" ? loadRecording(scenario.name) : null;
  if (MODE === "replay" && !recording) {
    results.push({ name: scenario.name, ok: false, error: `no recordings/${scenario.name}.json — record it (scripts/e2e.sh --record-playthroughs)` });
    log(`FAIL  ${scenario.name}: no recording`);
    return;
  }
  if (recording?.source && recording.source !== "recorded") log(`${scenario.name}: replaying ${recording.source} replies (${recording.note ?? "not recorded from Claude"})`);

  const harness = createClaudeHarness({ mode: MODE, recording, apiKey: process.env.ANTHROPIC_API_KEY ?? null, log });
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
  let failed = null;
  let stepLabel = "setup";

  try {
    await join(gm, GM_NAME, log);
    ctx.ids = await setUpWorld(gm, scenario);
    log(`${scenario.name}: world seeded ${JSON.stringify(ctx.ids)}`);
    await join(player, PLAYER_NAME, log);

    for (const [i, step] of (scenario.steps ?? []).entries()) {
      stepLabel = `step ${i + 1} (${step.do}${step.text ? `: "${step.text.slice(0, 40)}"` : step.name ? `: ${step.name}` : ""})`;
      const fn = STEPS[step.do];
      assert(fn, `unknown step "${step.do}"`);
      const t0 = Date.now();
      await fn(ctx, step);
      // Let the passes a step schedules (detection, tier updates, summaries —
      // 2 s after a narration) land before checking: a negative check passes
      // vacuously while they are still pending.
      await harness.idle({ quietMs: 4000 });
      for (const check of step.then ?? []) await runCheck(ctx, check);
      log(`  ok  ${stepLabel} (${Math.round((Date.now() - t0) / 100) / 10}s)`);
    }
    for (const check of scenario.always ?? []) await runCheck(ctx, check);
  } catch (err) {
    failed = `${stepLabel}: ${err?.message ?? err}`;
  }

  const summary = harness.summary();
  log(`${scenario.name}: Claude calls ${JSON.stringify(summary.byKind)}`);
  if (summary.unusedRecordings.length) log(`${scenario.name}: recordings never asked for — ${summary.unusedRecordings.join(", ")}`);

  if (failed) {
    results.push({ name: scenario.name, ok: false, error: failed, ms: Date.now() - started });
    log(`FAIL  ${scenario.name}\n      ${failed}`);
    await snapshot(clients, `playthrough-${scenario.name}`, log);
    logConsoleErrors(clients, log);
    writeArtifact(`playthrough-${scenario.name}-requests.json`, {
      summary, findings: ctx.findings,
      requests: harness.requests.map(({ n, client, kind, model, source, user, system }) => ({
        n, client, kind, model, source, user, systemSections: system.split("\n").filter(l => /^##\s/.test(l)),
      })),
    });
  } else {
    results.push({ name: scenario.name, ok: true, ms: Date.now() - started, calls: summary.calls, findings: ctx.findings });
    log(`PASS  ${scenario.name} (${Math.round((Date.now() - started) / 1000)}s, ${summary.calls} Claude calls)`);
  }

  if (MODE === "record") {
    fs.mkdirSync(RECORDING_DIR, { recursive: true });
    const out = harness.recordingOut({ scenario: scenario.name, scenarioFile: scenario.file, passed: !failed });
    fs.writeFileSync(path.join(RECORDING_DIR, `${scenario.name}.json`), `${JSON.stringify(out, null, 2)}\n`);
    log(`${scenario.name}: wrote recordings/${scenario.name}.json (${out.exchanges.length} exchanges${failed ? " — the run FAILED; check it before committing" : ""})`);
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
