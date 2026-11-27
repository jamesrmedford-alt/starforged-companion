// The narration's judges, measured (issue #399, D6).
//
// Two passes judge a narration with a small model. The pre-post judge
// (src/moves/contracts/checks.js judgeNarration) is asked about the lines its
// trip words trip, before the narration posts. The post-narration audit
// (src/factContinuity/consistencyCheck.js) is asked about every line but a
// certain one, after. Neither had been scored: the long haul's ninth round
// was their first evaluation, and every one of the eleven findings they acted
// on there was wrong.
//
// This builds the labelled set they are scored on and scores them:
//   - every narration the kept long hauls recorded with the lines it was
//     given (rounds 5 to 9 sent them; the request's obligations block is read
//     back), each line's judge words and trip words rebuilt as the module
//     builds them now;
//   - the reviews' labels on them (judges/set.json `labels`): a line a review
//     found broken, or found kept; for a run that predates a line, the line
//     is written by hand;
//   - seeded breaches (set.json `seeded`): a real narration edited by hand to
//     break one line, three a judge-class kind, marked as seeded.
// An unlabelled line is counted kept. That is an assumption, and the report
// says so.
//
// Each pass is scored by kind (decisions.md → "Issue #399"): its flags, the
// flags that were right, the breaches, the breaches it caught, and the bar —
// at least nine flags in ten right (all of them, with fewer than ten) and at
// least two breaches in three caught. The checks written in code are scored
// on the same set with no model call (`codeScore`).
//
// Pure but for its file reads; the model calls go through the module's own
// apiPost, which judges.mjs runs live and tests/unit/judgeMeasure.test.js
// replays from the kept verdicts.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { judgedView, judgeNarration, trippedLines, checkClassOf } from "../../../../src/moves/contracts/checks.js";
import { obligationLine, OBLIGATION_KINDS } from "../../../../src/moves/contracts/obligations.js";
import { auditObligationSection, auditRequestBody, buildAuditPrompt, classifyAuditFindings, parseAuditResponse } from "../../../../src/factContinuity/consistencyCheck.js";
import { elsewhereWords } from "../../../../src/factContinuity/whereabouts.js";
import { diceWords } from "../../../../src/narration/narrator.js";
import { MOVES } from "../../../../src/schemas.js";
import { moveDisplayName } from "../../../../src/system/i18n.js";
import { apiPost } from "../../../../src/api-proxy.js";

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/** The narrator calls a judge reads: a beat's, a round's, a set-piece's, an oracle's. */
export const NARRATION_KINDS = /^callNarratorAPI>(narratePacedInput|narrateResolution|narrateSessionVignette|narrateOracleFollowup|narrateRound)$/;

/** The judge-class kinds, by their rows. */
export const JUDGE_KINDS = Object.freeze(Object.entries(OBLIGATION_KINDS).filter(([, r]) => r.check === "judge").map(([k]) => k).sort());

/** The bar (D7): of a kind's flags, at least 9 in 10 right — all, with fewer than 10 — and at least 2 breaches in 3 caught. */
export const BAR = Object.freeze({ rightShare: 0.9, smallFlags: 10, caughtShare: 2 / 3 });

// ─────────────────────────────────────────────────────────────────────────────
// Reading the kept runs
// ─────────────────────────────────────────────────────────────────────────────

const replyText = (x) => (x?.response?.content ?? []).map(c => c?.text ?? "").join("");

/**
 * The lines a narrator request was given, read back from its obligations
 * block (obligations.js formatObligationsBlock): `{ kind, list, text }`. A
 * line's text runs on over indented rows (a cost's options); the block ends
 * at the first row that is none of a list heading, a line, an indented row or
 * a blank.
 *
 * @param {string} user — the request's user message
 * @returns {Array<{ kind: string, list: string, text: string }>}
 */
export function recordedLines(user) {
  const at = String(user ?? "").indexOf("WHAT THIS NARRATION MUST TELL, AND MUST NOT");
  if (at < 0) return [];
  const out = [];
  let list = null;
  for (const row of user.slice(at).split("\n").slice(1)) {
    const head = /^(TELL|NOT YET|NOT SO) — /.exec(row);
    if (head) { list = head[1]; continue; }
    const line = /^- \[([a-z-]+)\] (.*)$/.exec(row);
    if (line && list) { out.push({ kind: line[1], list, text: line[2] }); continue; }
    if (/^\s+\S/.test(row) && out.length) { out.at(-1).text += `\n${row}`; continue; }
    if (!row.trim()) continue;
    break;
  }
  return out;
}

/**
 * Every narration a kept run recorded: `{ id, run, step, kind, nth, raw, user }`.
 * `nth` counts that kind's narrations at that step (a draft and its re-ask).
 *
 * @param {string} runDir — an explorations/<run>/ folder
 * @returns {Array<Object>}
 */
export function narrationsOf(runDir) {
  const run = path.basename(runDir);
  const exchanges = JSON.parse(fs.readFileSync(path.join(runDir, "replay.json"), "utf8")).recording?.exchanges ?? [];
  const seen = new Map();
  const out = [];
  for (const x of exchanges) {
    if (!NARRATION_KINDS.test(x.kind)) continue;
    const kind = x.kind.split(">")[1];
    const key = `${x.step}|${kind}`;
    const nth = seen.get(key) ?? 0;
    seen.set(key, nth + 1);
    out.push({ id: `${run}:${x.step}:${kind}:${nth}`, run, step: x.step, kind, nth, raw: replyText(x), user: x.user ?? "" });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// A line as the module builds it now
// ─────────────────────────────────────────────────────────────────────────────

const MOVE_ID_BY_NAME = (() => {
  const byName = new Map();
  for (const id of Object.keys(MOVES)) {
    try { byName.set(moveDisplayName(id).toLowerCase(), id); } catch { /* a move with no name */ }
  }
  return byName;
})();

/** Each kind's words the recorded text holds, for its row's builders (null when they cannot be read). */
const INPUTS_OF = Object.freeze({
  dice: (text) => {
    const m = /^What the dice decided stands — ([^:]+): ([\s\S]+?)\. A line that takes otherwise for granted/.exec(text);
    return m ? { subject: m[1].trim(), fact: m[2].trim() } : null;
  },
  whereabouts: (text) => {
    const places = [...text.matchAll(/(?:^|\. )([A-Z][^.:]*?) (?:is another place|are other places)/g)]
      .flatMap(m => m[1].split(/, | and /).map(n => n.trim()).filter(Boolean)).map(name => ({ name }));
    const people = [...text.matchAll(/([A-Z][\w'’ -]+?) is ([^.]+?), not here\./g)].map(m => ({ name: m[1].trim(), where: m[2].trim() }));
    return { places, people };
  },
  place: (text) => {
    const m = /^(.+?) is docked at (.+?) by the ship's record\./.exec(text);
    return m ? { ship: m[1].trim(), at: m[2].trim() } : null;
  },
  foe: (text) => {
    const m = /^THE FIGHT(?:'S TRACK IS FULL| IS NOT DECIDED) \(([^)]+)\)/.exec(text);
    return { fight: { label: m?.[1] ?? null, full: /^THE FIGHT'S TRACK IS FULL/.test(text) } };
  },
  unsaid: () => ({}),
});

/**
 * A recorded line as the module builds it now: its kind's judge sentence
 * where the row has one, and the trip words a [dice] or [whereabouts] line
 * carries — rebuilt from the words the recorded text holds. Any other line is
 * kept as recorded.
 *
 * @param {{ kind: string, list: string, text: string }} o
 * @returns {Object}
 */
export function asBuiltNow(o) {
  const read = INPUTS_OF[o.kind]?.(o.text);
  if (!read) return { ...o };
  const built = obligationLine(o.kind, read);
  const line = { ...o, ...(built.judge ? { judge: built.judge } : {}) };
  if (o.kind === "dice") line.words = [...new Set(diceWords(read.subject))];
  if (o.kind === "whereabouts") line.words = elsewhereWords({ places: read.places, people: read.people });
  return line;
}

/**
 * The check's context a narration's lines imply (narrator.js gives it from
 * the beat): the refusal's code, from its [premise] claim; the offered move,
 * from its [offer]; the oracle's question, from its TELL [oracle].
 *
 * @param {Array<Object>} lines
 * @returns {{ refusalCode: string|null, offer: string|null, question: string }}
 */
export function contextOf(lines) {
  const premise = lines.find(o => o.kind === "premise")?.text ?? "";
  const CLAIM_CODES = [
    [/^A wound to treat/i, "recoverable-health"], [/^A strain to ease/i, "recoverable-spirit"], [/^Supplies to restock/i, "recoverable-supply"],
    [/^Damage to repair/i, "something-damaged"], [/^A fight under way/i, "open-fight"], [/^A connection with/i, "their-connection"],
  ];
  const refusalCode = CLAIM_CODES.find(([re]) => re.test(premise))?.[1] ?? null;
  const offerName = /^(.+?) is only offered\./.exec(lines.find(o => o.kind === "offer")?.text ?? "")?.[1]?.toLowerCase() ?? null;
  const question = /to "([^"]+)", the oracle says/.exec(lines.find(o => o.kind === "oracle" && o.list === "TELL")?.text ?? "")?.[1] ?? "";
  return { refusalCode, offer: offerName ? (MOVE_ID_BY_NAME.get(offerName) ?? null) : null, question };
}

/** A line written by hand in set.json: `{ kind, input }` built by its row, or a literal `{ kind, list, text }`. */
function handLine(spec) {
  if (spec?.input !== undefined) {
    const built = obligationLine(spec.kind, spec.input);
    return { ...built, ...(spec.words ? { words: spec.words } : {}) };
  }
  return { ...spec };
}

// ─────────────────────────────────────────────────────────────────────────────
// The set
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The labelled set: every narration the runs recorded with its lines, the
 * reviews' labels, the hand-written lines of runs that predate them, and the
 * seeded breaches. Each entry: `{ id, run, step, kind, nth, raw, lines, ctx,
 * labels: { [kind]: true|false }, seeded, source }`.
 *
 * @param {{ explorations: string, set: Object }} opts — the explorations folder, set.json's content
 * @returns {{ entries: Array<Object>, missing: string[] }} — `missing`: labels and seeds whose narration the runs do not hold
 */
export function buildSet({ explorations, set }) {
  const runs = Array.isArray(set.runs) ? set.runs : [];
  const all = new Map();
  for (const run of runs) for (const n of narrationsOf(path.join(explorations, run))) all.set(n.id, n);
  const entries = new Map();
  const missing = [];
  const entryOf = (n) => {
    if (!entries.has(n.id)) {
      const lines = recordedLines(n.user).map(asBuiltNow);
      entries.set(n.id, { id: n.id, run: n.run, step: n.step, kind: n.kind, nth: n.nth, raw: n.raw, lines, ctx: contextOf(lines),
        labels: {}, seeded: false, source: null });
    }
    return entries.get(n.id);
  };
  // Every recorded narration with lines.
  for (const n of all.values()) if (recordedLines(n.user).length) entryOf(n);
  // The reviews' labels — with a line written by hand where the run predates it.
  for (const label of Array.isArray(set.labels) ? set.labels : []) {
    const id = `${label.run}:${label.step}:${label.kind}:${label.nth ?? 0}`;
    const n = all.get(id);
    if (!n) { missing.push(id); continue; }
    const e = entryOf(n);
    for (const spec of label.add ?? []) if (!e.lines.some(o => o.kind === spec.kind)) e.lines.push(handLine(spec));
    if (label.ctx) e.ctx = { ...e.ctx, ...label.ctx };
    // `null`: a breach the reviews dispute — its line is not scored.
    e.labels[label.line] = label.breach === null ? null : label.breach === true;
    e.source = e.source ?? "review";
  }
  // The seeded breaches.
  for (const seed of Array.isArray(set.seeded) ? set.seeded : []) {
    const from = seed.from ?? {};
    const n = all.get(`${from.run}:${from.step}:${from.kind}:${from.nth ?? 0}`);
    if (!n) { missing.push(`seed ${seed.id}`); continue; }
    const recorded = recordedLines(n.user).map(asBuiltNow);
    const lines = seed.lines === "recorded" ? recorded.filter(o => o.kind === seed.line) : (seed.lines ?? []).map(handLine);
    const ctx = { ...contextOf(seed.lines === "recorded" ? recorded : lines), ...(seed.ctx ?? {}) };
    entries.set(`seed:${seed.id}`, { id: `seed:${seed.id}`, run: n.run, step: n.step, kind: n.kind, nth: n.nth, raw: seed.narration,
      lines, ctx, labels: { [seed.line]: true }, seeded: true, source: "seeded", edit: seed.edit ?? "" });
  }
  return { entries: [...entries.values()], missing };
}

// ─────────────────────────────────────────────────────────────────────────────
// The two passes
// ─────────────────────────────────────────────────────────────────────────────

/** A request's fingerprint, for the kept verdicts: the body as sent. */
export const requestHash = (body) => crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 24);

/**
 * The pre-post judge on one entry, as the module runs it: the lines its trip
 * words trip in the judged view, then one call. What it flags is the kinds of
 * the lines its verdicts name.
 *
 * @returns {Promise<{ tripped: string[], judged: boolean, error: string|null, flagged: string[], violations: Array, dropped: Array }>}
 */
export async function judgePass(entry, { apiKey }) {
  const judgeLines = entry.lines.filter(o => checkClassOf(o.kind) === "judge");
  const tripped = trippedLines(judgedView(entry.raw).text, judgeLines, entry.ctx);
  if (!tripped.length) return { tripped: [], judged: false, error: null, flagged: [], violations: [], dropped: [] };
  const verdict = await judgeNarration(entry.raw, tripped, { apiKey });
  return { tripped: tripped.map(o => o.kind), judged: verdict.judged, error: verdict.error ?? null,
    flagged: [...new Set(verdict.violations.map(v => v.tag))], violations: verdict.violations, dropped: verdict.dropped ?? [] };
}

/**
 * The audit on one entry's obligation lines, as the module asks it — its
 * prompt with no ledger beside them (the measure scores the lines alone).
 * What it flags is the kinds of the high-confidence findings that name a line
 * and quote the narration.
 *
 * @returns {Promise<{ audited: boolean, error: string|null, flagged: string[], findings: Array }>}
 */
export async function auditPass(entry, { apiKey }) {
  const section = auditObligationSection(entry.lines);
  if (!section.lines.length) return { audited: false, error: null, flagged: [], findings: [] };
  const view = judgedView(entry.raw);
  const body = auditRequestBody(buildAuditPrompt("", "", view.text, { obligations: section.text }));
  const headers = { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
  try {
    const data = await apiPost(ANTHROPIC_URL, headers, body, { label: "consistencyCheck" });
    const text = (data?.content ?? []).filter(b => b?.type === "text").map(b => b.text).join("");
    const read = parseAuditResponse(text, { withStatus: true });
    const findings = classifyAuditFindings(read.contradictions, section.lines, view.text);
    const flagged = [...new Set(findings.filter(c => c.kind === "obligation" && c.confidence === "high" && c.obligationKind).map(c => c.obligationKind))];
    return { audited: read.parsed, error: read.parsed ? null : "unparsed", flagged, findings };
  } catch (err) {
    return { audited: false, error: `error: ${String(err?.message ?? err)}`, flagged: [], findings: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One pass's score by kind: for each judge-class kind the set gives a line,
 * `lines` (entries with one), `flags`, `right` (flags on a labelled breach),
 * `breaches`, `caught`, `wrongOnLabelled` (flags on a line a review found
 * kept), and whether it passed the bar. An unlabelled line is a kept one.
 *
 * @param {Array<Object>} entries
 * @param {Map<string, { flagged: string[] }>} results — by entry id
 * @returns {Object<string, Object>}
 */
export function scorePass(entries, results) {
  const score = {};
  for (const kind of JUDGE_KINDS) {
    const row = { lines: 0, flags: 0, right: 0, breaches: 0, caught: 0, wrongOnLabelled: 0 };
    for (const e of entries) {
      if (!e.lines.some(o => o.kind === kind) || e.labels[kind] === null) continue;
      row.lines += 1;
      const breach = e.labels[kind] === true;
      const flagged = (results.get(e.id)?.flagged ?? []).includes(kind);
      if (breach) row.breaches += 1;
      if (flagged) row.flags += 1;
      if (flagged && breach) { row.right += 1; row.caught += 1; }
      if (flagged && e.labels[kind] === false) row.wrongOnLabelled += 1;
    }
    row.rightOk = row.flags < BAR.smallFlags ? row.right === row.flags : row.right / row.flags >= BAR.rightShare;
    row.caughtOk = row.breaches > 0 && row.caught / row.breaches >= BAR.caughtShare;
    row.passed = row.lines > 0 && row.rightOk && row.caughtOk;
    if (row.lines) score[kind] = row;
  }
  return score;
}

/** A kind's row, said in a line of the report. */
const rowLine = (kind, r) => `| [${kind}] | ${r.lines} | ${r.flags} | ${r.right} | ${r.breaches} | ${r.caught} | ${r.wrongOnLabelled} | ${r.passed ? "**passed**" : "failed"} |`;

/**
 * The report, in markdown: what was run, each pass's table, and the
 * assumptions.
 *
 * @param {{ judge: Object, audit: Object }} score
 * @param {{ runId: string, commit?: string, entries: number, seeded: number, labelled: number, calls: number, usd?: number|null }} meta
 * @returns {string}
 */
export function renderReport(score, meta) {
  const table = (pass) => ["| Kind | Lines | Flags | Right | Breaches | Caught | Wrong on a labelled kept line | Bar |", "|---|---|---|---|---|---|---|---|",
    ...Object.entries(score[pass]).map(([k, r]) => rowLine(k, r))].join("\n");
  return [
    `# The judges, measured — ${meta.runId}`,
    "",
    `Commit ${meta.commit ?? "(not recorded)"} · ${meta.entries} narrations (${meta.labelled} with a review's label, ${meta.seeded} seeded) · ${meta.calls} calls${meta.usd != null ? ` · $${meta.usd.toFixed(4)}` : ""}.`,
    "",
    `The bar (issue #399 D7): of a kind's flags, at least ${BAR.rightShare * 10} in 10 right — all of them, with fewer than ${BAR.smallFlags} — and at least two of every three breaches caught.`,
    "",
    "## The pre-post judge",
    "",
    table("judge"),
    "",
    "## The audit",
    "",
    table("audit"),
    "",
    "## Assumptions",
    "",
    "- An unlabelled line is counted kept: a flag on it counts as wrong. A review that missed a breach makes a right flag look wrong.",
    "- The audit is asked about the lines alone, with no ledger beside them; in play it is given the scene's ledger too.",
    "- A [dice] or [whereabouts] line's trip words, and the judge sentences, are rebuilt from the recorded text as the module builds them now.",
  ].join("\n");
}
