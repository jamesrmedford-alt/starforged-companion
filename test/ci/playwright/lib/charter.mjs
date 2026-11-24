// Whether a charter can be run at all — every charter explore.mjs is given,
// the memory charter, the long haul and each scenario of a suite alike (a
// suite adds its own rules: lib/suite.mjs scenarioProblem).
//
// Pure.

import { BEAT_CHECKS } from "./beats.mjs";
import { seedProblem } from "./world.mjs";

/**
 * Why a charter can't run, or null.
 *
 * A charter needs a persona, a goal and a seed with a player character the
 * seed can make. A charter without beats is scored as the memory goal, so it
 * needs a fact that decides it; a charter with beats is scored by its beats
 * and needs none (a scenario about a fight asks nothing of the narrator's
 * memory), though every fact it has must be well formed. Each beat is named,
 * numbered and checked by something the observer knows, and needs only beats
 * the charter has.
 *
 * @param {object} charter
 * @returns {string|null}
 */
export function charterProblem(charter) {
  if (!charter?.persona || !charter?.goal) return "it needs a persona and a goal";
  if (!charter?.seed?.pc?.name) return "its seed needs a player character";
  const seed = seedProblem(charter.seed);
  if (seed) return `its seed: ${seed}`;
  const beats = charter.beats ?? [];
  const facts = charter.facts ?? [];
  if (!Array.isArray(facts)) return "its facts are a list";
  if (!beats.length && !facts.some(f => f.required !== false)) return "it needs at least one required fact";
  if (facts.some(f => !f.id || !Array.isArray(f.variants) || !f.variants.length)) return "every fact needs an id and its accepted variants";
  // A charter with beats: each one named, numbered and checked by something the observer knows.
  const bad = beats.find(b => !b.id || !Number.isInteger(b.n) || !b.title || !BEAT_CHECKS[b.check?.type]);
  if (bad) return `beat ${bad.n ?? bad.id ?? "?"} needs an id, a number, a title and a check the observer knows (${bad.check?.type ?? "none"})`;
  const unknown = beats.flatMap(b => (b.needs ?? []).filter(id => !beats.some(x => x.id === id)).map(id => `${b.id} needs ${id}`));
  if (unknown.length) return `a beat needs one that is not in the charter (${unknown[0]})`;
  return null;
}
