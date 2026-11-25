/**
 * STARFORGED COMPANION
 * tests/unit/moveOnlyState.test.js
 *
 * Overhaul 4, "moves as contracts" — slice 3 (design §7): state only a move
 * may make. A connection (a bond Item on a PC's sheet — Make a Connection), a
 * bond (Forge a Bond), progress on a vow (Reach a Milestone), a vow's end
 * (Fulfill / Forsake Your Vow), a progress track — a fight (Enter the Fray's
 * commit), an expedition (Undertake an Expedition), a scene challenge (Begin
 * the Scene). In the long haul's fourth live run a draft card's Confirm made
 * a connection no roll had made (CONNECTION-MADE-BY-CONFIRMING-A-DRAFT, D4)
 * and a Strike's marks could make a fight nobody declared (D6).
 *
 * MOVE_ONLY_STATE names each writer and every production function that may
 * call it, with what makes the state there: a move id; "setup" (the game's
 * own launch step — the starting sector's local connection, the
 * quickstart's); "hand" (the table's own tools, never blocked — D7); "via"
 * (a helper that passes on its caller's `by`). The sweep holds it to the
 * source (src/ minus Quench, comments and strings blanked): every call of a
 * writer is inside a listed caller, and no listed caller is dead — a new
 * writer of move-only state fails here until it is listed with what makes it.
 * The table lives here, with its one reader (the chain sweep's OFF_CHAIN
 * pattern): a src module only a test imports would be a producer with no
 * production consumer (rules/reachability.md).
 */

import { describe, it, expect } from "vitest";
import { productionSources, maskLiterals, matchBracket, lineOf } from "../helpers/sourceScan.js";
import { stripComments } from "../../scripts/deadscan.mjs";

/** What makes a piece of move-only state, a writer at a time: `<file>#<function>` → its maker. */
const MOVE_ONLY_STATE = Object.freeze({
  connection: { writers: ["createCharacterBondItem"], callers: {
    "src/entities/entityExtractor.js#registerConnectionOnActiveCharacter": "via",
    "src/sectors/sectorGenerator.js#createEntityJournals": "setup",
    "src/session/quickstart.js#createQuickstartPc": "setup",
  } },
  bond: { writers: ["setBondItemForged"], callers: {
    "src/entities/connection.js#forgeBond": "via",
  } },
  vowProgress: { writers: ["markVowProgress"], callers: {
    "src/index.js#applyReachMilestone": "reach_a_milestone",
    "src/moves/milestonePicker.js#applyMilestonePick": "reach_a_milestone",
  } },
  vowEnd: { writers: ["completeVowItem"], callers: {
    "src/index.js#completeVowItemByName": "fulfill_your_vow",
    "src/moves/movePipeline.js#rollAndApply": "forsake_your_vow",
  } },
  // One writer for every type of track; each caller makes one type.
  track: { writers: ["addProgressTrack"], callers: {
    "src/index.js#createCombatTrackFromThreshold": "enter_the_fray",
    "src/index.js#applyOutcomeEffects": "undertake_an_expedition",
    "src/moves/sceneChallengeOffer.js#applySceneChallengeOffer": "begin_the_scene",
    "src/ui/progressTracks.js#applyProgressTrackEditFromRelay": "hand",
  } },
});

const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "function", "return", "typeof", "await", "new", "with"]);

/** Every named function in a file: { name, start, end } (the campaign-state chain sweep's reading). */
function functionSpans(src) {
  const { mask } = src;
  const out = [];
  const add = (name, at, paren) => {
    const parenClose = matchBracket(mask, paren);
    if (parenClose < 0) return;
    const after = mask.slice(parenClose + 1);
    const arrow = /^\s*=>\s*/.exec(after);
    const bodyAt = parenClose + 1 + (arrow ? arrow[0].length : after.search(/\S/));
    if (mask[bodyAt] === "{") {
      const end = matchBracket(mask, bodyAt);
      if (end > 0) out.push({ name, start: at, end });
    } else if (arrow) {
      const end = mask.indexOf(";", bodyAt);
      out.push({ name, start: at, end: end < 0 ? mask.length : end });
    }
  };
  for (const m of mask.matchAll(/(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/g)) add(m[1], m.index, m.index + m[0].length - 1);
  for (const m of mask.matchAll(/(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b[^(]*)?\(/g)) add(m[1], m.index, m.index + m[0].length - 1);
  for (const m of mask.matchAll(/(?:^|[\n;{}])\s*(?:static\s+)?(?:async\s+)?#?([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{/g)) {
    if (KEYWORDS.has(m[1])) continue;
    add(m[1], m.index, mask.indexOf("(", m.index + m[0].indexOf(m[1]) + m[1].length));
  }
  return out;
}

/** The outermost named function containing `at` — the one a caller is listed by — or null at top level. */
function callerOf(fns, at) {
  const around = fns.filter(f => at > f.start && at < f.end);
  return around.sort((a, b) => (b.end - b.start) - (a.end - a.start))[0] ?? null;
}

/** Every call of `writer` in the sources: `{ key: "<file>#<function>", at: "<file>:<line>" }` (its definition left out). */
function callsOf(writer, sources) {
  const call = new RegExp(`(?<![\\w$.#])${writer}\\s*\\(`, "g");
  const out = [];
  for (const src of sources) {
    const fns = functionSpans(src);
    for (const m of src.mask.matchAll(call)) {
      if (fns.some(f => f.name === writer && f.start <= m.index && m.index - f.start < 60)) continue;   // its own definition
      const fn = callerOf(fns, m.index);
      out.push({ key: `${src.file}#${fn?.name ?? "(top level)"}`, at: `${src.file}:${lineOf(src.text, m.index)}` });
    }
  }
  return out;
}

function fixture(file, text) {
  const code = stripComments(text);
  return { file, text, code, mask: maskLiterals(code) };
}

describe("move-only state — every writer's caller is a move, setup or the table's hand", () => {
  const sources = productionSources();

  for (const [state, { writers, callers }] of Object.entries(MOVE_ONLY_STATE)) {
    it(`${state}: every call of ${writers.join(", ")} is inside a listed caller`, () => {
      const calls = writers.flatMap(w => callsOf(w, sources));
      expect(calls.length, "the scan finds the calls").toBeGreaterThan(0);
      expect(calls.filter(c => !Object.hasOwn(callers, c.key)).map(c => `${c.at} ${c.key}`)).toEqual([]);
    });

    it(`${state}: no listed caller is dead`, () => {
      const keys = new Set(writers.flatMap(w => callsOf(w, sources)).map(c => c.key));
      expect(Object.keys(callers).filter(k => !keys.has(k))).toEqual([]);
    });
  }

  it("every maker is a move, setup, the hand, or a helper passing its caller's on", async () => {
    const { MOVES } = await import("../../src/schemas.js");
    for (const { callers } of Object.values(MOVE_ONLY_STATE)) {
      for (const [key, by] of Object.entries(callers)) {
        expect(["setup", "hand", "via"].includes(by) || Object.hasOwn(MOVES, by) || by === "begin_the_scene", key).toBe(true);
      }
    }
  });

  it("control: a writer called from an unlisted function is caught; a listed one passes", () => {
    const src = fixture("src/fixture/a.js", `
      export async function confirmTheCard(record) { await createCharacterBondItem(actor, record); }
      export async function registerConnectionOnActiveCharacter(record) { await createCharacterBondItem(actor, record); }
    `);
    expect(callsOf("createCharacterBondItem", [src]).map(c => c.key))
      .toEqual(["src/fixture/a.js#confirmTheCard", "src/fixture/a.js#registerConnectionOnActiveCharacter"]);
  });
});
