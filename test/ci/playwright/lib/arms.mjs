/**
 * STARFORGED COMPANION
 * test/ci/playwright/lib/arms.mjs — the refrains test's arms (issue #402, Part 7)
 *
 * "No module code changes until an arm wins: each arm is a change to the
 * request, made in the runner." A kept run whose recording holds its system
 * prompts (claude.mjs systemPromptOf — change 6) is read beat by beat: the
 * narrations of play in order, each with the request that made it. A beat
 * whose last six narrations hold a detail in five or six of them is a beat
 * to re-ask (`lockedIn`); each arm is a change to that beat's request, and
 * each reply is scored by the share of the locked-in details it writes again
 * (`writtenAgain`), by the matching the module's own list uses
 * (src/narration/proseVariety.js wornDetails). Pure, but for the module's
 * functions it imports.
 *
 *   Arm 0  as sent — the noise between two askings of one request
 *   Arm 1  the sentences that hold a locked-in detail taken out of the recent
 *          narrations shown — the test of cause: is the narrator echoing?
 *   Arm 2  only the last narration word for word; the older ones a line each,
 *          from their fact blocks
 *   Arm 3  the worn list as now, with the scene's people on it and no cap
 *   Arm 4  a line written by code: what the last narrations kept showing that
 *          did nothing new — leave them out of this beat unless they act
 *   Arm 5  the worn list moved from advice into the NOT SO block
 */

import { wornDetails } from "../../../../src/narration/proseVariety.js";
import { extractSidecar } from "../../../../src/factContinuity/sidecarParser.js";
import { systemPromptOf } from "./claude.mjs";

/** The narration calls of play a standing scene is made of. */
export const PLAY_KINDS = /^callNarratorAPI>(narratePacedInput|narrateResolution|narrateOracleFollowup|narrateRound)$/;
/** How many narrations back a beat reads, and how many of them a locked-in detail is in. */
export const WINDOW = 6;
export const LOCKED_IN = 5;
export const ARMS = Object.freeze([0, 1, 2, 3, 4, 5]);

const textOf = (x) => (x?.response?.content ?? []).filter(c => c?.type === "text").map(c => c.text).join("");

/**
 * A kept run's narrations of play, in order: each with its request (system,
 * user), its prose and its fact block. A recording without its system
 * prompts (before change 6) gives `system: ""`.
 *
 * @param {{ exchanges?: object[], systemSections?: object }} recording
 * @returns {Array<{ i: number, step: string, kind: string, model: string, system: string, user: string, prose: string, sidecar: object|null }>}
 */
export function narrationsOf(recording) {
  return (recording?.exchanges ?? []).filter(x => PLAY_KINDS.test(String(x?.kind ?? ""))).map((x, i) => {
    const { prose, sidecar } = extractSidecar(textOf(x));
    return { i, step: x.step, kind: x.kind, model: x.model ?? x.response?.model ?? null, system: systemPromptOf(recording, x),
      user: String(x.user ?? ""), prose: String(prose ?? textOf(x)), sidecar: sidecar ?? null };
  });
}

/**
 * The details a beat's last six narrations kept showing: in five or six of
 * them, by wornDetails' own matching — and, unlike the list the narrator is
 * sent, the scene's people and things too (more than half the repeats were
 * exempt from it: the hook man, the clerk, the berth). Pure.
 *
 * @param {Array<{ prose: string }>} narrations
 * @param {number} at — the beat's index
 * @param {{ min?: number }} [opts]
 * @returns {string[]}
 */
export function lockedIn(narrations, at, { min = LOCKED_IN } = {}) {
  const before = narrations.slice(Math.max(0, at - WINDOW), at).map(n => n.prose);
  if (before.length < WINDOW) return [];
  return wornDetails(before, { names: [], keep: [], cards: WINDOW, min, limit: 1000 });
}

/**
 * Whether a text holds each detail, by wornDetails' matching (a word, or a
 * pair of words) — a word its list folds into a pair ("hook man" holds
 * "man") counted as held.
 */
function phrasesOf(text) {
  const listed = wornDetails([String(text ?? "")], { names: [], keep: [], cards: 1, min: 1, limit: 100000 });
  const words = new Set(listed.flatMap(p => p.split(" ")));
  const all = new Set(listed);
  return { has: (d) => all.has(d) || (!d.includes(" ") && words.has(d)) };
}

/**
 * The locked-in details a reply writes again. Pure.
 *
 * @param {string[]} locked
 * @param {string} prose
 * @returns {string[]}
 */
export function writtenAgain(locked, prose) {
  const said = phrasesOf(prose);
  return (locked ?? []).filter(d => said.has(d));
}

/** A section of a prompt by its `## ` heading: [start, end) offsets, or null. */
function sectionAt(text, heading) {
  const start = text.indexOf(`## ${heading}`);
  if (start < 0) return null;
  const next = text.indexOf("\n## ", start + 3);
  return [start, next < 0 ? text.length : next];
}

/** The sentences of a paragraph. */
const sentencesOf = (p) => String(p ?? "").split(/(?<=[.!?…]["”’)]?)\s+(?=["“‘(*]?\p{Lu})/u);
const holds = (sentence, details) => {
  const said = phrasesOf(sentence);
  return details.some(d => said.has(d));
};
/**
 * A RECENT SCENE paragraph as its parts: the player's line that opens an
 * entry ("PLAYER — Mira Kestrel wrote: …", its first line) and the narration
 * under it. The scene's heads and a card's offer line are no narration.
 */
function partsOf(p) {
  if (/^PLAYER — /.test(p)) {
    const cut = p.indexOf("\n");
    return cut < 0 ? { head: p, body: "" } : { head: p.slice(0, cut), body: p.slice(cut + 1) };
  }
  const narration = p.trim() && !/^\*[^*]+\*$/.test(p.trim()) && !/^(THE SCENE BEFORE|THIS SCENE:|## )/.test(p);
  return narration ? { head: null, body: p } : { head: p, body: "" };
}
const joinParts = ({ head, body }) => [head, body].filter(t => t !== null && t !== "").join("\n");

/**
 * A beat's request under an arm. `before`: the narrations before it (for arm
 * 2's fact-block lines and arm 3's list). Pure.
 *
 * @param {{ system: string, user: string }} request
 * @param {number} arm
 * @param {{ locked: string[], before: Array<{ prose: string, sidecar: object|null }> }} beat
 * @returns {{ system: string, user: string }}
 */
export function armRequest(request, arm, { locked = [], before = [] } = {}) {
  let system = String(request?.system ?? "");
  let user = String(request?.user ?? "");
  const recent = sectionAt(user, "RECENT SCENE");
  const editRecent = (fn) => {
    if (!recent) return;
    const [a, b] = recent;
    const paragraphs = user.slice(a, b).split("\n\n");
    user = user.slice(0, a) + fn(paragraphs).join("\n\n") + user.slice(b);
  };
  if (arm === 1) {
    editRecent(ps => ps.map(partsOf).map(x => ({ ...x, body: x.body ? sentencesOf(x.body).filter(s => !holds(s, locked)).join(" ") : x.body }))
      .map(joinParts).filter(p => p.trim() !== ""));
  } else if (arm === 2) {
    editRecent((ps) => {
      const parts = ps.map(partsOf);
      const last = parts.map((x, i) => (x.body ? i : -1)).filter(i => i >= 0).at(-1);
      return parts.map((x, i) => {
        if (!x.body || i === last) return joinParts(x);
        const own = before.find(n => n.prose.trim() && x.body.includes(n.prose.trim().slice(0, 60)));
        const line = String(own?.sidecar?.sceneFrame?.situation ?? "").trim() || sentencesOf(x.body)[0];
        return joinParts({ ...x, body: `(${line})` });
      });
    });
  } else if (arm === 3) {
    const all = wornDetails(before.map(n => n.prose), { names: [], keep: [], cards: WINDOW, min: 3, limit: 1000 });
    system = system.replace(/(### DETAILS ALREADY WORN\n\n[^\n]*\n[^\n]*\n[^\n]*\n)((?:- [^\n]*\n?)*)/,
      (_m, head) => `${head}${all.map(w => `- ${w}`).join("\n")}\n`);
  } else if (arm === 4 && locked.length) {
    const line = `Shown in each of the last ${WINDOW} narrations and doing nothing new: ${locked.join(", ")} — leave them out of this beat unless they act.`;
    const at = user.indexOf("\n## PLAYER NARRATION");
    user = at >= 0 ? `${user.slice(0, at)}\n\n## WHAT THE LAST NARRATIONS KEPT SHOWING\n\n${line}\n${user.slice(at)}` : `${user}\n\n${line}`;
  } else if (arm === 5) {
    const worn = /### DETAILS ALREADY WORN\n\n[^\n]*\n[^\n]*\n[^\n]*\n((?:- [^\n]*\n?)*)/.exec(system);
    const items = worn ? worn[1].split("\n").map(l => l.replace(/^- /, "").trim()).filter(Boolean) : [];
    if (worn) system = system.replace(worn[0], "");
    if (items.length) user = user.replace(/(NOT SO — never tell it as true:\n)/, `$1- [worn] Never write these again in this beat: ${items.join("; ")}.\n`);
  }
  return { system, user };
}

/**
 * A reply's guards (Part 7's step 3): it is narration — prose, in budget —
 * and its fact block still lists who is present. Pure.
 *
 * @param {string} reply — the raw reply
 * @param {string} user — the request's user message (its word ceiling)
 * @returns {{ prose: string, words: number, ceiling: number|null, inBudget: boolean, present: string[], ok: boolean }}
 */
export function guardsOf(reply, user) {
  const { prose, sidecar } = extractSidecar(String(reply ?? ""));
  const body = String(prose ?? "").replace(/\*[^*]+\*\s*$/, "").trim();
  const words = body ? body.split(/\s+/).length : 0;
  const ceiling = Number(/never more than (\d+)/.exec(String(user ?? ""))?.[1] ?? NaN);
  const present = Array.isArray(sidecar?.sceneFrame?.present) ? sidecar.sceneFrame.present : [];
  const inBudget = Number.isFinite(ceiling) ? words <= ceiling : true;
  return { prose: String(prose ?? ""), words, ceiling: Number.isFinite(ceiling) ? ceiling : null, inBudget, present, ok: !!body && inBudget && present.length > 0 };
}

/**
 * The beats to re-ask: each narration of play whose last six hold a detail
 * in five or six of them, with what it is to be scored against. A kept run
 * with no system prompts gives none: it cannot be asked again as sent.
 *
 * @param {object} recording
 * @returns {Array<{ at: number, step: string, model: string, system: string, user: string, locked: string[], before: object[] }>}
 */
export function beatsToAsk(recording) {
  const narrations = narrationsOf(recording);
  return narrations.map((n, at) => ({ at, step: n.step, model: n.model, system: n.system, user: n.user,
    locked: lockedIn(narrations, at), before: narrations.slice(Math.max(0, at - WINDOW), at) }))
    .filter(b => b.locked.length && b.system);
}

/**
 * Part 7's rule (step 4): an arm wins if it at least halves arm 0's rate in
 * each of the askings, taken over all the beats, and breaks no guard. Pure.
 *
 * @param {Array<{ arm: number, asking: number, locked: number, again: number, ok: boolean }>} rows
 * @returns {{ rates: Object<number, number[]>, guardsBroken: Object<number, number>, winners: number[] }}
 */
export function verdict(rows) {
  const rates = {};
  const guardsBroken = {};
  for (const arm of ARMS) {
    const mine = rows.filter(r => r.arm === arm);
    if (!mine.length) continue;
    const askings = [...new Set(mine.map(r => r.asking))].sort((a, b) => a - b);
    rates[arm] = askings.map((k) => {
      const at = mine.filter(r => r.asking === k);
      const locked = at.reduce((n, r) => n + r.locked, 0);
      return locked ? at.reduce((n, r) => n + r.again, 0) / locked : 0;
    });
    guardsBroken[arm] = mine.filter(r => !r.ok).length;
  }
  const base = rates[0] ?? [];
  const winners = Object.keys(rates).map(Number).filter(arm => arm !== 0 && base.length
    && rates[arm].length === base.length && rates[arm].every((r, k) => r <= base[k] / 2)
    && (guardsBroken[arm] ?? 0) <= (guardsBroken[0] ?? 0));
  return { rates, guardsBroken, winners };
}
