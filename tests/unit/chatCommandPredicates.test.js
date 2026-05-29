/**
 * STARFORGED COMPANION
 * tests/unit/chatCommandPredicates.test.js
 *
 * Predicate-matrix exclusivity tests for the chat-command routing layer
 * in `src/index.js`. Each `is*Command` predicate must match its own
 * canonical command form AND reject every other command's canonical
 * form. A typo in a regex (e.g. widening `isAtCommand` to match
 * `!atlas`) would silently re-route commands to the wrong handler;
 * CHAT-001 (the `!`-prefix migration) was the framework-boundary
 * instance of this same defect class.
 *
 * Surfaces Priority 3 of the behaviour-coverage audit
 * (docs/behaviour-coverage-audit.md — Lens 3 IP5).
 */

import { describe, it, expect } from "vitest";

import {
  isRecapCommand,
  isSectorCommand,
  isXCardCommand,
  isAtCommand,
  isJournalCommand,
  isTruthsCommand,
  isLoreCommand,
  isPaceCommand,
  isRollCommand,
  isOracleCommand,
  isPayThePriceCommand,
  isBondCommand,
  isFlagCommand,
  isFateCommand,
  isBreakCommand,
  isBeginSessionCommand,
  isEndSessionCommand,
  isSceneCommand,
  isFactContinuityCommand,
  isSceneQuery,
} from "../../src/index.js";


// ─────────────────────────────────────────────────────────────────────────────
// Predicate registry — name + predicate + canonical command samples
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical samples are commands that SHOULD match the predicate.
 * Adversarial samples are near-misses that should NOT match (typo-defect
 * tripwires — e.g. `!atlas` for isAtCommand).
 */
const PREDICATES = [
  {
    name: "isRecapCommand",
    fn:   isRecapCommand,
    canonical: ["!recap", "!recap session", "!recap campaign", "!recap session 3"],
    adversarial: ["!recapify", "!recaplog", "recap"],
  },
  {
    name: "isSectorCommand",
    fn:   isSectorCommand,
    canonical: ["!sector", "!sector new", "!sector list"],
    adversarial: ["!sectoral", "sector"],
  },
  {
    name: "isXCardCommand",
    fn:   isXCardCommand,
    canonical: ["!x", "!X", " !x "],
    adversarial: ["!xenophile", "!xcard", "x"],
  },
  {
    name: "isAtCommand",
    fn:   isAtCommand,
    canonical: ["!at", "!at Starfall", "!at  Forgehome"],
    adversarial: ["!atlas", "!attack", "at"],
  },
  {
    name: "isJournalCommand",
    fn:   isJournalCommand,
    canonical: ["!journal lore Discovery", "!journal threat Drifters", "!journal faction Hegemony", "!journal location Glimmer"],
    adversarial: ["!journals", "!journaling", "journal"],
  },
  {
    name: "isTruthsCommand",
    fn:   isTruthsCommand,
    // Avoid prefix collision with isFactContinuityCommand which matches !truth\s+
    canonical: ["!truths"],
    adversarial: ["!truthful", "truths"],
  },
  {
    name: "isLoreCommand",
    fn:   isLoreCommand,
    canonical: ["!lore"],
    adversarial: ["!loremaster", "!lorekeeper", "lore"],
  },
  {
    name: "isPaceCommand",
    fn:   isPaceCommand,
    canonical: ["!pace", "!pace hot", "!pace quiet", "!pace clear", "!pace status"],
    adversarial: ["!pacer", "!pacify", "pace"],
  },
  {
    name: "isRollCommand",
    fn:   isRollCommand,
    canonical: ["!roll"],
    adversarial: ["!roller", "!rolling", "roll", "/roll"],
  },
  {
    name: "isOracleCommand",
    fn:   isOracleCommand,
    canonical: ["!oracle action", "!oracle theme", "!oracle weakness"],
    adversarial: ["!oracular", "oracle"],
  },
  {
    name: "isPayThePriceCommand",
    fn:   isPayThePriceCommand,
    canonical: ["!pay-the-price", "!ptp", "!pay-the-price the ship?", "!ptp what breaks"],
    adversarial: ["!pay", "!ptpd", "!pay-the-pricey", "ptp"],
  },
  {
    name: "isBondCommand",
    fn:   isBondCommand,
    canonical: ["!bond"],
    adversarial: ["!bondage", "!bonded", "bond"],
  },
  {
    name: "isFlagCommand",
    fn:   isFlagCommand,
    canonical: ["!flag"],
    adversarial: ["!flagship", "!flagged", "flag"],
  },
  {
    name: "isFateCommand",
    fn:   isFateCommand,
    canonical: ["!fate"],
    adversarial: ["!fated", "!fateful", "fate"],
  },
  {
    name: "isBreakCommand",
    fn:   isBreakCommand,
    canonical: ["!break"],
    adversarial: ["!breakable", "!breaking", "break"],
  },
  {
    name: "isBeginSessionCommand",
    fn:   isBeginSessionCommand,
    // The predicate requires the `-session` suffix — `!begin` alone is not enough.
    canonical: ["!begin-session"],
    adversarial: ["!beginner", "!begin", "begin"],
  },
  {
    name: "isEndSessionCommand",
    fn:   isEndSessionCommand,
    // The predicate requires the `-session` suffix — `!end` alone is not enough.
    canonical: ["!end-session"],
    adversarial: ["!endless", "!endurance", "!end", "end"],
  },
  {
    name: "isSceneCommand",
    fn:   isSceneCommand,
    canonical: ["!scene start", "!scene end"],
    adversarial: ["!sceney", "!scenery", "scene"],
  },
  {
    name: "isFactContinuityCommand",
    fn:   isFactContinuityCommand,
    // !truth <subject> ... or !state <subject> ... — both with a trailing space
    canonical: ["!truth subject body", "!state subject body"],
    adversarial: ["!truthful", "!stateful", "truth", "state"],
  },
  {
    name: "isSceneQuery",
    fn:   isSceneQuery,
    // @scene-prefixed query. isSceneQuery has a GM gate via message.author,
    // so fixtures supply isGM: false. Also requires a body after the prefix.
    canonical: ["@scene who am I", "@scene what is here"],
    adversarial: ["@scenery", "@scenes", "scene"],
  },
];

function asMessage(text, extra = {}) {
  // Author defaults to a GM so predicates with a GM gate (isRecapCommand
  // when recapGmOnly is true — its default) reach their regex check.
  // This test is about predicate-matrix exclusivity (regex shape), not
  // about authorisation — the GM-gating is asserted by per-handler
  // tests elsewhere.
  return {
    content: text,
    flags:   {},
    author:  { isGM: true, id: "GM1" },
    ...extra,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// PER-PREDICATE — each matches its own canonical samples
// ─────────────────────────────────────────────────────────────────────────────

describe("chat command predicates — canonical matches", () => {
  for (const p of PREDICATES) {
    for (const sample of p.canonical) {
      it(`${p.name} matches ${JSON.stringify(sample)}`, () => {
        expect(p.fn(asMessage(sample))).toBe(true);
      });
    }
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// PER-PREDICATE — each rejects its own adversarial near-misses
// ─────────────────────────────────────────────────────────────────────────────

describe("chat command predicates — typo / near-miss rejection", () => {
  for (const p of PREDICATES) {
    for (const sample of p.adversarial) {
      it(`${p.name} rejects ${JSON.stringify(sample)}`, () => {
        expect(p.fn(asMessage(sample))).toBe(false);
      });
    }
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// MUTUAL EXCLUSIVITY — no command string matches more than one predicate
// ─────────────────────────────────────────────────────────────────────────────

describe("chat command predicate matrix — mutual exclusivity", () => {
  // Build the universe of canonical command strings to evaluate.
  const ALL_CANONICAL = PREDICATES.flatMap(p => p.canonical.map(s => ({ predicate: p.name, sample: s })));

  for (const { predicate, sample } of ALL_CANONICAL) {
    it(`${JSON.stringify(sample)} matches exactly one predicate (${predicate})`, () => {
      const msg = asMessage(sample);
      const matches = PREDICATES.filter(p => p.fn(msg)).map(p => p.name);
      expect(matches, `expected exactly one match for ${JSON.stringify(sample)}`).toEqual([predicate]);
    });
  }
});
