/**
 * STARFORGED COMPANION
 * src/moves/contracts/obligations.js — what a narration must tell, and must not
 *
 * Overhaul 4, "moves as contracts" (decision D8). One block in a narration's
 * user message — last before its instruction, never in a cached block
 * (rules/narrator-memory.md invariant 7b) — in three lists, a tag a line:
 *
 *   TELL     this has happened
 *   NOT YET  the table has not decided this; bring the beat to it and stop
 *   NOT SO   never tell it as true
 *
 * Each line is an obligation `{ kind, list, text }`; OBLIGATION_KINDS holds
 * one row a kind — its list and the class of check that holds a narration to
 * it (slice 4: "certain" a regular expression, "floor" a lexical minimum,
 * "judge" a tripwire that sends a small model call, "logged" the post-
 * narration audit). The texts keep the words of the blocks they replace,
 * line for line — those words were tuned in live runs.
 *
 * Slice 1 builds the kinds a paced narration needs — a line no move was
 * rolled for, and a line whose move the gate refused (gate.js checkMove):
 *   [premise]    a refusal's premise, told as not so (NOTHING-TO-RECOVER-UNTOLD:
 *                eight recovery lines at full health were rightly given no
 *                move, and the narrator, told nothing, wrote "the cuts")
 *   [offer]      the move offered and not made (OFFERED-MOVE-NARRATED-AS-DONE —
 *                SUGGESTED MOVE's "It has not been made…" half, moved here)
 *   [sheet]      no sheet changes in narration (the paced no-move rule, moved here)
 *   [apparatus]  no dice, no sheet number, no outcome's or move's name
 *   [overridden] a soft refusal the GM rolled anyway — told as rolled
 */

import { moveDisplayName } from "../../system/i18n.js";
import { MOVES } from "../../schemas.js";

/** The three lists, in the order the block renders them. */
export const OBLIGATION_LISTS = Object.freeze(["TELL", "NOT YET", "NOT SO"]);

const LIST_HEADINGS = Object.freeze({
  "TELL":    "TELL — this has happened:",
  "NOT YET": "NOT YET — the table has not decided this; bring the beat to it and stop:",
  "NOT SO":  "NOT SO — never tell it as true:",
});

/** A move id or a name, as the narration's lines name it. */
const moveName = (move) => (MOVES[move] ? moveDisplayName(move) : String(move ?? "").trim()) || "The move";
const cap = (s) => String(s ?? "").replace(/^\s*(\S)/, (m, c) => m.replace(c, c.toUpperCase()));
const sentence = (s) => { const t = String(s ?? "").trim(); return t ? (/[.!?]$/.test(t) ? t : `${t}.`) : ""; };

/**
 * One row a kind: its list, its check class (slice 4), and its text builder.
 * @type {Readonly<Object<string, { list: string, check: "certain"|"floor"|"judge"|"logged", text: Function }>>}
 */
export const OBLIGATION_KINDS = Object.freeze({
  premise: Object.freeze({
    list: "NOT SO", check: "judge",
    text: ({ refusal }) => {
      const claim = refusal?.premise?.claim ? cap(refusal.premise.claim) : "What the line sets about";
      const never = refusal?.premise?.never ? `: never ${refusal.premise.never}` : "";
      return `${claim} is not so — ${sentence(refusal?.why ?? "the sheet says otherwise")} `
        + `The line sets about it: narrate the attempt meeting the facts, never the premise as real${never}.`;
    },
  }),
  offer: Object.freeze({
    list: "NOT YET", check: "judge",
    text: ({ offer }) => `${moveName(offer)} is only offered. It has not been made, and nothing it would decide has happened: `
      + `narrate up to the point where it would begin and stop there — a course laid in is not yet flown, a wound bared is `
      + `not yet treated, a question put is not yet answered. The prose never performs the move; the closing sentence offers it.`,
  }),
  overridden: Object.freeze({
    list: "TELL", check: "logged",
    text: ({ note }) => `The roll was made at the GM's word; the sheet says ${String(note ?? "").replace(/^rolled at the GM's word:\s*/i, "").replace(/\.$/, "")} — `
      + `tell the result as the GM ruled it, and nothing gained beyond what the result gives.`,
  }),
  sheet: Object.freeze({
    list: "NOT SO", check: "logged",
    text: ({ refused }) => (refused
      ? `No move was rolled for this line, and none will be. Nothing on a character's sheet changes — no wound is treated or `
        + `healed, no harm taken, no supplies gained or spent, no damage repaired, no bond or progress made.`
      : `Nothing on a character's sheet changes — no wound is treated or healed, no harm taken, no supplies gained or spent, `
        + `no damage repaired, no bond or progress made: a line that sets about one of those has begun it, and the move that `
        + `decides it is still to be made.`),
  }),
  apparatus: Object.freeze({
    list: "NOT SO", check: "certain",
    text: ({ offer }) => `Never write the dice, a number off a sheet, an outcome's name, or a move's name${offer ? " — save the one closing offer line" : ""}.`,
  }),
});

const line = (kind, input) => ({ kind, list: OBLIGATION_KINDS[kind].list, text: OBLIGATION_KINDS[kind].text(input) });

/**
 * The obligations of a narration. Pure.
 *
 * Modes (slice 1):
 *   "paced"      a line narrated with no roll — its offer, its refusal, the sheet, the apparatus
 *   "move"       a move's narration — a soft refusal the GM overrode (TELL [overridden]);
 *                the rest of a result's kinds are slice 2's
 *   "round-entry" a Batch Mode round's entry the roll refused — its premise
 *
 * @param {{ mode: "paced"|"move"|"round-entry", refusal?: Object|null, offer?: string|null, note?: string|null }} input
 * @returns {Array<{ kind: string, list: string, text: string }>}
 */
export function obligationsFor({ mode, refusal = null, offer = null, note = null } = {}) {
  const out = [];
  if (mode === "paced") {
    if (refusal?.premise) out.push(line("premise", { refusal }));
    if (offer) out.push(line("offer", { offer }));
    out.push(line("sheet", { refused: !!refusal }));
    out.push(line("apparatus", { offer }));
  } else if (mode === "move") {
    if (note) out.push(line("overridden", { note }));
  } else if (mode === "round-entry") {
    if (refusal?.premise) out.push(line("premise", { refusal }));
  }
  return out;
}

/**
 * The one line a card carries for a move that could not be made (D3) — "No
 * Heal — nothing to heal: Mira's health is 5 of 5 and no wound is marked." —
 * on the paced card its line was narrated on, on the not-rolled notice of a
 * forced move, on a round's refused card. The narration is told the same
 * refusal as NOT SO [premise]; one wording for both.
 *
 * @param {{ moveId: string, why: string }} refusal — contracts/gate.js refusalOf
 * @returns {string}
 */
export function refusalNote(refusal) {
  const why = String(refusal?.why ?? "").trim().replace(/\.$/, "");
  return `No ${moveName(refusal?.moveId)} — ${why || "it cannot be made now"}.`;
}

/**
 * The block: WHAT THIS NARRATION MUST TELL, AND MUST NOT — the lists in order,
 * a tag a line. '' for none. `heading` is the block's markdown level (a
 * round's entries take theirs under `####`).
 *
 * @param {Array<{ kind: string, list: string, text: string }>} obligations
 * @param {{ heading?: string }} [opts]
 * @returns {string}
 */
export function formatObligationsBlock(obligations, { heading = "##" } = {}) {
  const list = Array.isArray(obligations) ? obligations.filter(o => o?.kind && o.text) : [];
  if (!list.length) return "";
  const parts = [`${heading} WHAT THIS NARRATION MUST TELL, AND MUST NOT`];
  for (const name of OBLIGATION_LISTS) {
    const lines = list.filter(o => o.list === name);
    if (!lines.length) continue;
    parts.push([LIST_HEADINGS[name], ...lines.map(o => `- [${o.kind}] ${o.text}`)].join("\n"));
  }
  return parts.join("\n\n");
}
