// AI exploration through the real UI (issue #302 slice D; #290 part 3).
//
// An AI player is given a persona and a goal (a charter, charters/*.json) and
// plays at a live Foundry table as a logged-in player does: it reads its own
// screen and types, clicks and fills dialogs (lib/player.mjs). The GM's client
// runs the real pipeline. An observer reads the world, the chat and the
// prompts and decides — without a model — whether the goal was met
// (lib/observer.mjs). Every model call of the run is held to the run's caps
// (lib/budget.mjs, explore.config.json).
//
// The run is then read by whoever made it: every live run ends with a review
// (rules/ci-e2e.md → "AI exploration"). No model reviews a run: one shown
// the transcript alone sees none of the prompts or the records the helpers
// write, which is where the first reviewed run's findings were.
//
// On demand only: nothing in CI runs this, and it never files an issue,
// changes code or rewrites a recording. It writes evidence, for a person.
//
// Modes (EXPLORE_MODE):
//   live      — the player and the narrator are real models.
//               Needs ANTHROPIC_API_KEY; spends money, up to the caps.
//   rehearsal — the live path, whole — the budget's gate, the player's tool
//               calls, the recording — with the Messages API
//               stood in for in this process (lib/rehearsal.mjs). No key, no
//               network, no spend. It proves the runner; its "narrator" is
//               scripted, so its score says nothing about the real one.
//               EXPLORE_REHEARSAL_FORGET=1 rehearses a narrator that keeps
//               nothing.
//   replay    — no key and no model: the player actions, the dice and the
//               module's replies of an earlier run (EXPLORE_REPLAY=<its
//               folder>) are played again in a fresh world, and the observer
//               scores it again. A failure a live run found reproduces this
//               way.
// EXPLORE_CHARTER=<name> picks the charter (default: memory).
//
// Evidence lands in artifacts/explore/<charter>-<mode>-<time>/ — and is
// written as the run goes, so a run a cap or a crash stops still leaves it:
//   run.json        what ran (commit, versions, models, caps), what it cost,
//                   the run's class and why, and the command that replays it
//   actions.json    each player action: the screen it was chosen on, the
//                   reason given, what happened
//   transcript.md   the chat, as the table saw it
//   observer.json   the world after each action (session, where each fact is
//                   stored), the goal's score layer by layer, health
//   requests.json   every prompt and reply — the module's and the player's —
//                   with usage and no headers
//   replay.json     the actions, dice and replies a replay needs
//   review-data.json  speed, caching and cost by call kind, prompt length,
//                   repetition by content, friction — the scorecard's numbers
//   annotated-transcript.md, scorecard.md — the generated layers of the
//                   review every live run ends with; the reader's notes are
//                   left to write
// and, for a charter with beats (a long run, issue #373):
//   beats.json      each beat: done, failed or not exercised, at which step, why
//   mechanics.json  every mechanical check made and violated, each roll with its dice
//   ledger.json     each fact: planted, probed (stored / in the prompt / in the
//                   answer), refused, and what the helpers kept of it
//
// Exit code: 0 when the run finished and its evidence is written — whatever
// it found; 1 on an infrastructure error, or when a replay does not reproduce
// the run it replays.

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import {
  MODULE_ID, GM_NAME, ARTIFACTS, sleep, assert, openClient, join, logPageState, logConsoleErrors,
} from "./lib/foundry.mjs";
import { createClaudeHarness, AFTER_STEP, SETUP_STEP } from "./lib/claude.mjs";
import { installDiceScript, installRefusalTrace, waitForQuietWorld, setUpWorld, restoreWorld, PLAYER_NAME } from "./lib/world.mjs";
import { createBudget } from "./lib/budget.mjs";
import {
  snapshotScreen, describeScreen, executeAction, chooseAction, summariseAction, scriptedForm, resolveScripted, keepNote,
} from "./lib/player.mjs";
import { createObserver, scoreMemory, healthOf, classifyRun, costsOwedText } from "./lib/observer.mjs";
import { installRehearsal } from "./lib/rehearsal.mjs";
import { BEAT_CHECKS, createPointer, classifyLongRun } from "./lib/beats.mjs";
import { scoreLongRun } from "./lib/longrun.mjs";
import { GM_ANSWERS, startGmRules, reloadGm, cancelEndSession, playXCard, renameConnection } from "./lib/gm.mjs";
import {
  annotatedTranscript, scorecard, reviewDataOf, questionsOf,
} from "./lib/review.mjs";

const MODE        = ["rehearsal", "replay"].includes(process.env.EXPLORE_MODE) ? process.env.EXPLORE_MODE : "live";
// A rehearsal runs the live code with a stand-in behind it.
const CALLS       = MODE !== "replay";
const FORGETFUL   = process.env.EXPLORE_REHEARSAL_FORGET === "1";
const CHARTER     = process.env.EXPLORE_CHARTER || "memory";
const REPLAY_FROM = process.env.EXPLORE_REPLAY ? path.resolve(process.env.EXPLORE_REPLAY) : null;
const API_KEY     = MODE === "live" ? process.env.ANTHROPIC_API_KEY || null : MODE === "rehearsal" ? "rehearsal-not-a-key" : null;
const SETTLE_MS   = MODE === "live" ? 180_000 : 60_000;
// What the run is to answer, one question to a line.
const QUESTIONS   = questionsOf(process.env.EXPLORE_QUESTIONS);

const log = (...args) => console.log("[explore]", ...args);

// ── files ────────────────────────────────────────────────────────────────────

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

/** The key never reaches a file: any occurrence is blanked on the way out. */
const scrub = (text) => (MODE === "live" && API_KEY ? text.split(API_KEY).join("[redacted]") : text);

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

/** Why a charter can't run, or null. */
function charterProblem(charter) {
  if (!charter?.persona || !charter?.goal) return "it needs a persona and a goal";
  if (!charter?.seed?.pc?.name) return "its seed needs a player character";
  if (!Array.isArray(charter.facts) || !charter.facts.some(f => f.required !== false)) return "it needs at least one required fact";
  if (charter.facts.some(f => !f.id || !Array.isArray(f.variants) || !f.variants.length)) return "every fact needs an id and its accepted variants";
  // A charter with beats: each one named, numbered and checked by something the observer knows.
  const beats = charter.beats ?? [];
  const bad = beats.find(b => !b.id || !Number.isInteger(b.n) || !b.title || !BEAT_CHECKS[b.check?.type]);
  if (bad) return `beat ${bad.n ?? bad.id ?? "?"} needs an id, a number, a title and a check the observer knows (${bad.check?.type ?? "none"})`;
  const unknown = beats.flatMap(b => (b.needs ?? []).filter(id => !beats.some(x => x.id === id)).map(id => `${b.id} needs ${id}`));
  if (unknown.length) return `a beat needs one that is not in the charter (${unknown[0]})`;
  return null;
}

// ── the table ────────────────────────────────────────────────────────────────

/** Windows that ask something of whoever sees them: Foundry's dialogs and the module's own. */
const ASKING = "dialog[open], .application.dialog, .application.sf-window";

// The GM's half of the table is fixed rules, no model (lib/gm.mjs): a proposed
// move accepted as proposed, "Who are you interacting with?" answered, a draft
// for someone in the charter's cast confirmed. A window on the GM's screen the
// rules do not answer is left open, and the run says so.

/** The GM's world keeps the time of its last write (a document or a setting), for settle(). */
const trackWorldWrites = (gm) => gm.page.evaluate(() => {
  window.__sfcLastWrite = Date.now();
  const bump = () => { window.__sfcLastWrite = Date.now(); };
  for (const name of ["updateSetting", "createSetting", "createChatMessage", "updateChatMessage", "deleteChatMessage", "createActor",
    "updateActor", "deleteActor", "createItem", "updateItem", "deleteItem", "createJournalEntry", "updateJournalEntry",
    "createJournalEntryPage", "updateJournalEntryPage", "updateScene", "updateToken", "updateUser"]) Hooks.on(name, bump);
});

/** Is the table still working on the last action — or waiting on someone? */
const tableState = (gm, player, ignore = []) => Promise.all([
  gm.page.evaluate(({ id, asking, answered }) => {
    const cs = game.settings.get(id, "campaignState") ?? {};
    const title = (el) => String(el.querySelector(".window-title, header h1, header h4")?.textContent ?? "").trim();
    return {
      pendingMove: cs.pendingMove === true,
      // A prompt the autopilot is about to answer: the table is still moving.
      beingAnswered: answered.some(selector => !!document.querySelector(selector)),
      gmWindows: [...document.querySelectorAll(asking)].filter(el => !answered.some(selector => el.matches(selector))).map(title).filter(Boolean),
      worldQuietMs: Date.now() - (window.__sfcLastWrite ?? 0),
    };
  }, { id: MODULE_ID, asking: ASKING, answered: GM_ANSWERS }),
  player.page.evaluate((asking) => [...document.querySelectorAll(asking)]
    .map(el => String(el.querySelector(".window-title, header h1, header h4")?.textContent ?? "").trim()).filter(Boolean), ASKING),
]).then(([gmSide, playerDialogs]) => ({
  ...gmSide,
  gmWindows: gmSide.gmWindows.filter(t => !ignore.includes(t)),
  playerDialogs: playerDialogs.filter(t => !ignore.includes(t)),
}));

const QUIET_MS        = 3500;   // the passes a narration schedules start two seconds after it
const DIALOG_QUIET_MS = 1500;
const WAITING_ON_GM_MS = 20_000;
// How long a line of play is given to be answered at all before the table is
// taken to have settled without answering it.
const REPLY_WAIT_MS   = MODE === "live" ? 150_000 : 45_000;

/** The ids of the messages the GM's world holds now. */
const messageIds = (gm) => gm.page.evaluate(() => game.messages.contents.map(m => m.id));

/**
 * Has the table answered a line of play — a narration, a move's card, or a
 * card that asks the player something — since the messages in `known`?
 */
const answeredSince = (gm, known) => gm.page.evaluate(({ id, known }) => {
  const seen = new Set(known);
  return game.messages.contents.some((m) => {
    if (seen.has(m.id)) return false;
    const f = m.flags?.[id] ?? {};
    return !!(f.narratorCard || f.moveResolution || f.combatThresholdCard || f.connectionPicker || f.milestonePicker
      || f.whichVowCard || f.sufferCard || f.moveNotRolledNotice || f.sessionNotStarted);
  });
}, { id: MODULE_ID, known });

/**
 * Wait for the table to finish with an action: the move lock free, no
 * confirmation open, and nothing new for a while — no model call in flight or
 * just started, no write in the GM's world — counted from the action itself,
 * so a table that has not begun to answer is not taken for one that is done.
 * A dialog open on the player's own screen ends the wait sooner: the table is
 * waiting on them. A window on the GM's screen that the autopilot does not
 * answer ends it too, unsettled: the table is waiting on a GM who is not there.
 *
 * A line of play (`line`: the message ids before it was said) is not settled
 * until it has been answered. Quiet alone is not that: the module pauses
 * between reading a line and narrating it — longer than the quiet clock on
 * the first line of a session — and a rehearsal took the pause for the end.
 * The next line then arrived while the first was being resolved, and was not
 * rolled. A line nothing answers in REPLY_WAIT_MS settles as `unanswered`.
 */
async function settle({ gm, player, harness, ignoreWindows }, actedAt, { line = null } = {}) {
  const started = Date.now();
  let state = null;
  let answered = !line;
  while (Date.now() - started < SETTLE_MS) {
    state = await tableState(gm, player, ignoreWindows);
    const calls = harness.quietMs();
    const quiet = Math.min(calls, state.worldQuietMs, Date.now() - actedAt);
    const busy = state.pendingMove || state.beingAnswered || calls === 0;
    if (!answered) answered = await answeredSince(gm, line);
    const unanswered = !answered && Date.now() - started >= REPLY_WAIT_MS;
    if (!busy && quiet >= QUIET_MS && (answered || unanswered)) return { settled: true, ms: Date.now() - started, ...(unanswered ? { unanswered: true } : {}) };
    if (state.playerDialogs.length && !state.beingAnswered && calls > 0 && quiet >= DIALOG_QUIET_MS) {
      return { settled: true, waitingOnPlayer: state.playerDialogs, ms: Date.now() - started };
    }
    // A window on the GM's screen the autopilot does not answer: the table is
    // waiting on a GM who is not there. No point in waiting out the cap.
    if (state.gmWindows.length && !state.beingAnswered && calls > 0 && quiet >= WAITING_ON_GM_MS) {
      return {
        settled: false, ms: Date.now() - started, waitingOnGm: state.gmWindows,
        detail: `the GM's screen is waiting on ${state.gmWindows.map(t => `"${t}"`).join(", ")}, which the GM's autopilot does not answer`,
      };
    }
    await sleep(300);
  }
  return {
    settled: false, ms: Date.now() - started, waitingOnGm: state?.gmWindows ?? [],
    detail: `after ${Math.round(SETTLE_MS / 1000)} s the table was still busy (move lock ${state?.pendingMove ? "held" : "free"}; `
      + `GM windows: ${state?.gmWindows?.join(", ") || "none"})`,
  };
}

const versions = (gm, browser) => gm.page.evaluate((id) => ({
  foundry: game.version ?? null,
  system:  `${game.system?.id ?? "?"} ${game.system?.version ?? "?"}`,
  module:  game.modules.get(id)?.version ?? null,
}), MODULE_ID).then(v => ({ ...v, browser: `chromium ${browser.version()}` }));

function transcriptMarkdown(charter, messages) {
  const lines = [`# ${charter.name} — transcript`, ""];
  let step = null;
  for (const m of messages) {
    if (m.step !== step) { step = m.step; lines.push(`---`, `*${step} · ${m.phase}*`, ""); }
    const who = m.fromPlayer ? "PLAYER" : m.narrator ? "NARRATOR" : "TABLE";
    lines.push(`**${who} — ${m.speaker ?? m.author ?? "?"}**`, "", m.text || "*(no text)*", "");
  }
  return `${lines.join("\n")}\n`;
}

// ── the run ──────────────────────────────────────────────────────────────────

/** The hidden plans the marks saw: each with the step it first appeared at and the step its truth was revealed at. */
async function main() {
  const config = readJson(path.resolve("explore.config.json"));
  const earlier = MODE === "replay" ? (() => {
    assert(REPLAY_FROM, "replay mode needs EXPLORE_REPLAY=<the folder of the run to replay>");
    return readJson(path.join(REPLAY_FROM, "replay.json"));
  })() : null;
  const charter = earlier ? earlier.charter : { name: CHARTER, ...readJson(path.resolve("charters", `${CHARTER}.json`)) };
  const problem = charterProblem(charter);
  assert(!problem, `the ${charter.name} charter can't run: ${problem}`);
  if (MODE === "live") assert(API_KEY, "a live run needs ANTHROPIC_API_KEY (EXPLORE_MODE=rehearsal runs without one)");
  // A live run is paid for: it is given its questions in writing before it
  // runs (issue #373's first spending rule), and they are kept with it.
  if (MODE === "live") assert(QUESTIONS.length, "a live run needs its questions in writing: EXPLORE_QUESTIONS, one to a line — what this run is to answer that a rehearsal cannot");
  const script = earlier?.actions ?? null;
  if (MODE === "rehearsal") {
    assert(Array.isArray(charter.rehearsal) && charter.rehearsal.length, `the ${charter.name} charter has no rehearsal script`);
    installRehearsal({ charter, forget: FORGETFUL });
  }

  // A charter with beats is a long run (issue #373): its own caps, the table
  // read as data after every action, beats walked by a pointer.
  const LONG = Array.isArray(charter.beats) && charter.beats.length > 0;
  const caps = { ...config.caps, ...(charter.caps ?? {}) };
  const startedAt = new Date();
  const runId = `${charter.name}-${MODE}-${stamp(startedAt)}`;
  const dir = path.join(ARTIFACTS, "explore", runId);
  const out = writer(dir);
  const budget = createBudget({ caps, prices: config.prices.usdPerMillionTokens });
  const runnerRequests = [];     // the player's calls
  const actions = [];
  const stalls = [];
  const accepted = [];           // what the GM's rules answered
  const scripted = [];           // the rolls the runner scripted: { step, beat, moves, faces }
  const interruptions = [];      // what the runner did to the table: { step, beat, did, result }
  const pointer = LONG ? createPointer(charter.beats) : null;
  let notebook = [];
  let lastLine = "";
  let pricedAt = null;           // the beat whose scripted miss also scripted its price
  let stepNow = SETUP_STEP;
  let infrastructure = null;
  let stopped = null;            // why the player's turns ended
  let diverged = null;           // replay: the first action that could not be taken again
  let dice = [];
  let random = {};               // the module's other randomness, kept by client and by file
  let observer = null;
  let harness = null;
  let gm = null;
  let player = null;
  let world = null;
  let ids = null;
  let stopRules = () => {};

  // The caps stop the run from the inside; this stops a run that is stuck.
  const hardStop = setTimeout(() => {
    log("FAIL  the run outlived its wall-clock cap by ten minutes — stopping the process");
    process.exit(1);
  }, (CALLS ? caps.minutes + 20 : Math.max(25, caps.minutes)) * 60_000);
  hardStop.unref();

  log(`${charter.name} charter, ${MODE} mode — evidence in ${path.relative(process.cwd(), dir)}`);
  if (MODE === "rehearsal") log(`a rehearsal: the model API is stood in for${FORGETFUL ? " — by a narrator that keeps nothing" : ""}`);
  if (CALLS) log(`caps: ${caps.actions} actions, ${caps.calls} model calls, ${caps.minutes} minutes, $${caps.usd} — player ${config.player.model}`);

  const browser = await chromium.launch();
  try {
    harness = createClaudeHarness({
      mode:      CALLS ? "record" : "replay",
      recording: CALLS ? null : earlier.recording,
      apiKey:    API_KEY,
      log,
      gate: CALLS ? {
        before: (call) => budget.reserve({ ...call, role: "module" }),
        after:  (id, { usage }) => budget.settle(id, { usage }),
      } : null,
    });
    gm = await openClient(browser, "gm", { prepare: async (page) => {
      await harness.attach(page, "gm");
      await page.addInitScript(installDiceScript);
      await page.addInitScript(installRefusalTrace);
    } });
    // The player's client rolls too: an oracle asked in chat is rolled where it was typed.
    player = await openClient(browser, "player", { prepare: async (page) => {
      await harness.attach(page, "player");
      await page.addInitScript(installDiceScript);
      await page.addInitScript(installRefusalTrace);
    } });

    await join(gm, GM_NAME, log);
    await waitForQuietWorld(gm);
    ids = await setUpWorld(gm, charter);
    await join(player, PLAYER_NAME, log);
    // A player has the chat in front of them.
    await player.page.evaluate(() => {
      try { ui.sidebar?.expand?.(); ui.sidebar?.changeTab?.("chat", "primary"); }
      catch (err) { console.warn("explore: the chat tab could not be opened", err); }
    });
    world = await versions(gm, browser);
    log(`world seeded ${JSON.stringify(ids)} — Foundry ${world.foundry}, ${world.system}, module ${world.module}`);

    // The dice: kept as they fall, and in a replay scripted from the run
    // replayed. The module's other randomness — an oracle's d100, a price
    // paid — is kept the same way, by the file that asked for it, on both
    // pages: a replay that rolled a different price would not be a replay.
    await gm.page.evaluate(({ queue, other }) => {
      window.__sfcRolled = [];
      if (queue) window.__sfcDice = queue;
      window.__sfcRandomKept = {};
      if (other) window.__sfcRandomQueue = other;
    }, { queue: earlier?.dice ?? null, other: earlier?.random?.gm ?? null });
    await player.page.evaluate((other) => { window.__sfcRandomKept = {}; if (other) window.__sfcRandomQueue = other; }, earlier?.random?.player ?? null);

    // The scripted roll of the beat the player is on, until it has been used
    // — and, in a rehearsal, the charter's other rolls (`rehearsalDice`), so
    // that a rehearsal walks the same road every time. A replay scripts
    // nothing: its dice are the run's, as they fell.
    const armedNow = () => {
      if (!pointer || MODE === "replay") return [];
      const cur = pointer.current();
      const beat = cur?.beat.dice && !cur.state.diceUsed ? [{ ...cur.beat.dice, beat: cur.beat.n }] : [];
      return [...beat, ...(MODE === "rehearsal" ? charter.rehearsalDice ?? [] : [])];
    };
    stopRules = startGmRules(gm, {
      cast: Object.values(charter.cast ?? {}), pcId: ids.pcId, log,
      state: () => ({ armed: armedNow(), lastLine }),
      onAnswer: (a) => {
        accepted.push({ step: stepNow, did: a.did, note: a.note ?? null });
        log(`  (GM) ${a.did}${a.note ? ` — ${a.note}` : ""}${a.scripted ? ` — scripted dice ${a.scripted.join(", ")}${a.price ? `, its price ${a.price}` : ""}` : ""}`);
        if (a.price) pricedAt = a.beat;
        const cur = pointer?.current();
        if (a.scripted) {
          // A beat's scripted roll is used once; a rehearsal's own are not counted.
          if (a.beat != null && cur?.beat.n === a.beat) cur.state.diceUsed = true;
          scripted.push({ step: stepNow, beat: a.beat ?? null, move: a.note, faces: a.scripted, ...(a.price ? { price: a.price } : {}), rehearsalOnly: a.beat == null });
        }
        if (a.notScripted) log(`      not scripted: ${a.notScripted}`);
      },
    });

    await trackWorldWrites(gm);
    observer = createObserver({ gm, facts: charter.facts, playerId: ids.playerId, notMemory: config.notMemory ?? [], detail: LONG });
    await observer.observe(SETUP_STEP);
    const table = { gm, player, harness, ignoreWindows: config.ignoreWindows ?? [] };
    const theRun = () => ({ marks: observer.marks, messages: observer.messages, actions, charter });

    const persist = () => {
      out.json("actions.json", actions);
      out.text("transcript.md", transcriptMarkdown(charter, observer.messages));
      if (pointer) out.json("beats.json", pointer.state);
    };

    /** The runner's own actions at the table, by a beat's `interruption`. */
    const INTERRUPTIONS = {
      gmReload: () => reloadGm(gm, { reinstall: () => trackWorldWrites(gm) }),
      endSessionCancelled: () => cancelEndSession(player),
      xCard: () => playXCard(player, gm),
      rename: (beat) => renameConnection(gm, beat.check.from, beat.check.to),
    };

    /**
     * Move the pointer as far as the world allows, making each interruption
     * the pointer arrives at: the runner acts, the table settles, the world is
     * read again, and the beat is checked.
     */
    const walkBeats = async (step) => {
      if (!pointer) return;
      for (;;) {
        for (const change of pointer.advance(theRun(), step)) log(`      beat ${change.n} ${change.status.toUpperCase()} — ${change.detail}`);
        const cur = pointer.current();
        // A scripted price is its beat's: what was queued and not rolled is dropped with the beat.
        if (pricedAt != null && cur?.beat.n !== pricedAt && MODE !== "replay") {
          pricedAt = null;
          await gm.page.evaluate(() => { delete window.__sfcRandomQueue; });
        }
        if (!cur?.beat.interruption || cur.state.interrupted) return;
        // An interruption that waits for a line of play: the player says one first.
        if (cur.beat.after === "line") {
          const answered = cur.state.steps.some(st => actions.find(a => a.step === st)?.action?.action === "say"
            && observer.messages.some(m => m.step === st && m.narrator));
          if (!answered) {
            if (cur.state.sinceProgress >= STALL_LINES) pointer.giveUp(step, `no line of play was answered in ${cur.state.sinceProgress} actions, so there was nothing to interrupt`);
            else return;
            continue;
          }
        }
        const make = INTERRUPTIONS[cur.beat.interruption];
        assert(make, `beat ${cur.beat.n} names an interruption the runner does not know (${cur.beat.interruption})`);
        step = `x${cur.beat.n}`;
        stepNow = step;
        harness.setStep(step);
        log(`${step}  (runner) interruption: ${cur.beat.interruption}`);
        const made = await make(cur.beat);
        const settled = await settle(table, Date.now());
        if (!settled.settled) stalls.push({ step, detail: settled.detail, waitingOnGm: settled.waitingOnGm ?? [] });
        pointer.interrupted();
        if (!cur.state.steps.includes(step)) cur.state.steps.push(step);
        interruptions.push({ step, beat: cur.beat.n, ...made });
        log(`      ${made.did} — ${made.result}`);
        await observer.observe(step, { settled: settled.settled, waitingOnGm: !!settled.waitingOnGm?.length });
        persist();
      }
    };

    for (let i = 1; !stopped; i++) {
      await walkBeats(stepNow);
      if (pointer?.finished()) { stopped = "every beat has been walked"; break; }
      const cap = budget.exhausted();
      if (cap) { stopped = `the ${cap.cap} cap was reached (${cap.detail})`; break; }
      if (script && i > script.length) { stopped = "the script ended"; break; }
      // The cap is checked before the player is asked — no model call is
      // spent on an action that could not be taken — and counted once it is.
      if (!budget.canAct()) { budget.takeAction(); stopped = `the ${budget.exhausted().cap} cap was reached (${budget.exhausted().detail})`; break; }

      stepNow = `a${i}`;
      harness.setStep(stepNow);
      let screen = await snapshotScreen(player, { ignoreWindows: config.ignoreWindows ?? [] });
      let action = null;
      if (script) {
        // The window or card a scripted action needs may still be on its way.
        let resolved = resolveScripted(script[i - 1], screen);
        for (let tries = 0; !resolved.ok && tries < 40; tries++) {
          await sleep(500);
          screen = await snapshotScreen(player, { ignoreWindows: config.ignoreWindows ?? [] });
          resolved = resolveScripted(script[i - 1], screen);
        }
        if (!resolved.ok) {
          diverged = { step: stepNow, action: script[i - 1], problem: resolved.problem };
          stopped = `${stepNow} could not be taken: ${resolved.problem}`;
          actions.push({ step: stepNow, scripted: script[i - 1], screen: describeScreen(screen), problem: resolved.problem });
          break;
        }
        action = resolved.action;
      } else {
        const asked = runnerRequests.length;
        const choice = await chooseAction({
          apiKey: API_KEY, ...config.player, charter, history: actions, snapshot: screen, notebook, beat: pointer?.brief() ?? null,
          budget, requestLog: runnerRequests,
        });
        for (const r of runnerRequests.slice(asked)) r.step = stepNow;
        if (!choice.action) {
          actions.push({ step: stepNow, screen: describeScreen(screen), problem: choice.problem });
          if (choice.kind === "budget") stopped = choice.problem;
          else if (choice.kind === "api") { infrastructure = `the player model could not be reached — ${choice.problem}`; stopped = infrastructure; }
          else stopped = `the player model gave no usable action — ${choice.problem}`;
          break;
        }
        action = choice.action;
      }

      budget.takeAction();
      notebook = keepNote(notebook, action);
      const beatNow = pointer?.current()?.beat ?? null;
      log(`${stepNow}  ${beatNow ? `[beat ${beatNow.n}] ` : ""}${summariseAction(action)}${action.reason && action.action !== "stop" ? `   — ${action.reason}` : ""}`);
      if (action.action === "stop") {
        actions.push({ step: stepNow, action, summary: summariseAction(action), scripted: scriptedForm(action, screen), beat: beatNow?.n ?? null, screen: describeScreen(screen) });
        stopped = `the player stopped: ${action.reason || "no reason given"}`;
        break;
      }
      pointer?.record(stepNow);
      if (action.action === "say" && !action.text.startsWith("!")) lastLine = action.text;
      const callsBefore = harness.requests.length;
      const t0 = Date.now();
      // A line of play in an open session is settled once it has been answered.
      const isLine = action.action === "say" && !action.text.startsWith("!") && observer.marks.at(-1)?.session?.active === true;
      const known = isLine ? await messageIds(gm) : null;
      const outcome = await executeAction(player, action);
      const settled = action.action === "wait" || !outcome.ok ? { settled: true, ms: 0 } : await settle(table, Date.now(), { line: known });
      if (settled.unanswered) log(`      nothing answered the line in ${Math.round(REPLY_WAIT_MS / 1000)} s`);
      if (!outcome.ok) log(`      the action did not land: ${outcome.detail}`);
      if (!settled.settled) { stalls.push({ step: stepNow, detail: settled.detail, waitingOnGm: settled.waitingOnGm ?? [] }); log(`      STALL ${settled.detail}`); }
      const mark = await observer.observe(stepNow, { settled: settled.settled, waitingOnGm: !!settled.waitingOnGm?.length });
      // From the line to the first narration that answers it, by the messages' own clocks.
      const mine = observer.messages.filter(m => m.step === stepNow);
      const saidAt = action.action === "say" ? mine.find(m => m.fromPlayer)?.timestamp ?? null : null;
      const repliedAt = saidAt ? mine.filter(m => m.narrator && m.timestamp >= saidAt).map(m => m.timestamp).sort((a, b) => a - b)[0] ?? null : null;
      actions.push({
        step: stepNow, action, summary: summariseAction(action), scripted: scriptedForm(action, screen), outcome, settled, beat: beatNow?.n ?? null,
        phase: mark.phase, calls: harness.requests.length - callsBefore, ms: Date.now() - t0, saidAt, repliedAt, screen: describeScreen(screen),
      });
      persist();
      if (!settled.settled) { stopped = `the table never settled after ${stepNow}`; break; }
    }

    stepNow = AFTER_STEP;
    harness.setStep(AFTER_STEP);
    await harness.idle({ quietMs: QUIET_MS, timeoutMs: 30_000 });
    await observer.observe(AFTER_STEP, { settled: true });
    if (pointer) for (const change of pointer.advance(theRun(), AFTER_STEP)) log(`      beat ${change.n} ${change.status.toUpperCase()} — ${change.detail}`);
    dice = await gm.page.evaluate(() => window.__sfcRolled ?? []);
    random = {
      gm: await gm.page.evaluate(() => window.__sfcRandomKept ?? {}),
      player: await player.page.evaluate(() => window.__sfcRandomKept ?? {}),
    };
    persist();
    log(`the player's turns ended: ${stopped}`);
  } catch (err) {
    infrastructure = `${stepNow}: ${err?.message ?? err}`;
    log(`FAIL  ${err?.stack ?? err}`);
    if (gm && player) await logPageState([gm, player], log).catch(() => {});
  }

  // ── the verdict, and the evidence ──────────────────────────────────────────
  stopRules();
  try {
    const moduleRequests = (harness?.requests ?? []).map(({ n, client, step, kind, model, source, status, system, user, startedAt: at, ms, usage }) => ({ n, client, step, kind, model, source, status: status ?? null, at: at ? at - startedAt.getTime() : null, ms: ms ?? null, usage: usage ?? null, system, user }));
    const failedCalls = moduleRequests.filter(r => r.status && r.status !== 200);
    if (!infrastructure && failedCalls.length) {
      infrastructure = `${failedCalls.length} of the module's model call(s) failed (the first: ${failedCalls[0].kind} → HTTP ${failedCalls[0].status})`;
    }
    const marks = observer?.marks ?? [];
    const messages = observer?.messages ?? [];
    const refusedWrites = [];
    for (const c of [gm, player].filter(Boolean)) {
      const kept = await c.page.evaluate(() => (window.__sfcRefused ?? []).slice(0, 20)).catch(() => []);
      refusedWrites.push(...kept.map(r => ({ client: c.label, ...r })));
    }
    const health = healthOf({ endSession: marks.at(-1)?.session ?? null, clients: [gm, player].filter(Boolean), stalls, knownErrors: config.knownErrors ?? [], refused: refusedWrites });
    for (const r of refusedWrites) log(`refused write on the ${r.client}'s page — ${r.method} ${r.document}${r.parent ? ` in ${r.parent}` : ""}: ${r.message}\n${r.stack}`);

    // The goal: a memory charter's one question, or a long run's beats, checks and ledger.
    let outcome = null;
    let long = null;
    if (LONG) {
      // The ledger, the mechanical checks, the baits and the leaks — scored
      // as rescore.mjs scores them again from this run's evidence.
      long = scoreLongRun({ charter, beats: pointer.state, marks, messages, actions, requests: moduleRequests, dice: MODE === "replay" ? null : dice, scripted });
      outcome = { status: "walked", reason: `${long.summary.done} of ${long.summary.beats} beats done, ${long.summary.failed} failed, ${long.summary.notExercised} not exercised`, failingLayer: null, asks: [], milestones: long.summary };
    } else {
      outcome = scoreMemory({ facts: charter.facts, askCues: charter.ask?.cues ?? [], marks, messages, requests: moduleRequests });
    }

    const spend = budget.report();
    const verdict = LONG
      ? classifyLongRun({ infrastructure, budgetStop: spend.stopped, health, beats: long.beats, mechanics: long.mechanics, ledger: long.ledger })
      : classifyRun({ infrastructure, budgetStop: spend.stopped, outcome, health });
    const expected = earlier?.expected ?? null;
    // A replay re-makes the observer's finding — the goal's score and the
    // health checks; for a long run, each beat's status and the checks
    // violated — and that is what is compared, not the run's class: a run
    // kept from when an API reviewer's flags could colour the class (the
    // first, 2026-11-22) still reproduces.
    const found = LONG
      ? { beats: Object.fromEntries(long.beats.map(b => [b.id, b.status])), violations: long.mechanics.violations.map(v => v.check).sort(), healthFailed: health.failures.length > 0 }
      : { status: outcome.status, failingLayer: outcome.failingLayer, healthFailed: health.failures.length > 0 };
    const reproduced = expected
      ? !diverged && (LONG
        ? JSON.stringify(expected.beats) === JSON.stringify(found.beats) && JSON.stringify(expected.violations) === JSON.stringify(found.violations) && expected.healthFailed === found.healthFailed
        : expected.status === found.status && expected.failingLayer === found.failingLayer && expected.healthFailed === found.healthFailed)
      : null;

    out.json("observer.json", { outcome, health, marks, autopilot: accepted, messages });
    out.json("requests.json", { module: moduleRequests, runner: runnerRequests });
    out.text("transcript.md", transcriptMarkdown(charter, messages));
    out.json("actions.json", actions);
    const run = {
      id: runId, mode: MODE, startedAt: startedAt.toISOString(), classification: verdict.classification, because: verdict.because,
      questions: QUESTIONS,
    };
    if (CALLS || LONG) {
      // What the review is written from: every number that is arithmetic. A
      // charter without beats has its goal where a long run has beats.
      const { allCalls, data } = reviewDataOf({
        moduleRequests, runnerRequests, actions, messages, beats: long?.beats ?? [], autopilot: accepted,
        prices: config.prices.usdPerMillionTokens, spend,
      });
      if (LONG) {
        out.json("beats.json", long.beats);
        out.json("mechanics.json", long.mechanics);
        out.json("ledger.json", { ...long.ledger, baits: long.baits, plans: long.leaks });
      }
      out.json("review-data.json", { ...data, scripted, interruptions });
      out.json("actions.json", actions);
      out.text("annotated-transcript.md", annotatedTranscript({ charter, run, actions, messages, requests: allCalls, autopilot: accepted, beats: long?.beats ?? [], mechanics: long?.mechanics ?? null, interruptions }));
      out.text("scorecard.md", scorecard({
        charter, run, goal: LONG ? null : outcome,
        beats: long?.beats ?? [], mechanics: long?.mechanics ?? null, ledger: long?.ledger ?? null, baits: long?.baits ?? [], leaks: long?.leaks ?? [], ...data,
      }));
    }
    const replayable = MODE !== "replay" && actions.some(a => a.scripted);
    if (replayable) {
      out.json("replay.json", {
        charter,
        actions:   actions.filter(a => a.scripted).map(a => a.scripted),
        dice,
        random,
        recording: harness.recordingOut({ scenario: `explore-${charter.name}`, scenarioFile: `charters/${charter.name}.json`, passed: true, commit: process.env.EXPLORE_COMMIT || null, runner: "test/ci/playwright/explore.mjs" }),
        expected:  { ...found, classification: verdict.classification },
      });
    }
    for (const c of [gm, player].filter(Boolean)) await c.page.screenshot({ path: path.join(dir, `end-${c.label}.png`) }).catch(() => {});

    out.json("run.json", {
      schema: 1,
      charter: charter.name, mode: MODE,
      questions: QUESTIONS.length ? QUESTIONS : undefined,
      startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
      commit: process.env.EXPLORE_COMMIT || null,
      versions: world,
      models: MODE === "live"
        ? { player: config.player, module: [...new Set(moduleRequests.map(r => r.model).filter(Boolean))] }
        : "none — no model was called",
      prices: CALLS ? config.prices : undefined,
      settings: charter.settings ?? {},
      classification: verdict.classification,
      because: verdict.because,
      note: MODE === "rehearsal"
        ? "a rehearsal: every reply came from lib/rehearsal.mjs, so the result describes the runner and the module's own memory path, not the narrator — and the budget's dollars are what calls of these sizes would be priced at, not money spent"
        : undefined,
      playerStopped: stopped,
      goal: LONG
        ? { status: outcome.status, reason: outcome.reason, beats: long.summary, checks: { made: long.mechanics.checks, violated: long.mechanics.violations.length }, ledger: long.ledger.totals, scripted, interruptions }
        : { status: outcome.status, reason: outcome.reason, failingLayer: outcome.failingLayer, milestones: outcome.milestones },
      health: {
        failures: health.failures, waitingOnGm: health.waitingOnGm, costsOwed: health.costsOwed, knownFailures: health.knownFailures, errors: health.errors.length,
        uncaught: [gm, player].filter(Boolean).flatMap(c => (c.pageErrors ?? []).slice(0, 5).map(e => ({ client: c.label, ...e }))),
        // A write the server refused, with the stack of the code that asked for it.
        refused: refusedWrites,
      },
      budget: spend,
      replay: MODE === "replay"
        ? { of: path.relative(process.cwd(), REPLAY_FROM), expected, found, reproduced, diverged }
        : replayable ? `EXPLORE_MODE=replay EXPLORE_REPLAY=${path.relative(process.cwd(), dir)} node explore.mjs` : null,
    });

    log(`goal: ${outcome.status} — ${outcome.reason}`);
    for (const ask of outcome.asks) {
      for (const f of ask.facts) log(`  ${ask.step} "${ask.line.slice(0, 60)}" · ${f.id}: stored ${f.stored ? "yes" : "no"}, in the prompt ${f.inPrompt ? "yes" : "no"}, in the answer ${f.inAnswer ? "yes" : "no"}`);
    }
    if (LONG) {
      for (const b of long.beats) log(`  beat ${String(b.n).padStart(2)} ${b.status.padEnd(13)} ${b.actions} action(s) — ${b.detail}`);
      log(`mechanics: ${long.mechanics.checks} checks, ${long.mechanics.violations.length} violated`);
      for (const v of long.mechanics.violations) log(`  ${v.step} ${v.check}: ${v.detail}`);
      const t = long.ledger.totals;
      log(`ledger: ${t.recalled} recalled, ${t.carriedUnasked} carried unasked, ${t.lost} lost, ${t.refused} refused, ${t.notProbed} not probed, ${t.notPlanted} not planted of ${t.facts}`);
      for (const f of long.ledger.facts) log(`  ${f.id} ${f.verdict}${f.failingLayer ? ` (${f.failingLayer})` : ""} — planted ${f.plantedAt ?? "never"}; probes ${f.probes.filter(p => p.asked).map(p => `${p.id}@${p.step}:${p.inAnswer ? "answered" : p.failingLayer}${p.counted ? "" : "(not counted)"}`).join(" ") || "none"}`);
    }
    for (const failure of health.failures) log(`health: ${failure}`);
    if (health.costsOwed.length) log(`left owed: ${health.costsOwed.length} cost card(s) nobody answered — ${costsOwedText(health.costsOwed)}`);
    if (health.waitingOnGm.length) log(`the GM's screen was left waiting on: ${health.waitingOnGm.join(", ")}`);
    if (CALLS) log(`${MODE === "live" ? "spent" : "priced at"} $${spend.usd.toFixed(4)} of $${caps.usd} — ${spend.calls} model calls, ${spend.actions} actions, ${spend.minutes} minutes`);
    log(`RESULT ${verdict.classification} — ${verdict.because}`);
    if (expected) log(reproduced ? "REPRODUCED the run it replays" : `DIVERGED from the run it replays (that run: ${JSON.stringify(expected)}${diverged ? `; ${diverged.step}: ${diverged.problem}` : ""})`);
    if (verdict.classification === "infrastructure-error" || health.failures.length) logConsoleErrors([gm, player].filter(Boolean), log);
    process.exitCode = verdict.classification === "infrastructure-error" || reproduced === false ? 1 : 0;
  } finally {
    if (gm) await restoreWorld(gm, log);
    await browser.close().catch(() => {});
  }
}

/** Actions a beat's interruption waits for a line of play before it is given up. */
const STALL_LINES = 8;

main().catch((err) => {
  log(`FAIL  ${err?.stack ?? err}`);
  process.exitCode = 1;
});
