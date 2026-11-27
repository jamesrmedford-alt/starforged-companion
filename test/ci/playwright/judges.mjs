// The narration's judges on the labelled set (issue #399, D6).
//
// Runs both passes — the pre-post judge and the audit — over every entry of
// judges/set.json's set (lib/judges.mjs buildSet), as the module asks them,
// and scores each pass by kind against the bar. On demand only: it needs a
// key and makes Haiku calls, so nothing in CI runs it and it is not part of
// npm test. Its verdicts are kept, and tests/unit/judgeMeasure.test.js
// replays them with no key and checks the report against them.
//
// Environment:
//   JUDGES_MODE       plan (default) | live. A plan calls no model: it builds
//                     the set and says how many calls a live run would make.
//   ANTHROPIC_API_KEY a live run only; never logged, and never written.
//   JUDGES_QUESTIONS  what the run is to answer, one question a line. A live
//                     run is refused without it (the spending rule,
//                     rules/ci-e2e.md).
//   JUDGES_CAP_USD    a hard stop (default 1.00): the run stops before a call
//                     that would pass it, and reports what was done.
//   JUDGES_COMMIT     the commit the run is recorded at.
//
// Writes judges/runs/<runId>/: verdicts.json (each call's request
// fingerprint and reply), results.json (the scores, the checks in code's
// with them) and report.md.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSet, judgePass, auditPass, scorePass, codeScore, renderReport, requestHash, ANTHROPIC_URL } from "./lib/judges.mjs";
import { trippedLines, judgedView, checkClassOf } from "../../../src/moves/contracts/checks.js";
import { auditObligationSection } from "../../../src/factContinuity/consistencyCheck.js";
import { costOf } from "./lib/budget.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SET = JSON.parse(fs.readFileSync(path.join(HERE, "judges", "set.json"), "utf8"));
const PRICES = JSON.parse(fs.readFileSync(path.join(HERE, "explore.config.json"), "utf8")).prices?.usdPerMillionTokens ?? {};
const MODE = process.env.JUDGES_MODE ?? "plan";
const CAP = Number(process.env.JUDGES_CAP_USD ?? "1.00");

const { entries, missing } = buildSet({ explorations: path.join(HERE, "explorations"), set: SET });
if (missing.length) {
  console.error(`judges: the set names narrations the kept runs do not hold: ${missing.join(", ")}`);
  process.exit(1);
}
const judgeCalls = entries.filter(e => trippedLines(judgedView(e.raw, { offer: e.offer === true }).text, e.lines.filter(o => checkClassOf(o.kind) === "judge"), e.ctx).length).length;
const auditCalls = entries.filter(e => auditObligationSection(e.lines).lines.length).length;
console.log(`judges: ${entries.length} narrations (${entries.filter(e => e.seeded).length} seeded); a live run makes ${judgeCalls} judge calls and ${auditCalls} audit calls.`);
if (MODE !== "live") process.exit(0);

const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.error("judges: a live run needs ANTHROPIC_API_KEY."); process.exit(1); }
const questions = String(process.env.JUDGES_QUESTIONS ?? "").split("\n").map(q => q.trim()).filter(Boolean);
if (!questions.length) { console.error("judges: a live run needs JUDGES_QUESTIONS — what it is to answer (rules/ci-e2e.md)."); process.exit(1); }

// Every call the module's own apiPost makes is seen at the fetch it ends in:
// the body apiPost was given (its thinking-off field, which apiPost adds,
// taken back off) is fingerprinted, the reply kept with its cost, and the cap
// held before the call is sent. The key rides in the request's headers only.
const calls = [];
let spent = 0;
let stopped = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  if (!String(url).startsWith(ANTHROPIC_URL)) throw new Error(`judges: unexpected call to ${url}`);
  const { thinking: _thinkingOff, ...body } = JSON.parse(String(init.body ?? "{}"));
  const price = PRICES[body.model];
  if (!price) throw new Error(`judges: no price for ${body.model}`);
  // The worst a call can cost, reserved: its prompt as input, its cap as output.
  const worst = costOf(price, { input_tokens: Math.ceil(JSON.stringify(body).length / 2), output_tokens: body.max_tokens });
  if (spent + worst > CAP) { stopped = "the cap"; throw new Error("judges: the cap stops this call"); }
  const res = await realFetch(url, init);
  if (!res.ok) return res;
  const reply = await res.clone().json();
  const usd = costOf(price, reply?.usage ?? {});
  spent += usd;
  calls.push({ hash: requestHash(body), model: body.model, reply: { content: reply?.content ?? [], stop_reason: reply?.stop_reason ?? null },
    usage: reply?.usage ?? null, usd });
  return res;
};

const results = { judge: new Map(), audit: new Map() };
for (const e of entries) {
  if (stopped) break;
  results.judge.set(e.id, await judgePass(e, { apiKey: key }));
  if (stopped) break;
  results.audit.set(e.id, await auditPass(e, { apiKey: key }));
}

const runId = `judges-live-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-")}`;
const dir = path.join(HERE, "judges", "runs", runId);
fs.mkdirSync(dir, { recursive: true });
const score = { judge: scorePass(entries, results.judge, "judge"), audit: scorePass(entries, results.audit, "audit"), code: codeScore(entries) };
const meta = { runId, commit: process.env.JUDGES_COMMIT ?? null, entries: entries.length, seeded: entries.filter(e => e.seeded).length,
  labelled: entries.filter(e => !e.seeded && Object.keys(e.labels).length).length, calls: calls.length, usd: spent };
fs.writeFileSync(path.join(dir, "verdicts.json"), `${JSON.stringify({ runId, questions, stopped, calls }, null, 1)}\n`);
fs.writeFileSync(path.join(dir, "results.json"), `${JSON.stringify({ meta, score }, null, 1)}\n`);
fs.writeFileSync(path.join(dir, "report.md"), `${renderReport(score, meta)}\n${stopped ? `\nStopped early: ${stopped}.\n` : ""}`);
console.log(`judges: ${calls.length} calls, $${spent.toFixed(4)}${stopped ? ` — stopped by ${stopped}` : ""}; written to ${path.relative(process.cwd(), dir)}.`);
