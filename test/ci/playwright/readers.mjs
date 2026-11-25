// The two readers on plain lines (decisions.md → "A player is never made to
// name a move").
//
// What a player types stays in the fiction: a plain line that sets about a
// move must end in that move rolled, or in the right move offered on a
// button. Two model calls read every line of play — the pacing reader
// (src/pacing/router.js decidePacing) and, when it calls the line a move, the
// move reader (src/moves/interpreter.js interpretMove) — and a live playtest
// could not say how often a plain line goes unread, because its AI player
// named its moves. This runs a list of plain lines (readers/plain-lines.json,
// each with the reading it should get) through both readers in a live Foundry
// world, on the model they are written for and on others (the arms), and
// counts: how often is a plain line read right, and how much of the failure
// is the model?
//
// One GM client. For each line: the world is put in the line's context — the
// recent scene as narrator cards in chat, and what of its state a reader's
// prompt reads (lib/readers.mjs STATE_READ) — and then the two readers are
// called in the page as the chat pipeline calls them (src/index.js, readMove
// in src/moves/movePipeline.js). The line is never posted to chat: nothing is
// rolled or narrated, and nothing but the two readers' calls reaches a model —
// in a live run the harness's gate refuses any other call. Lines are read a
// context at a time, and each line by every arm in turn before the next: a
// run a cap stops has every arm's reading of the same lines.
//
// On demand only, like explore.mjs: nothing in CI runs this, and it files no
// issue and changes no code. It writes evidence, for a person.
//
// Environment:
//   READERS_MODE       dry (default) | live. A dry run calls no model and
//                      needs no key: the harness answers both readers with its
//                      neutral stub, so the whole flow runs for nothing and
//                      the prompts it built are written. Its readings are
//                      stubs and say nothing about how a line is read.
//   ANTHROPIC_API_KEY  a live run only; never logged, and blanked from
//                      everything written.
//   READERS_QUESTIONS  what the run is to answer, one question to a line. A
//                      live run is refused without it (the spending rule,
//                      rules/ci-e2e.md).
//   READERS_ARMS       the models, comma-separated (default
//                      claude-sonnet-5-5,claude-haiku-5-5: the readers' own
//                      model, then the one they ran on before it). An arm
//                      that is the readers' own model — whichever the module
//                      asks for, in any place in the list — sends their calls
//                      as they are; any other has the two readers' calls —
//                      and only those — sent to it instead, with that model's
//                      own form of "thinking off" (lib/claude.mjs swapModel).
//                      An arm needs a price in explore.config.json, and
//                      should be a model whose thinking can be turned off:
//                      the readers' reply caps leave no room for it.
//   READERS_REPEATS    readings of each line by each arm (default 1).
//   READERS_CAP_USD    a hard stop (default 2.00): when the budget refuses a
//                      call the run stops and reports what was done.
//   READERS_ONLY       case ids, comma-separated, for a pilot.
//   READERS_COMMIT     the commit the run is recorded at (cloud.sh sets it).
//   BASE_URL           the Foundry server (lib/foundry.mjs).
//
// Evidence, in artifacts/readers/<runId>/ — written as the run goes, so a
// run a cap or a crash stops still leaves it:
//   results.json   every reading: the line, what it wanted, each reader's
//                  reply, what that comes to at the table, and its outcome
//   requests.json  each call's kind, model, system and user prompt (the key
//                  scrubbed), with where its reply came from and its usage
//   report.md      the questions, the headline, the families, the lines the
//                  arms read differently, and what the test does not show
//   run.json       what ran: mode, arms, repeats, questions, commit, the
//                  world as set, caps, spend, calls
//
// Exit code: 0 when the run completed — a low read-rate is a finding, not a
// failure; 1 on an infrastructure error, or when the budget refused a call.

import { chromium } from "playwright";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  MODULE_ID, MODULE_SRC, GM_NAME, ARTIFACTS, assert, openClient, join, logPageState, logConsoleErrors,
} from "./lib/foundry.mjs";
import { createClaudeHarness, AFTER_STEP, SETUP_STEP } from "./lib/claude.mjs";
import { waitForQuietWorld, setUpWorld, restoreWorld } from "./lib/world.mjs";
import { createBudget } from "./lib/budget.mjs";
import { questionsOf } from "./lib/review.mjs";
import { thinkingOffFor } from "../../../src/narration/thinking.js";
import {
  OUTCOME, STATE_READ, casesToRun, contextMismatch, readingOf, report, scoreCase, sheetOf, stateNotSet, summarise, validateCases,
} from "./lib/readers.mjs";

const list = (text, fallback) => {
  const items = String(text ?? "").split(",").map(s => s.trim()).filter(Boolean);
  return items.length ? [...new Set(items)] : fallback;
};

const RAW_MODE  = process.env.READERS_MODE || "dry";
const LIVE      = RAW_MODE === "live";
const API_KEY   = LIVE ? process.env.ANTHROPIC_API_KEY || null : null;
// The readers' own model first (src/pacing/classifier.js, src/moves/interpreter.js
// MODEL — a unit test holds the first default to it), then the model to set it against.
const ARMS      = list(process.env.READERS_ARMS, ["claude-sonnet-5-5", "claude-haiku-5-5"]);
const REPEATS   = Number(process.env.READERS_REPEATS || 1);
const CAP_USD   = Number(process.env.READERS_CAP_USD || 2);
const ONLY      = list(process.env.READERS_ONLY, []);
const QUESTIONS = questionsOf(process.env.READERS_QUESTIONS);
// The dollar cap is the run's cap; this stops a run that is stuck.
const CAP_MINUTES = 90;
// A model call that fails this many readings in a row ends the run.
const FAILED_IN_A_ROW = 3;

/** The two readers' calls, by the module function that makes them (lib/claude.mjs callerKind). */
const readerOf = (kind) => (/classifyInput/.test(kind ?? "") ? "pacing" : /interpretMove/.test(kind ?? "") ? "move" : null);

// The table's dials, pinned to what a new world has: the readers are told
// them, and an earlier suite may have left others. And three settings off, so
// that nothing but the readers has a reason to call a model: a narrator card
// posted for a scene must not start a rolling summary, and a card made for a
// connection must not be seeded with oracles and a portrait.
const DIALS = ["mischiefDial", "pacing.enabled", "pacing.densityWindow", "pacing.dial.combat", "pacing.dial.investigation",
  "pacing.dial.exploration", "pacing.dial.social", "pacing.dial.downtime"];
const QUIET = { narratorSessionSummary: false, autoSeedConnection: false, autoSeedStarship: false };

const log = (...args) => console.log("[readers]", ...args);

// ── files ────────────────────────────────────────────────────────────────────

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

/** The key never reaches a file: any occurrence is blanked on the way out. */
const scrub = (text) => (API_KEY ? text.split(API_KEY).join("[redacted]") : text);

function writer(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return {
    json: (name, data) => fs.writeFileSync(path.join(dir, name), scrub(`${JSON.stringify(data, null, 2)}\n`)),
    text: (name, text) => fs.writeFileSync(path.join(dir, name), scrub(text)),
  };
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

// ── in the page ──────────────────────────────────────────────────────────────
// Each of these runs in the GM's page (page.evaluate): no closures.

/** The registered default of each setting named. */
function defaultsInPage({ MODULE_ID, keys }) {
  return Object.fromEntries(keys.map(key => [key, game.settings.settings.get(`${MODULE_ID}.${key}`)?.default]));
}

function versionsInPage(MODULE_ID) {
  return {
    foundry: game.version ?? null,
    system:  `${game.system?.id ?? "?"} ${game.system?.version ?? "?"}`,
    module:  game.modules.get(MODULE_ID)?.version ?? null,
  };
}

/**
 * Put the world in a context: the recent scene, and what of its state a
 * reader's prompt reads (lib/readers.mjs STATE_READ) — through the module's
 * own functions where it has one, each fact written to its record and to its
 * mirror. Returns what the readers' own sources then hold, read back.
 *
 *   - the scene: the readers get it from getRecentSceneForReading (narrator.js),
 *     which reads the session's narrator cards in chat — a message carrying
 *     `narratorCard`, `narrationText` and the session's `sessionId`
 *     (rules/narrator-memory.md, the flag-family contract). The last
 *     context's cards are deleted and this one's posted.
 *   - the connection: its record (the NPC card) and the bond Item on the
 *     character's sheet, which is what both prompts read.
 *   - the vow: a vow Item on the sheet, made with a module vow id so that the
 *     sheet-made-vow hook offers no setup card and proposes no reward (a
 *     model call) — and its progress, which the SITUATION block gives.
 *   - the sheet: health, spirit, supply and the three impacts a recovery move
 *     clears, through the module's own writers (the system's change notes for
 *     them are not posted: nothing here is a line of play).
 *   - the ship: the command vehicle's integrity and whether it is battered,
 *     through its record's writer (which writes the starship's own impact).
 *   - the open tracks: the Progress Tracks journal.
 *   - where the character is, the scene frame and the session: campaignState,
 *     written at its turn on the client's write chain.
 *
 * `sheetWanted` is the sheet the context's state gives (lib/readers.mjs sheetOf): a
 * meter the state does not give is full and an impact it does not list is
 * clear, so nothing of the last context's stays behind.
 */
async function applyContextInPage({ MODULE_ID, MODULE_SRC, pcId, sessionId, key, context, sheetWanted }) {
  const { serialiseCampaignStateWrite } = await import(`${MODULE_SRC}/multiplayer/campaignStateChain.js`);
  const sheet    = await import(`${MODULE_SRC}/character/actorBridge.js`);
  const people   = await import(`${MODULE_SRC}/entities/connection.js`);
  const ships    = await import(`${MODULE_SRC}/entities/ship.js`);
  const progress = await import(`${MODULE_SRC}/ui/progressTracks.js`);
  const { applySceneFrame } = await import(`${MODULE_SRC}/factContinuity/ledgers.js`);
  const { getRecentSceneForReading } = await import(`${MODULE_SRC}/narration/narrator.js`);
  const { buildSituationBlock } = await import(`${MODULE_SRC}/moves/situation.js`);
  const stored = () => game.settings.get(MODULE_ID, "campaignState") ?? {};
  const state = context.state ?? {};
  const pc = game.actors.get(pcId);
  if (!pc) throw new Error("the player character is not in the world");

  // The session, where the character is and the scene frame — the two
  // location fields as `!at` writes them. First, so that the scene's cards
  // are posted into the session that is current; and at its turn on the
  // client's write chain, as every campaignState write below is (a
  // connection's registration, a deleted card's record).
  const placeOf = (cs, name) => (cs.settlementIds ?? []).find((id) => {
    const actor = game.actors.get(id);
    return (actor?.flags?.[MODULE_ID]?.settlement?.name ?? actor?.name) === name;
  }) ?? null;
  await serialiseCampaignStateWrite(async () => {
    const latest = foundry.utils.deepClone(stored());
    latest.currentSessionId = sessionId;
    const placeId = state.location ? placeOf(latest, state.location) : null;
    if (state.location && !placeId) throw new Error(`no settlement named "${state.location}" is in the world`);
    latest.currentLocationId   = placeId;
    latest.currentLocationType = placeId ? "settlement" : null;
    latest.sceneFrame = null;
    if (state.frame) applySceneFrame(state.frame, latest);
    await game.settings.set(MODULE_ID, "campaignState", latest);
  }, "readers context");

  // The recent scene.
  const Message = CONFIG.ChatMessage.documentClass;
  const old = game.messages.contents.filter(m => m.flags?.[MODULE_ID]?.readersScene);
  if (old.length) await Message.deleteDocuments(old.map(m => m.id));
  const escape = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  for (const paragraph of context.scene ?? []) {
    await Message.create({
      content: `<p>${escape(paragraph)}</p>`,
      speaker: { alias: "Narrator" },
      flags:   { [MODULE_ID]: { narratorCard: true, narrationText: paragraph, sessionId, readersScene: key } },
    });
  }

  // The connection. One this context does not hold comes off the sheet: its
  // card stays — a person the character knows of, with no relationship.
  const want = state.connection ?? null;
  const hostOf = (name) => (stored().connectionIds ?? []).find(id => people.getConnection(id)?.name === name) ?? null;
  for (const id of stored().connectionIds ?? []) {
    const record = people.getConnection(id);
    if (!record || record.name === want?.name) continue;
    const keys = { connectionId: record._id, name: record.name };
    await people.updateConnection(id, { relationshipTicks: 0, bonded: false });
    await sheet.setBondItemTicks(keys, 0);
    await sheet.setBondItemForged(keys, false);
    await sheet.deleteUnmarkedBondItems({ connectionId: record._id });
  }
  if (want) {
    const rank = want.rank ?? "dangerous";
    const ticks = Math.max(0, Math.min(40, Number(want.ticks) || 0));
    const bonded = want.bonded === true;
    let id = hostOf(want.name);
    if (!id) {
      await people.createConnection({ name: want.name, role: want.role ?? "", rank }, foundry.utils.deepClone(stored()));
      id = hostOf(want.name);
      if (!id) throw new Error(`the connection ${want.name} was made and not registered`);
    }
    const record = people.getConnection(id);
    const keys = { connectionId: record._id, name: record.name };
    await sheet.createCharacterBondItem(pc, { name: record.name, rank, connectionId: record._id });
    await people.updateConnection(id, { rank, relationshipTicks: ticks, bonded });
    if (record.rank !== rank) await sheet.setBondItemRank(keys, rank);
    await sheet.setBondItemTicks(keys, ticks);
    await sheet.setBondItemForged(keys, bonded);
  }

  // The vow: its name, its rank and how far it has come.
  const vowItems = () => pc.items.contents.filter(i => i.type === "progress" && i.system?.subtype === "vow");
  const gone = vowItems().filter(i => i.name !== state.vow?.name);
  if (gone.length) await pc.deleteEmbeddedDocuments("Item", gone.map(i => i.id));
  if (state.vow?.name && !vowItems().length) {
    const made = await sheet.createCharacterVowItem(pc, { name: state.vow.name, rank: state.vow.rank ?? "dangerous", vowId: `readers-${foundry.utils.randomID()}` });
    if (!made) throw new Error(`the vow "${state.vow.name}" could not be put on the sheet`);
  }
  if (state.vow?.name) {
    const set = await sheet.setVowItemTrack(pc, vowItems()[0].id, { ticks: sheetWanted.vowTicks, rank: state.vow.rank ?? "dangerous" });
    if (!set.ok) throw new Error(`the vow "${state.vow.name}" could not be set to ${sheetWanted.vowTicks} ticks (${set.reason})`);
  }

  // The sheet: the impacts first (a marked impact lowers what a meter can
  // hold), then the meters, each by the difference from what the sheet holds.
  const held = () => { sheet.invalidateActorCache(pc.id); return sheet.readCharacterSnapshot(pc); };
  await sheet.withoutSystemNotes(async () => {
    for (const [impact, marked] of Object.entries(sheetWanted.impacts)) {
      if ((held().debilities?.[impact] === true) !== marked) await sheet.setDebility(pc, impact, marked);
    }
    const meters = held().meters;
    const change = Object.fromEntries(["health", "spirit", "supply"].map(meter => [meter, sheetWanted[meter] - meters[meter]]));
    if (Object.values(change).some(Boolean)) await sheet.applyMeterChanges(pc, change);
  });

  // The ship, where the world has one: its integrity and whether it is battered.
  const shipId = ships.getCommandVehicleActorId(stored());
  if (shipId) await ships.updateShip(shipId, { integrity: sheetWanted.integrity, battered: sheetWanted.battered });

  // The open tracks, by type and label.
  const wanted = Array.isArray(state.tracks) ? state.tracks : [];
  const open = (await progress.listProgressTracks()).filter(t => !t.completed);
  const same = (a, b) => a.type === b.type && a.label === b.label;
  for (const track of open) if (!wanted.some(w => same(w, track))) await progress.completeProgressTrack(track.id);
  for (const w of wanted) if (!open.some(t => same(w, t))) await progress.addProgressTrack({ label: w.label, type: w.type, rank: w.rank ?? "dangerous" });

  // Read back, from what the readers' prompts are built from — and the block
  // itself, as both prompts will carry it for this context's lines.
  const cs = stored();
  const here = cs.currentLocationId ? game.actors.get(cs.currentLocationId) : null;
  const now = held();
  const ship = ships.getCommandVehicle(cs);
  return {
    session:     cs.currentSessionId ?? null,
    scene:       getRecentSceneForReading(cs.currentSessionId ?? null),
    location:    here ? (here.flags?.[MODULE_ID]?.settlement?.name ?? here.name) : null,
    frame:       cs.sceneFrame ? { location: cs.sceneFrame.location, present: cs.sceneFrame.present, situation: cs.sceneFrame.situation } : null,
    sheet:       {
      health: now.meters.health, spirit: now.meters.spirit, supply: now.meters.supply,
      impacts: { wounded: now.debilities.wounded === true, shaken: now.debilities.shaken === true, unprepared: now.debilities.unprepared === true },
    },
    vehicle:     ship ? { name: ship.name, integrity: Number.isFinite(Number(ship.integrity)) ? Number(ship.integrity) : null, battered: ship.battered === true } : null,
    connections: sheet.readConnections(pc).filter(c => !c.lost).map(c => ({ name: c.name, rank: c.rank, ticks: c.ticks, bonded: c.completed })),
    vows:        sheet.readVows(pc).filter(v => !v.completed).map(v => ({ name: v.name, rank: v.rank, ticks: v.ticks })),
    tracks:      (await progress.listProgressTracks()).filter(t => !t.completed).map(t => ({ type: t.type, label: t.label })),
    situation:   buildSituationBlock(pc, { campaignState: cs }),
  };
}

/**
 * Read one line with the two readers, as the chat pipeline does (src/index.js
 * onMessage; readMove in src/moves/movePipeline.js) — and nothing else of it:
 * the line is not posted, no lock is claimed, nothing is rolled or narrated.
 */
async function readLineInPage({ MODULE_ID, MODULE_SRC, pcId, line, recentMoves = 0 }) {
  const { decidePacing, classifierReadingOf, resetRecentDensity, recordRecentDecision } = await import(`${MODULE_SRC}/pacing/router.js`);
  const { interpretMove } = await import(`${MODULE_SRC}/moves/interpreter.js`);
  const { getRecentSceneForReading } = await import(`${MODULE_SRC}/narration/narrator.js`);
  const { getMischiefDial } = await import(`${MODULE_SRC}/ui/settingsPanel.js`);
  const pick = (from, keys) => Object.fromEntries(keys.filter(k => from?.[k] !== undefined).map(k => [k, from[k]]));

  // Each line is read on its own: no earlier line's decision counts toward
  // "recent moves" — save the run of moves a case says its line follows
  // (`recentMoves`): the fourth live run's named Set a Course came after four
  // moves of the last five, and was offered for the density (a33).
  resetRecentDensity();
  if (recentMoves > 0) {
    const window = Number(game.settings.get(MODULE_ID, "pacing.densityWindow")) || 5;
    const sceneTag = game.settings.get(MODULE_ID, "campaignState")?.currentSessionId ?? "global";
    for (let k = 0; k < recentMoves; k++) recordRecentDecision({ decision: "MOVE", sceneTag, window });
  }

  const apiKey = game.settings.get(MODULE_ID, "claudeApiKey");
  const actor  = game.actors.get(pcId) ?? null;
  // The speaker, as index.js getActiveCharacterForPacing gives it for the line's author.
  const character = actor ? { name: actor.name ?? null, actorId: actor.id ?? null } : null;

  let started = performance.now();
  const pacing = await decidePacing({
    playerText: line, campaignState: game.settings.get(MODULE_ID, "campaignState"), character, apiKey,
  });
  const pacingMs = Math.round(performance.now() - started);

  let interpretation = null;
  let interpretError = null;
  let moveMs = null;
  const classifier = classifierReadingOf(pacing);
  if (pacing.runMove) {
    const campaignState = game.settings.get(MODULE_ID, "campaignState");
    started = performance.now();
    try {
      interpretation = await interpretMove(line, {
        campaignState,
        mischiefLevel:  getMischiefDial(),
        apiKey,
        combatPosition: null,              // no fight is open in any context
        roller:         actor,
        recentScene:    getRecentSceneForReading(campaignState?.currentSessionId ?? null),
        classifier,
        allowNoMove:    true,
      });
    } catch (err) {
      interpretError = String(err?.message ?? err);
    }
    moveMs = Math.round(performance.now() - started);
  }

  return {
    pacing: pick(pacing, ["runMove", "decision", "suggestedMove", "nominatedMove", "category", "confidence", "reasoning", "classifierRead", "forced", "pacingDisabled"]),
    classifier,
    interpretation: interpretation
      ? pick(interpretation, ["moveId", "moveName", "noMove", "statUsed", "confidence", "mischiefApplied", "keptInKind", "rationale", "fallback",
        "moveTarget", "healSituation", "expeditionRank", "combatRank"])
      : null,
    interpretError,
    ms: { pacing: pacingMs, move: moveMs },
    // How much recent scene the readers were given: the runner checks it is the context's.
    sceneChars: getRecentSceneForReading(game.settings.get(MODULE_ID, "campaignState")?.currentSessionId ?? null).length,
  };
}

// ── the run ──────────────────────────────────────────────────────────────────

async function main() {
  assert(["dry", "live"].includes(RAW_MODE), `READERS_MODE is "dry" or "live", not "${RAW_MODE}"`);
  assert(Number.isInteger(REPEATS) && REPEATS >= 1, "READERS_REPEATS is a whole number, 1 or more");
  assert(Number.isFinite(CAP_USD) && CAP_USD > 0, "READERS_CAP_USD is a number of dollars above 0");
  const config = readJson(path.resolve("explore.config.json"));
  const prices = config.prices.usdPerMillionTokens;
  const file = readJson(path.resolve("readers", "plain-lines.json"));
  const problems = validateCases(file);
  assert(!problems.length, `readers/plain-lines.json can't run:\n  ${problems.join("\n  ")}`);
  const { cases, unknown } = casesToRun(file, ONLY);
  assert(!unknown.length, `READERS_ONLY names case(s) the list does not have: ${unknown.join(", ")}`);
  assert(cases.length, "no case to read");
  if (LIVE) {
    assert(API_KEY, "a live run needs ANTHROPIC_API_KEY (READERS_MODE=dry runs without one)");
    // A live run is paid for: it is given its questions in writing before it runs.
    assert(QUESTIONS.length, "a live run needs its questions in writing: READERS_QUESTIONS, one to a line — what this run is to answer that a dry run cannot");
    const unpriced = ARMS.filter(arm => !prices[arm]);
    assert(!unpriced.length, `no price is configured for ${unpriced.join(", ")} (explore.config.json) — a model nobody priced is a model nobody budgeted`);
  }

  const mode = LIVE ? "live" : "dry";
  const planned = cases.length * REPEATS * ARMS.length;
  const startedAt = new Date();
  const runId = `readers-${mode}-${stamp(startedAt)}`;
  const dir = path.join(ARTIFACTS, "readers", runId);
  const out = writer(dir);
  const sessionId = `readers-${stamp(startedAt)}`;
  // Two calls a reading at most, and no other call: the count is its own cap.
  const caps = { actions: 0, calls: planned * 2, minutes: CAP_MINUTES, usd: CAP_USD };
  const budget = createBudget({ caps, prices });
  const results = [];
  const world = { contexts: {} };
  let armNow = null;
  let stepNow = SETUP_STEP;
  let stopped = null;
  let budgetRefused = false;
  let infrastructure = null;
  let harness = null;
  let gm = null;
  let versions = null;
  let dials = null;

  const hardStop = setTimeout(() => {
    log("FAIL  the run outlived its wall-clock cap by ten minutes — stopping the process");
    process.exit(1);
  }, (CAP_MINUTES + 10) * 60_000);
  hardStop.unref();

  log(`${cases.length} line(s) × ${REPEATS} reading(s) × ${ARMS.join(", ")} — ${mode} — evidence in ${path.relative(process.cwd(), dir)}`);
  if (LIVE) log(`cap: $${CAP_USD.toFixed(2)}, ${caps.calls} model calls`);
  else log("a dry run: no model is called — every reading is the harness's stub");
  // The readers turn thinking off, and the form that does it is per model
  // (src/narration/thinking.js): an arm's calls carry its own (lib/claude.mjs
  // swapModel). A model the module knows no form for is sent none — right for
  // one that does not think unasked, and a waste on one that always thinks:
  // its thinking comes out of the readers' small reply caps.
  const thinking = Object.fromEntries(ARMS.map(arm => [arm, thinkingOffFor(arm).thinking?.type ?? null]));
  for (const arm of ARMS.filter(a => !thinking[a])) {
    log(`NOTE  ${arm}: the module has no thinking-off form for it, so its calls carry no \`thinking\` field — if it thinks by default, its readings will be cut short by the readers' reply caps`);
  }

  const persist = () => out.json("results.json", results);

  const browser = await chromium.launch();
  try {
    harness = createClaudeHarness({
      mode:   LIVE ? "record" : "replay",
      apiKey: API_KEY,
      // A dry run's readers are answered by the stub, as meant: not worth a line each.
      log:    (line) => { if (!LIVE && /^UNRECORDED /.test(String(line)) && readerOf(String(line))) return; log(line); },
      gate: LIVE ? {
        // Nothing but the two readers' calls reaches a model.
        before: (call) => (readerOf(call.kind)
          ? budget.reserve({ ...call, role: `${armNow ?? "setup"} ${readerOf(call.kind)}` })
          : { ok: false, reason: "not one of the two readers' calls, and this run sends a model nothing else" }),
        after: (id, { usage }) => budget.settle(id, { usage }),
      } : null,
      // The arm: a model other than the one the reader asked for takes its call.
      model: (kind, asked) => (armNow && armNow !== asked && readerOf(kind) ? armNow : null),
    });
    gm = await openClient(browser, "gm", { prepare: (page) => harness.attach(page, "gm") });
    await join(gm, GM_NAME, log);
    await waitForQuietWorld(gm);
    dials = await gm.page.evaluate(defaultsInPage, { MODULE_ID, keys: DIALS });
    const unregistered = DIALS.filter(key => dials[key] === undefined);
    assert(!unregistered.length, `the module registers no setting ${unregistered.join(", ")}`);
    const ids = await setUpWorld(gm, {
      settings: { ...dials, ...QUIET },
      // The command vehicle too, where the list has one: the SITUATION block gives its integrity.
      seed:     { pc: file.world.pc, sector: file.world.sector, settlements: file.world.settlements, ...(file.world.ship ? { ship: file.world.ship } : {}) },
    });
    await waitForQuietWorld(gm, { quietMs: 2000 });
    versions = { ...await gm.page.evaluate(versionsInPage, MODULE_ID), browser: `chromium ${browser.version()}` };
    log(`world seeded — Foundry ${versions.foundry}, ${versions.system}, module ${versions.module}; dials ${JSON.stringify(dials)}`);

    let contextNow = null;
    let failedInARow = 0;
    reading:
    for (const c of cases) {
      if (c.context !== contextNow) {
        stepNow = `(context ${c.context})`;
        harness.setStep(stepNow);
        armNow = null;
        const context = file.contexts[c.context];
        const applied = await gm.page.evaluate(applyContextInPage, {
          MODULE_ID, MODULE_SRC, pcId: ids.pcId, sessionId, key: c.context, context, sheetWanted: sheetOf(context.state),
        });
        // The module answers those writes with writes of its own; the line is read once they have landed.
        await waitForQuietWorld(gm, { quietMs: 1500, capMs: 30_000 });
        const mismatch = contextMismatch(context, applied);
        assert(!mismatch, `the context ${c.context} did not land: ${mismatch}`);
        world.contexts[c.context] = { set: applied, notSet: stateNotSet(context.state) };
        contextNow = c.context;
        log(`context ${c.context}: ${applied.location ?? "no charted place"}; health ${applied.sheet.health}, spirit ${applied.sheet.spirit}, supply ${applied.sheet.supply}`
          + `${applied.vehicle ? `, integrity ${applied.vehicle.integrity}` : ""}; connections ${applied.connections.map(x => `${x.name} ${x.bonded ? "bonded" : `${x.ticks}/40`}`).join(", ") || "none"}; `
          + `vows ${applied.vows.map(v => `${v.ticks}/40`).join(", ") || "none"}; tracks ${applied.tracks.length}; scene ${applied.scene.length} chars`);
      }
      for (let repeat = 1; repeat <= REPEATS; repeat++) {
        for (const arm of ARMS) {
          if (LIVE && budget.exhausted()) {
            const cap = budget.exhausted();
            stopped = `the ${cap.cap} cap was reached (${cap.detail})`;
            budgetRefused = true;
            break reading;
          }
          armNow = arm;
          stepNow = `${arm} · ${c.id} · ${repeat}`;
          harness.setStep(stepNow);
          const before = harness.requests.length;
          const raw = await gm.page.evaluate(readLineInPage, { MODULE_ID, MODULE_SRC, pcId: ids.pcId, line: c.line, recentMoves: c.recentMoves ?? 0 });
          const made = harness.requests.slice(before);
          // A line read against another scene than its context's — a session
          // minted under the run, a card gone — would be a reading of nothing.
          const sceneChars = world.contexts[c.context].set.scene.length;
          assert(raw.sceneChars === sceneChars, `the recent scene changed under the run: at ${c.id} the readers were given ${raw.sceneChars} characters of it, and the context's is ${sceneChars}`);
          const calls = made.filter(r => readerOf(r.kind)).map(r => ({
            reader: readerOf(r.kind), kind: r.kind, model: r.model, ...(r.modelAsked ? { modelAsked: r.modelAsked } : {}),
            source: r.source, status: r.status ?? null, ms: r.ms ?? null, usage: r.usage ?? null,
          }));

          // The budget refused a reader's call: it was answered by the stub, so this is no reading.
          const refused = calls.find(call => /^refused \(/.test(call.source ?? ""));
          if (refused) {
            stopped = `the budget refused a call — ${refused.source.replace(/^refused \((.*)\)$/, "$1")}`;
            budgetRefused = true;
            break reading;
          }
          const reading = readingOf(raw);
          const failedCall = calls.find(call => call.status && call.status !== 200);
          if (failedCall) reading.failed = `the ${failedCall.reader} reader's call failed (HTTP ${failedCall.status})`;
          const outcome = scoreCase(c.want, reading);
          results.push({
            arm, id: c.id, family: c.family, context: c.context, line: c.line, want: c.want,
            ...(c.source ? { source: c.source } : {}), ...(c.note ? { note: c.note } : {}),
            ...(c.named ? { named: c.named } : {}), ...(c.recentMoves ? { recentMoves: c.recentMoves } : {}),
            repeat, outcome, reading,
            pacing: raw.pacing, classifier: raw.classifier, interpretation: raw.interpretation,
            ...(raw.interpretError ? { interpretError: raw.interpretError } : {}),
            ms: raw.ms, calls,
          });
          log(`${String(results.length).padStart(3)}/${planned}  ${c.id.padEnd(20)} ${arm.padEnd(18)} ${outcome}`
            + `${reading.failed ? "" : ` — ${reading.decision}${reading.suggested ? ` ${reading.suggested}` : ""}${reading.move ? ` → ${reading.move}` : reading.noMove ? " → no move" : ""}`}`);

          failedInARow = failedCall ? failedInARow + 1 : 0;
          if (failedInARow >= FAILED_IN_A_ROW) {
            infrastructure = `${FAILED_IN_A_ROW} readings in a row had a model call fail (the last: ${failedCall.kind} on ${failedCall.model} → HTTP ${failedCall.status})`;
            stopped = infrastructure;
            break reading;
          }
        }
      }
      persist();
    }

    armNow = null;
    stepNow = AFTER_STEP;
    harness.setStep(AFTER_STEP);
    await harness.idle({ quietMs: 1500, timeoutMs: 20_000 });
    await waitForQuietWorld(gm, { quietMs: 1500, capMs: 20_000 });
    if (!stopped) log(`every line was read: ${results.length} reading(s)`);
    else log(`stopped: ${stopped}`);
  } catch (err) {
    infrastructure = `${stepNow}: ${err?.message ?? err}`;
    log(`FAIL  ${err?.stack ?? err}`);
    if (gm) await logPageState([gm], log).catch(() => {});
  }

  // ── the evidence ───────────────────────────────────────────────────────────
  try {
    const requests = harness?.requests ?? [];
    const failedCalls = requests.filter(r => r.status && r.status !== 200);
    if (!infrastructure && failedCalls.length) {
      infrastructure = `${failedCalls.length} model call(s) failed (the first: ${failedCalls[0].kind} on ${failedCalls[0].model} → HTTP ${failedCalls[0].status})`;
    }
    // A call that was not a reader's: refused by the gate in a live run, answered by the stub in a dry one.
    const strays = requests.filter(r => !readerOf(r.kind)).map(r => ({ n: r.n, step: r.step, kind: r.kind, model: r.model, source: r.source }));
    for (const s of strays) log(`a call that was not a reader's: ${s.kind} at "${s.step}" (${s.source}) — it reached no model`);

    // Each call, with its prompts. A reader's system prompt is the same for
    // every line: kept once, and named by each call.
    const systems = {};
    const calls = requests.map((r) => {
      const ref = createHash("sha256").update(r.system ?? "").digest("hex").slice(0, 12);
      systems[ref] ??= r.system ?? "";
      return {
        n: r.n, step: r.step, reader: readerOf(r.kind), kind: r.kind, model: r.model, ...(r.modelAsked ? { modelAsked: r.modelAsked } : {}),
        source: r.source, status: r.status ?? null, ms: r.ms ?? null, usage: r.usage ?? null, system: ref, user: r.user,
      };
    });
    out.json("requests.json", {
      about: "Every call the page made to the Messages API, in order. `step` names the arm, the case and the repeat. `model` is the model the call was sent to — in a dry run, where nothing is sent, the model the reader asked for; `modelAsked` is the reader's own where an arm replaced it. `system` names an entry of `systems`.",
      systems, calls,
    });
    out.json("results.json", results);

    const summary = summarise(results, { prices });
    const spend = LIVE ? budget.report() : null;
    const notSet = Object.values(world.contexts).flatMap(c => c.notSet);
    // The model the readers themselves ask for — the module's, whatever arm took the call.
    const own = [...new Set(requests.filter(r => readerOf(r.kind)).map(r => r.modelAsked ?? r.model).filter(Boolean))];
    out.text("report.md", report(summary, {
      runId, mode, startedAt: startedAt.toISOString(), commit: process.env.READERS_COMMIT || null, questions: QUESTIONS,
      repeats: REPEATS, planned, stopped, strays: strays.length, notSet, thinking, own,
      dials: dials ? Object.fromEntries(Object.entries(dials).map(([key, value]) => [key.replace(/^pacing\.(dial\.)?/, ""), value])) : null,
    }));
    if (gm) await gm.page.screenshot({ path: path.join(dir, "end-gm.png") }).catch(() => {});

    out.json("run.json", {
      schema: 1,
      id: runId, mode,
      questions: QUESTIONS.length ? QUESTIONS : undefined,
      startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
      commit: process.env.READERS_COMMIT || null,
      versions,
      arms: ARMS, repeats: REPEATS, only: ONLY.length ? ONLY : undefined,
      // The model the readers themselves ask for: an arm of that name sent their calls as they were.
      readersModel: own,
      // The `thinking` form each arm's calls carry to turn thinking off (null: none is sent).
      thinking,
      cases: { inTheList: file.cases.length, chosen: cases.length },
      readings: { planned, made: results.length },
      stopped,
      infrastructure,
      note: LIVE ? undefined : "a dry run: every reply came from the harness's neutral stub, so every reading is \"reader failed\" — it shows the flow and the prompts, nothing about the readers",
      caps: LIVE ? caps : undefined,
      prices: LIVE ? config.prices : undefined,
      spend,
      calls: {
        total: requests.length,
        byArm: Object.fromEntries(summary.arms.map(arm => [arm, { pacing: summary.byArm[arm].spend.pacingCalls, move: summary.byArm[arm].spend.moveCalls, usd: Number(summary.byArm[arm].spend.usd.toFixed(4)) }])),
        notAReaders: strays,
        failed: failedCalls.map(r => ({ n: r.n, step: r.step, kind: r.kind, model: r.model, status: r.status })),
      },
      settings: dials ? { ...dials, ...QUIET } : null,
      // What of a context's state reaches a prompt (and so is set), and, per context, what was set — read back — and what was not.
      world: { session: sessionId, stateRead: STATE_READ, contexts: world.contexts },
      summary: Object.fromEntries(summary.arms.map((arm) => {
        const t = summary.byArm[arm];
        return [arm, { wanting: t.wanting, read: t.read, readRate: t.readRate, rolled: t.rolled, offered: t.offered, anotherMove: t.wrong, nothing: t.nothing,
          controls: t.controls, controlsRight: t.controlsRight, failed: t.failed }];
      })),
    });

    for (const arm of summary.arms) {
      const t = summary.byArm[arm];
      log(`${arm}: read ${t.read} of ${t.wanting} wanting a move (${t.rolled} rolled, ${t.offered} offered); ${t.wrong} another move, ${t.nothing} nothing; `
        + `controls ${t.controlsRight} of ${t.controls} right; ${t.failed} ${OUTCOME.FAILED}`);
    }
    if (LIVE) log(`spent $${spend.usd.toFixed(4)} of $${CAP_USD.toFixed(2)} — ${spend.calls} model call(s), ${spend.minutes} minutes`);
    if (infrastructure) { log(`RESULT infrastructure-error — ${infrastructure}`); if (gm) logConsoleErrors([gm], log); }
    else if (budgetRefused) log(`RESULT stopped-by-budget — ${stopped}`);
    else log(`RESULT completed — ${path.relative(process.cwd(), path.join(dir, "report.md"))}`);
    process.exitCode = infrastructure || budgetRefused ? 1 : 0;
  } finally {
    if (gm) await restoreWorld(gm, log);
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  log(`FAIL  ${err?.stack ?? err}`);
  process.exitCode = 1;
});
