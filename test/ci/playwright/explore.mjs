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
// (rules/ci-e2e.md → "AI exploration"). An API reviewer — a model that reads
// the transcript alone and flags passages, with quotes (lib/reviewer.mjs) —
// is off unless explore.config.json turns it on: it sees none of the prompts
// or the records the helpers write, which is where the first reviewed run's
// findings were. A rehearsal always runs it, so the option does not rot.
//
// On demand only: nothing in CI runs this, and it never files an issue,
// changes code or rewrites a recording. It writes evidence, for a person.
//
// Modes (EXPLORE_MODE):
//   live      — the player and the narrator are real models.
//               Needs ANTHROPIC_API_KEY; spends money, up to the caps.
//   rehearsal — the live path, whole — the budget's gate, the player's tool
//               calls, the reviewer, the recording — with the Messages API
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
//   requests.json   every prompt and reply — the module's, the player's, the
//                   reviewer's — with usage and no headers
//   review.json     the API reviewer's flags, when it is on (advisory)
//   replay.json     the actions, dice and replies a replay needs
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
import { installDiceScript, waitForQuietWorld, setUpWorld, restoreWorld, PLAYER_NAME } from "./lib/world.mjs";
import { createBudget } from "./lib/budget.mjs";
import {
  snapshotScreen, describeScreen, executeAction, chooseAction, summariseAction, scriptedForm, resolveScripted,
} from "./lib/player.mjs";
import { createObserver, scoreMemory, healthOf, classifyRun } from "./lib/observer.mjs";
import { reviewTranscript } from "./lib/reviewer.mjs";
import { installRehearsal } from "./lib/rehearsal.mjs";

const MODE        = ["rehearsal", "replay"].includes(process.env.EXPLORE_MODE) ? process.env.EXPLORE_MODE : "live";
// A rehearsal runs the live code with a stand-in behind it.
const CALLS       = MODE !== "replay";
const FORGETFUL   = process.env.EXPLORE_REHEARSAL_FORGET === "1";
const CHARTER     = process.env.EXPLORE_CHARTER || "memory";
const REPLAY_FROM = process.env.EXPLORE_REPLAY ? path.resolve(process.env.EXPLORE_REPLAY) : null;
const API_KEY     = MODE === "live" ? process.env.ANTHROPIC_API_KEY || null : MODE === "rehearsal" ? "rehearsal-not-a-key" : null;
const SETTLE_MS   = MODE === "live" ? 180_000 : 60_000;

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
  return null;
}

// ── the table ────────────────────────────────────────────────────────────────

/** Windows that ask something of whoever sees them: Foundry's dialogs and the module's own. */
const ASKING = "dialog[open], .application.dialog, .application.sf-window";

/**
 * The GM's half of the table, on autopilot. What the module asks of the GM
 * before a move rolls is answered without steering the story: the proposed
 * move is accepted as proposed, and "Who are you interacting with?" — asked
 * of the GM before the dice, where it holds the move (decisions.md, issue
 * #347 D1) — is answered "No specific entity", which is what closing it
 * means. The GM does nothing else: the run is the player's. A window on the
 * GM's screen that is not listed here is left open, and the run says so.
 */
const GM_AUTOPILOT = [
  { window: ".move-confirm-dialog", press: '[data-action="accept"]', did: "accepted the proposed move", note: { selector: ".confirm-move-id", attribute: "data-move-id" } },
  { window: ".sf-clarification-dialog", press: '[data-action="none"]', did: 'answered "Who are you interacting with?" with "No specific entity"', note: null },
];

function startGmAutopilot(gm, onAnswer) {
  let busy = false;
  let warned = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const answered = await gm.page.evaluate((rules) => {
        for (const rule of rules) {
          const asking = [...document.querySelectorAll(rule.window)].at(-1);
          const button = asking?.querySelector(rule.press);
          if (!button || button.dataset.sfcAnswered) continue;
          button.dataset.sfcAnswered = "1";
          const note = rule.note ? asking.querySelector(rule.note.selector)?.getAttribute(rule.note.attribute) ?? null : null;
          button.click();
          return { did: rule.did, note };
        }
        return null;
      }, GM_AUTOPILOT);
      if (answered) onAnswer(answered);
    } catch (err) {
      // The page is navigating or closing; said once, not every 400 ms.
      if (!warned) { warned = true; log(`  (GM) the autopilot could not read the page: ${String(err?.message ?? err).split("\n")[0]}`); }
    } finally { busy = false; }
  }, 400);
  return () => clearInterval(timer);
}

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
  }, { id: MODULE_ID, asking: ASKING, answered: GM_AUTOPILOT.map(rule => rule.window) }),
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

/**
 * Wait for the table to finish with an action: the move lock free, no
 * confirmation open, and nothing new for a while — no model call in flight or
 * just started, no write in the GM's world — counted from the action itself,
 * so a table that has not begun to answer is not taken for one that is done.
 * A dialog open on the player's own screen ends the wait sooner: the table is
 * waiting on them. A window on the GM's screen that the autopilot does not
 * answer ends it too, unsettled: the table is waiting on a GM who is not there.
 */
async function settle({ gm, player, harness, ignoreWindows }, actedAt) {
  const started = Date.now();
  let state = null;
  while (Date.now() - started < SETTLE_MS) {
    state = await tableState(gm, player, ignoreWindows);
    const calls = harness.quietMs();
    const quiet = Math.min(calls, state.worldQuietMs, Date.now() - actedAt);
    const busy = state.pendingMove || state.beingAnswered || calls === 0;
    if (!busy && quiet >= QUIET_MS) return { settled: true, ms: Date.now() - started };
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
  const script = earlier?.actions ?? null;
  if (MODE === "rehearsal") {
    assert(Array.isArray(charter.rehearsal) && charter.rehearsal.length, `the ${charter.name} charter has no rehearsal script`);
    installRehearsal({ charter, forget: FORGETFUL });
  }

  const REVIEWER = MODE === "rehearsal" || (MODE === "live" && config.reviewer?.enabled === true);
  const startedAt = new Date();
  const dir = path.join(ARTIFACTS, "explore", `${charter.name}-${MODE}-${stamp(startedAt)}`);
  const out = writer(dir);
  const budget = createBudget({ caps: config.caps, prices: config.prices.usdPerMillionTokens });
  const runnerRequests = [];     // the player's and the reviewer's calls
  const actions = [];
  const stalls = [];
  const accepted = [];           // what the GM's autopilot answered
  let stepNow = SETUP_STEP;
  let infrastructure = null;
  let stopped = null;            // why the player's turns ended
  let diverged = null;           // replay: the first action that could not be taken again
  let dice = [];
  let observer = null;
  let harness = null;
  let gm = null;
  let player = null;
  let review = null;
  let world = null;
  let stopAutopilot = () => {};

  log(`${charter.name} charter, ${MODE} mode — evidence in ${path.relative(process.cwd(), dir)}`);
  if (MODE === "rehearsal") log(`a rehearsal: the model API is stood in for${FORGETFUL ? " — by a narrator that keeps nothing" : ""}`);
  if (CALLS) log(`caps: ${config.caps.actions} actions, ${config.caps.calls} model calls, ${config.caps.minutes} minutes, $${config.caps.usd} — player ${config.player.model}, API reviewer ${REVIEWER ? config.reviewer.model : "off"}`);

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
    } });
    player = await openClient(browser, "player", { prepare: (page) => harness.attach(page, "player") });

    await join(gm, GM_NAME, log);
    await waitForQuietWorld(gm);
    const ids = await setUpWorld(gm, charter);
    await join(player, PLAYER_NAME, log);
    // A player has the chat in front of them.
    await player.page.evaluate(() => {
      try { ui.sidebar?.expand?.(); ui.sidebar?.changeTab?.("chat", "primary"); }
      catch (err) { console.warn("explore: the chat tab could not be opened", err); }
    });
    world = await versions(gm, browser);
    log(`world seeded ${JSON.stringify(ids)} — Foundry ${world.foundry}, ${world.system}, module ${world.module}`);

    // The dice: kept as they fall, and in a replay scripted from the run replayed.
    await gm.page.evaluate((queue) => { window.__sfcRolled = []; if (queue) window.__sfcDice = queue; }, earlier?.dice ?? null);
    stopAutopilot = startGmAutopilot(gm, (a) => { accepted.push({ step: stepNow, ...a }); log(`  (GM) ${a.did}${a.note ? ` — ${a.note}` : ""}`); });

    await trackWorldWrites(gm);
    observer = createObserver({ gm, facts: charter.facts, playerId: ids.playerId, notMemory: config.notMemory ?? [] });
    await observer.observe(SETUP_STEP);

    const persist = () => {
      out.json("actions.json", actions);
      out.text("transcript.md", transcriptMarkdown(charter, observer.messages));
    };

    for (let i = 1; !stopped; i++) {
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
        const choice = await chooseAction({
          apiKey: API_KEY, ...config.player, charter, history: actions, snapshot: screen, budget, requestLog: runnerRequests,
        });
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
      log(`${stepNow}  ${summariseAction(action)}${action.reason && action.action !== "stop" ? `   — ${action.reason}` : ""}`);
      if (action.action === "stop") {
        actions.push({ step: stepNow, action, scripted: scriptedForm(action, screen), screen: describeScreen(screen) });
        stopped = `the player stopped: ${action.reason || "no reason given"}`;
        break;
      }
      const callsBefore = harness.requests.length;
      const t0 = Date.now();
      const outcome = await executeAction(player, action);
      const settled = action.action === "wait" || !outcome.ok ? { settled: true, ms: 0 } : await settle({ gm, player, harness, ignoreWindows: config.ignoreWindows ?? [] }, Date.now());
      if (!outcome.ok) log(`      the action did not land: ${outcome.detail}`);
      if (!settled.settled) { stalls.push({ step: stepNow, detail: settled.detail, waitingOnGm: settled.waitingOnGm ?? [] }); log(`      STALL ${settled.detail}`); }
      const mark = await observer.observe(stepNow);
      actions.push({
        step: stepNow, action, scripted: scriptedForm(action, screen), outcome, settled,
        phase: mark.phase, calls: harness.requests.length - callsBefore, ms: Date.now() - t0, screen: describeScreen(screen),
      });
      persist();
      if (!settled.settled) { stopped = `the table never settled after ${stepNow}`; break; }
    }

    stepNow = AFTER_STEP;
    harness.setStep(AFTER_STEP);
    await harness.idle({ quietMs: QUIET_MS, timeoutMs: 30_000 });
    await observer.observe(AFTER_STEP);
    dice = await gm.page.evaluate(() => window.__sfcRolled ?? []);
    persist();
    log(`the player's turns ended: ${stopped}`);
  } catch (err) {
    infrastructure = `${stepNow}: ${err?.message ?? err}`;
    log(`FAIL  ${err?.stack ?? err}`);
    if (gm && player) await logPageState([gm, player], log).catch(() => {});
  }

  // ── the verdict, and the evidence ──────────────────────────────────────────
  stopAutopilot();
  try {
    const moduleRequests = (harness?.requests ?? []).map(({ n, client, step, kind, model, source, status, system, user }) => ({ n, client, step, kind, model, source, status: status ?? null, system, user }));
    const failedCalls = moduleRequests.filter(r => r.status && r.status !== 200);
    if (!infrastructure && failedCalls.length) {
      infrastructure = `${failedCalls.length} of the module's model call(s) failed (the first: ${failedCalls[0].kind} → HTTP ${failedCalls[0].status})`;
    }
    const marks = observer?.marks ?? [];
    const messages = observer?.messages ?? [];
    const outcome = scoreMemory({ facts: charter.facts, askCues: charter.ask?.cues ?? [], marks, messages, requests: moduleRequests });
    const health = healthOf({ endSession: marks.at(-1)?.session ?? null, clients: [gm, player].filter(Boolean), stalls, knownErrors: config.knownErrors ?? [] });

    if (REVIEWER && !infrastructure && messages.some(m => m.narrator)) {
      review = await reviewTranscript({ apiKey: API_KEY, ...config.reviewer, messages, canon: charter.canon ?? charter.facts.map(f => f.statement), budget, requestLog: runnerRequests });
      if (!review.ok) log(`the reviewer did not report: ${review.problem}`);
    }

    const spend = budget.report();
    const verdict = classifyRun({ infrastructure, budgetStop: spend.stopped, outcome, health, review: review?.ok ? review : null });
    const expected = earlier?.expected ?? null;
    // A replay re-makes the observer's finding — the goal's score and the
    // health checks. The reviewer is a model and is not asked again, so the
    // run's class, which its flags can colour, is not what is compared.
    const reproduced = expected
      ? !diverged && expected.status === outcome.status && expected.failingLayer === outcome.failingLayer
        && expected.healthFailed === (health.failures.length > 0)
      : null;

    out.json("observer.json", { outcome, health, marks, autopilot: accepted, messages });
    out.json("requests.json", { module: moduleRequests, runner: runnerRequests });
    if (review) out.json("review.json", review);
    out.text("transcript.md", transcriptMarkdown(charter, messages));
    out.json("actions.json", actions);
    const replayable = MODE !== "replay" && actions.some(a => a.scripted);
    if (replayable) {
      out.json("replay.json", {
        charter,
        actions:   actions.filter(a => a.scripted).map(a => a.scripted),
        dice,
        recording: harness.recordingOut({ scenario: `explore-${charter.name}`, scenarioFile: `charters/${charter.name}.json`, passed: true, commit: process.env.EXPLORE_COMMIT || null, runner: "test/ci/playwright/explore.mjs" }),
        expected:  { status: outcome.status, failingLayer: outcome.failingLayer, healthFailed: health.failures.length > 0, classification: verdict.classification },
      });
    }
    for (const c of [gm, player].filter(Boolean)) await c.page.screenshot({ path: path.join(dir, `end-${c.label}.png`) }).catch(() => {});

    out.json("run.json", {
      schema: 1,
      charter: charter.name, mode: MODE,
      startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
      commit: process.env.EXPLORE_COMMIT || null,
      versions: world,
      models: MODE === "live"
        ? { player: config.player, reviewer: REVIEWER ? config.reviewer : "off", module: [...new Set(moduleRequests.map(r => r.model).filter(Boolean))] }
        : "none — no model was called",
      prices: CALLS ? config.prices : undefined,
      settings: charter.settings ?? {},
      classification: verdict.classification,
      because: verdict.because,
      note: MODE === "rehearsal"
        ? "a rehearsal: every reply came from lib/rehearsal.mjs, so the result describes the runner and the module's own memory path, not the narrator — and the budget's dollars are what calls of these sizes would be priced at, not money spent"
        : undefined,
      playerStopped: stopped,
      goal: { status: outcome.status, reason: outcome.reason, failingLayer: outcome.failingLayer, milestones: outcome.milestones },
      health: { failures: health.failures, waitingOnGm: health.waitingOnGm, knownFailures: health.knownFailures, errors: health.errors.length },
      review: review ? { ok: review.ok, flags: review.flags.length, dropped: review.dropped, summary: review.summary, problem: review.problem }
        : "no API reviewer — the run is reviewed by whoever made it",
      budget: spend,
      replay: MODE === "replay"
        ? { of: path.relative(process.cwd(), REPLAY_FROM), expected, reproduced, diverged }
        : replayable ? `EXPLORE_MODE=replay EXPLORE_REPLAY=${path.relative(process.cwd(), dir)} node explore.mjs` : null,
    });

    log(`goal: ${outcome.status} — ${outcome.reason}`);
    for (const ask of outcome.asks) {
      for (const f of ask.facts) log(`  ${ask.step} "${ask.line.slice(0, 60)}" · ${f.id}: stored ${f.stored ? "yes" : "no"}, in the prompt ${f.inPrompt ? "yes" : "no"}, in the answer ${f.inAnswer ? "yes" : "no"}`);
    }
    for (const failure of health.failures) log(`health: ${failure}`);
    if (health.waitingOnGm.length) log(`the GM's screen was left waiting on: ${health.waitingOnGm.join(", ")}`);
    if (review?.ok) log(`reviewer: ${review.flags.length} flag(s)${review.dropped ? `, ${review.dropped} dropped for a quote not in the transcript` : ""}`);
    if (CALLS) log(`${MODE === "live" ? "spent" : "priced at"} $${spend.usd.toFixed(4)} of $${config.caps.usd} — ${spend.calls} model calls, ${spend.actions} actions, ${spend.minutes} minutes`);
    log(`RESULT ${verdict.classification} — ${verdict.because}`);
    if (expected) log(reproduced ? "REPRODUCED the run it replays" : `DIVERGED from the run it replays (that run: ${JSON.stringify(expected)}${diverged ? `; ${diverged.step}: ${diverged.problem}` : ""})`);
    if (verdict.classification === "infrastructure-error" || health.failures.length) logConsoleErrors([gm, player].filter(Boolean), log);
    process.exitCode = verdict.classification === "infrastructure-error" || reproduced === false ? 1 : 0;
  } finally {
    if (gm) await restoreWorld(gm, log);
    await browser.close().catch(() => {});
  }
}

// The caps stop the run from the inside; this stops a run that is stuck.
const hardStop = setTimeout(() => {
  log("FAIL  the run outlived its wall-clock cap by ten minutes — stopping the process");
  process.exit(1);
}, (CALLS ? 40 : 25) * 60_000);
hardStop.unref();

main().catch((err) => {
  log(`FAIL  ${err?.stack ?? err}`);
  process.exitCode = 1;
});
