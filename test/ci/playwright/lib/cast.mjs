// The charter's cast, and how a name on the table is told to be one of them.
//
// A charter names the people its GM knows (`cast`). The table does not always
// call them what the charter does: the long haul's third live run named
// "Tamsin Vey" in full, the narrator answered with "Tamsin", and the module
// proposed a card for "Tamsin". The GM's rules confirmed a draft only under
// the cast's exact name, so the card was never made and five beats were lost
// with it — a GM at a table would have pressed it.
//
// So a name is a cast member's when it is one of the names they go by, or a
// whole-word part of one — and of no other member's. Everything that looks
// for a cast member's card asks here: the GM's rule that confirms a draft
// (lib/gm.mjs), the beats' checks (lib/beats.mjs), the rename the runner
// makes, and the option a player picks in a dropdown (lib/player.mjs).
//
// Pure: no page, no clock.

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

/** A name's words, lower case, the punctuation round each taken off ("Tamsin Vey," → tamsin, vey). */
const wordsOf = (name) => clean(name).toLowerCase().split(" ").map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")).filter(Boolean);

/**
 * Whether `part` is a whole-word part of `whole`: its words stand in it, in
 * order and side by side — "Tamsin" and "Vey" in "Tamsin Vey"; not "Tam", not
 * "Tamsin V", and not the whole name itself.
 */
export function isWholeWordPart(part, whole) {
  const p = wordsOf(part);
  const w = wordsOf(whole);
  if (!p.length || p.length >= w.length) return false;
  for (let i = 0; i + p.length <= w.length; i++) if (p.every((word, j) => word === w[i + j])) return true;
  return false;
}

/**
 * The people of a charter's cast, each with every name they go by. An entry
 * that says whose later name it is (`was`: the name they were made under) is
 * that person, not another: the long haul's `renamed` is its `connection`
 * after beat 18's rename.
 *
 * A cast that does not say so lists two people — which is how a run kept from
 * before `was` replays as it was played: "Tamsin" is then part of two
 * members' names, and is left.
 *
 * @param {Record<string, { name: string, was?: string }>|Array<{ name: string, was?: string }>} cast
 * @returns {Array<{ name: string, names: string[] }>} `name` is the name the member is made under
 */
export function castMembers(cast) {
  const entries = (Array.isArray(cast) ? cast : Object.values(cast ?? {})).filter(c => clean(c?.name));
  const members = entries.filter(c => !c.was || !entries.some(o => o !== c && same(o.name, c.was)))
    .map(c => ({ ...c, name: clean(c.name), names: [clean(c.name)] }));
  for (const later of entries.filter(c => c.was)) {
    const of = members.find(m => same(m.name, later.was));
    if (of && !of.names.some(n => same(n, later.name))) of.names.push(clean(later.name));
  }
  return members;
}

/**
 * The cast member a name on the table is: the one who goes by exactly that
 * name, else the one — and only one — who goes by a name it is a whole-word
 * part of. Null for a name that is nobody's, or could be two people's.
 *
 * @param {string} name — a draft's, a card's
 * @param {Array<{ name: string, names: string[] }>} members — castMembers'
 * @returns {{ name: string, names: string[] }|null}
 */
export function castMemberFor(name, members) {
  const list = members ?? [];
  const exact = list.filter(m => m.names.some(n => same(n, name)));
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  const part = list.filter(m => m.names.some(n => isWholeWordPart(name, n)));
  return part.length === 1 ? part[0] : null;
}

/**
 * The option a player means in a dropdown: the one asked for as it is
 * written, else the one option that is a whole-word part of what was asked
 * for, or that it is a whole-word part of ("Tamsin Vey" asked for, "Tamsin"
 * offered: the card was made under half her name). Null when none is, or two
 * could be.
 *
 * @param {string} wanted
 * @param {string[]} options
 * @returns {string|null}
 */
export function optionFor(wanted, options) {
  const list = options ?? [];
  const exact = list.find(o => o === clean(wanted)) ?? list.find(o => same(o, wanted));
  if (exact != null) return exact;
  const near = list.filter(o => isWholeWordPart(o, wanted) || isWholeWordPart(wanted, o));
  return near.length === 1 ? near[0] : null;
}
