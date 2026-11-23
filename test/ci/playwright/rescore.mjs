#!/usr/bin/env node
// test/ci/playwright/rescore.mjs
//
// A long run's evidence, scored again by the checks as they are now.
//
// A live run is paid for, and the first thing its review finds is as likely
// to be a fault in a check as a fault in the module (the first live long
// haul, 2026-11-23: four of six alarms were the checks'). When a check is
// corrected, the run is not bought again to learn what the corrected check
// says of it: every verdict of a run is arithmetic over what the observer
// recorded, so it can be done again from the run's own folder — no Foundry,
// no browser, no key, a second or two.
//
//   node rescore.mjs <run folder> [<output folder>]
//
// The run folder is one `explore.mjs` wrote for a charter with beats
// (artifacts/explore/<charter>-<mode>-<time>/): run.json, observer.json,
// actions.json, requests.json, review-data.json, replay.json. The output
// folder (default: <run folder>/rescored) gets what a run writes, scored
// again — beats.json, mechanics.json, ledger.json, review-data.json,
// annotated-transcript.md, scorecard.md — and run.json, transcript.md and
// replay.json beside them, the replay's `expected` brought up to date, each
// saying it is a re-score and what the run's own verdict was. Nothing in the
// run folder is changed.
//
// What a charter says of scoring — its facts with their variants, refusals
// and probes, its baits, each beat's check — is part of the checks: it is
// taken from the charter as it is now (charters/<name>.json), by fact and
// beat id, where that file is there. What the run was given to play with —
// persona, tells, seed, settings, cast — stays the run's own.
//
// The beats keep the steps they had: the player acted on the pointer as it
// stood (lib/longrun.mjs → recheckBeats). What it cannot do is play the run
// differently — a beat the player gave up on because a check misled it is
// re-checked, not replayed.
//
// Exit code: 0 when the re-score was written; 1 when the folder is not a
// long run's evidence.

import fs from "node:fs";
import path from "node:path";
import { classifyLongRun } from "./lib/beats.mjs";
import { recheckBeats, scoreLongRun } from "./lib/longrun.mjs";
import { annotatedTranscript, reviewDataOf, scorecard } from "./lib/review.mjs";
import { sayWithoutIds } from "./lib/player.mjs";

const [from, to] = process.argv.slice(2);
const log = (...a) => console.log("[rescore]", ...a);
const fail = (why) => { console.error(`[rescore] ${why}`); process.exit(1); };

if (!from) fail("usage: node rescore.mjs <run folder> [<output folder>]");
const dir = path.resolve(from);
const read = (name) => {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) fail(`${name} is not in ${dir} — a run's whole evidence folder is needed (the kept folders under explorations/ hold only what a replay needs)`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
};

const run = read("run.json");
const observer = read("observer.json");
const actions = read("actions.json");
const requests = read("requests.json");
const kept = read("review-data.json");
const replay = read("replay.json");
const beatsWas = read("beats.json");
const asRun = replay.charter;
if (!Array.isArray(asRun?.beats) || !asRun.beats.length) fail("the run's charter has no beats: only a long run is re-scored");
const nowFile = path.resolve(path.dirname(new URL(import.meta.url).pathname), "charters", `${asRun.name}.json`);
const now = fs.existsSync(nowFile) ? JSON.parse(fs.readFileSync(nowFile, "utf8")) : null;
const charter = now ? {
  ...asRun,
  facts: asRun.facts.map(f => now.facts?.find(x => x.id === f.id) ?? f),
  baits: (asRun.baits ?? []).map(b => now.baits?.find(x => x.id === b.id) ?? b),
  beats: asRun.beats.map(b => ({ ...b, check: now.beats?.find(x => x.id === b.id)?.check ?? b.check })),
} : asRun;

const { marks, messages } = observer;
const beats = recheckBeats({ charter, beats: beatsWas, marks, messages, actions });
const long = scoreLongRun({ charter, beats, marks, messages, actions, requests: requests.module, dice: replay.dice ?? null, scripted: kept.scripted ?? [] });
const verdict = classifyLongRun({ infrastructure: null, budgetStop: run.budget?.stopped ?? null, health: observer.health, beats: long.beats, mechanics: long.mechanics, ledger: long.ledger });

const commit = process.env.EXPLORE_COMMIT || null;
const rescored = {
  at: new Date().toISOString(), commit,
  was: { classification: run.classification, because: run.because, beats: run.goal?.beats ?? null, ledger: run.goal?.ledger ?? null },
  note: "scored again from this run's evidence by the checks as corrected after it (rescore.mjs); what the table did is unchanged",
  charter: now ? `facts, baits and beat checks as charters/${asRun.name}.json has them now` : "as the run had it",
};
const { allCalls, data } = reviewDataOf({
  moduleRequests: requests.module, runnerRequests: requests.runner, actions, messages, beats: long.beats, autopilot: observer.autopilot ?? [],
  prices: run.prices?.usdPerMillionTokens ?? {}, spend: run.budget,
});
const header = { id: path.basename(dir), mode: run.mode, startedAt: run.startedAt, classification: verdict.classification, because: verdict.because, questions: run.questions ?? [], rescored };

const out = path.resolve(to ?? path.join(dir, "rescored"));
fs.mkdirSync(out, { recursive: true });
const write = (name, text) => fs.writeFileSync(path.join(out, name), text);
const json = (name, value) => write(name, `${JSON.stringify(value, null, 2)}\n`);

json("beats.json", long.beats);
json("mechanics.json", long.mechanics);
json("ledger.json", { ...long.ledger, baits: long.baits, plans: long.leaks });
json("review-data.json", { ...data, scripted: kept.scripted ?? [], interruptions: kept.interruptions ?? [] });
write("annotated-transcript.md", annotatedTranscript({ charter, run: header, actions, messages, requests: allCalls, autopilot: observer.autopilot ?? [], beats: long.beats, mechanics: long.mechanics, interruptions: kept.interruptions ?? [] }));
write("scorecard.md", scorecard({ charter, run: header, beats: long.beats, mechanics: long.mechanics, ledger: long.ledger, baits: long.baits, leaks: long.leaks, ...data }));
json("run.json", {
  ...run, classification: verdict.classification, because: verdict.because, rescored,
  goal: { ...run.goal, status: "walked", reason: `${long.summary.done} of ${long.summary.beats} beats done, ${long.summary.failed} failed, ${long.summary.notExercised} not exercised`, beats: long.summary, checks: { made: long.mechanics.checks, violated: long.mechanics.violations.length }, ledger: long.ledger.totals },
});
// A typed line that names a truth by its id is kept by what the id stood
// before on the screen it was typed on: ids differ in every world.
const steps = actions.filter(a => a.scripted);
const scriptedActions = replay.actions.map((sc, i) => (sc.action === "say" && !sc.truth ? sayWithoutIds(sc, steps[i]?.screen ?? "") : sc));
json("replay.json", {
  ...replay, charter, rescored, actions: scriptedActions,
  expected: { beats: Object.fromEntries(long.beats.map(b => [b.id, b.status])), violations: long.mechanics.violations.map(v => v.check).sort(), healthFailed: (observer.health?.failures ?? []).length > 0, classification: verdict.classification },
});
if (fs.existsSync(path.join(dir, "transcript.md"))) fs.copyFileSync(path.join(dir, "transcript.md"), path.join(out, "transcript.md"));

const changed = long.beats.filter((b, i) => b.status !== beatsWas[i]?.status).map(b => `beat ${b.n}: ${beatsWas.find(x => x.id === b.id)?.status} → ${b.status}`);
log(`${path.basename(dir)} — was ${run.classification}: ${run.because}`);
log(`now ${verdict.classification}: ${verdict.because}`);
log(`beats: ${long.summary.done} done, ${long.summary.failed} failed, ${long.summary.notExercised} not exercised${changed.length ? ` (${changed.join("; ")})` : " (none changed)"}`);
log(`mechanics: ${long.mechanics.checks} checks, ${long.mechanics.violations.length} violated`);
const t = long.ledger.totals;
log(`ledger: ${t.recalled} recalled, ${t.carriedUnasked} carried unasked, ${t.lost} lost, ${t.refused} refused, ${t.notProbed} not probed, ${t.notPlanted} not planted of ${t.facts}`);
for (const b of long.baits) log(`bait "${b.ask}": ${b.result}`);
log(`written to ${path.relative(process.cwd(), out) || "."}`);
