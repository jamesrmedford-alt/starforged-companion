// test/ci/playwright/lib/longrun.mjs
//
// A long run scored (issue #373): what the runner does when a run ends, and
// what `rescore.mjs` does again from a run's evidence after a check has been
// corrected. One function for both, so that a run and its re-score cannot
// come to differ in how they count.
//
// Pure: marks, messages, actions and requests in; verdicts out.

import { BEAT_CHECKS, beatView, unmetRequirements } from "./beats.mjs";
import { checkMechanics } from "./mechanics.mjs";
import { scoreLedger, scoreBaits, scoreLeaks } from "./ledger.mjs";

/**
 * The hidden plans the observer saw in the GM-only Secrets journal over a
 * run: each with the step it was first seen at and the step its truth was
 * revealed at, if it was.
 *
 * @param {Array<{ step: string, table?: { plans?: object[] } }>} marks
 */
export function plansSeen(marks) {
  const plans = new Map();
  for (const mark of marks) {
    for (const plan of mark.table?.plans ?? []) {
      const known = plans.get(plan.id) ?? { id: plan.id, kind: plan.kind, subject: plan.subject, truth: plan.truth, firstSeen: mark.step, revealedAt: null };
      known.truth = plan.truth || known.truth;
      if (plan.truthRevealed && !known.revealedAt) known.revealedAt = mark.step;
      plans.set(plan.id, known);
    }
  }
  return [...plans.values()];
}

/**
 * The run's score from its beats as they ended: the ledger, the mechanical
 * checks, the baits and the hidden plans' leaks.
 *
 * @param {{ charter: object, beats: object[], marks: object[], messages: object[], actions: object[],
 *   requests: object[], dice?: number[]|null, scripted?: object[] }} run — `beats` is the pointer's state
 */
export function scoreLongRun({ charter, beats, marks, messages, actions, requests, dice = null, scripted = [] }) {
  const state = (id) => beats.find(x => x.id === id) ?? null;
  // A fact the world makes true (where the ship is, a correction, a rename)
  // is planted at the step its beat was done.
  const doneAt = (id) => (state(id)?.status === "done" ? state(id).doneAt : null);
  const planted = Object.fromEntries((charter.facts ?? []).filter(f => f.plantedBy).map(f => [f.id, doneAt(f.plantedBy)]).filter(([, step]) => step));
  // A probe is looked for among the lines of the beat that asks its set.
  const probeSteps = Object.fromEntries((charter.beats ?? []).filter(b => b.check?.type === "probesAsked").map(b => [b.check.set, state(b.id)?.steps ?? []]));
  const ledger = scoreLedger({ facts: charter.facts, marks, messages, requests, planted, probeSteps });
  const mechanics = checkMechanics({ marks, messages, actions, dice, scripted: scripted.filter(x => !x.rehearsalOnly) });
  const baits = scoreBaits({ baits: charter.baits ?? [], messages });
  const names = [charter.seed?.pc?.name, charter.seed?.ship?.name, charter.seed?.sector?.name, ...(charter.seed?.settlements ?? []).map(x => x.name), ...Object.values(charter.cast ?? {}).map(c => c.name)].filter(Boolean);
  const leaks = scoreLeaks({ plans: plansSeen(marks), messages, common: names });
  const count = (status) => beats.filter(x => x.status === status).length;
  const summary = { beats: beats.length, done: count("done"), failed: count("failed"), notExercised: beats.length - count("done") - count("failed") };
  return { beats, summary, mechanics, ledger, baits, leaks };
}

/**
 * A run's beats checked again, each over the steps it had: the checks as
 * they are now, the evidence as it was. For a check found wrong after a run
 * was paid for — the run is not bought again to learn what the corrected
 * check says of it.
 *
 * The windows are the run's own (`enteredAt` to `doneAt`): the player acted
 * on the pointer as it stood, so a beat is not moved to other steps. Within
 * its window a beat is done at the first step its check says so; a beat the
 * run gave up on is done if the corrected check finds it done, and is still
 * not exercised if not. A beat that needs one no longer done, or requires of
 * the world what it did not hold when it came, is not exercised.
 *
 * @param {{ charter: object, beats: object[], marks: object[], messages: object[], actions: object[] }} run
 * @returns {object[]} the beats' states, re-checked
 */
export function recheckBeats({ charter, beats, marks, messages, actions }) {
  const index = new Map(marks.map((k, i) => [k.step, i]));
  const upTo = (list, i) => list.filter(x => (index.get(x.step) ?? Infinity) <= i);
  const out = [];
  for (const was of beats) {
    const beat = (charter.beats ?? []).find(b => b.id === was.id);
    const next = { ...was };
    out.push(next);
    if (!beat || !was.enteredAt) continue;
    const missing = (beat.needs ?? []).filter(id => out.find(b => b.id === id)?.status !== "done");
    if (missing.length) {
      Object.assign(next, { status: "not-exercised", detail: `it needs beat ${missing.map(id => out.find(b => b.id === id)?.n ?? id).join(", ")}, which was not done` });
      continue;
    }
    const check = BEAT_CHECKS[beat.check?.type];
    if (!check) throw new Error(`beat ${beat.n} has no check the observer knows (${beat.check?.type})`);
    const from = index.get(was.enteredAt) ?? 0;
    const to = index.get(was.doneAt) ?? marks.length - 1;
    // What it needs of the world (`requires`), as the world stood when it came
    // — as the pointer asks it (lib/beats.mjs createPointer).
    const unmet = unmetRequirements(beat, beatView({ marks: marks.slice(0, from + 1), messages: upTo(messages, from), actions: upTo(actions, from), charter, from: was.enteredAt }));
    if (unmet.length) {
      Object.assign(next, { status: "not-exercised", detail: `it needs ${unmet.join("; and ")}` });
      continue;
    }
    let result = null;
    let at = was.doneAt ?? null;
    for (let i = from; i <= to; i++) {
      // An interruption is checked once, at the step the runner made it.
      if (beat.interruption && marks[i].step !== `x${beat.n}`) continue;
      if (!beat.interruption && i === from && to > from) continue;
      result = check(beatView({ marks: marks.slice(0, i + 1), messages: upTo(messages, i), actions: upTo(actions, i), charter, from: was.enteredAt }), beat.check);
      at = marks[i].step;
      if (result.done) break;
    }
    if (!result) continue;
    if (result.done) Object.assign(next, { status: result.failed ? "failed" : "done", doneAt: at, detail: result.detail });
    else Object.assign(next, { status: "not-exercised", detail: /^not reached in /.test(was.detail ?? "") ? `not reached in ${was.actions} actions — ${result.detail}` : result.detail });
  }
  return out;
}
