/**
 * STARFORGED COMPANION
 * src/narration/nativeProgressRoll.js
 *
 * Detect a NATIVE foundry-ironsworn progress-roll chat card so the Companion
 * can narrate vow/connection progress rolls made on the system character sheet
 * (issue #236 follow-up — playtesters rolled a vow on the Ironsworn sheet and
 * got no narration, because the system fires no hook and posts only its own
 * roll card).
 *
 * The system serialises the roll into the card HTML as
 *   <article class='ironsworn-roll' data-ironswornroll='{…json…}'>
 * (see vendor/foundry-ironsworn .../rolls/ironsworn-roll-message.hbs). The JSON
 * is HTML-escaped inside a single-quoted attribute. This module is PURE — it
 * extracts and classifies that payload; the caller (src/index.js) owns the
 * Foundry lookups, GM gate, and narration call.
 *
 * COUPLING NOTE: this reads foundry-ironsworn's internal serialized-roll shape
 * (`preRollOptions.progress`, `rawChallengeDiceValues`). It is deliberately
 * fail-safe — any shape it doesn't recognise yields null and no narration —
 * so a future system change degrades to "no auto-narration", never a crash.
 */

const ROLL_ATTR = /data-ironswornroll='([^']*)'/;

function htmlUnescape(s) {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");   // ampersand last so the above entities decode first
}

/**
 * Low-level: pull the serialised roll object out of a card's HTML. Distinguishes
 * "no roll here" from "a roll card we couldn't parse", so a caller can surface
 * the latter as a genuine failure (decisions.md → "No silent failures").
 *
 * @param {string} content
 * @returns {{ kind: 'roll', roll: object } | { kind: 'no-marker' } | { kind: 'unparseable' }}
 */
function extractIronswornRoll(content) {
  if (typeof content !== "string" || !content.includes("data-ironswornroll")) return { kind: "no-marker" };
  const m = content.match(ROLL_ATTR);
  if (!m) return { kind: "no-marker" };
  try { return { kind: "roll", roll: JSON.parse(htmlUnescape(m[1])) }; }
  catch { return { kind: "unparseable" }; }
}

/**
 * Classify what KIND of ironsworn roll a card carries — for the skip/log policy
 * (decisions.md → "No silent failures"). Separates a normal action roll (not
 * ours; stay quiet) from a malformed progress card (a vendor card-shape change
 * worth a warning) so the hook logs each at the right level.
 *
 * @param {string} content
 * @returns {'progress'|'action'|'not-a-roll'|'unparseable'}
 */
export function ironswornRollKind(content) {
  const ex = extractIronswornRoll(content);
  if (ex.kind === "no-marker")   return "not-a-roll";
  if (ex.kind === "unparseable") return "unparseable";
  const pre = ex.roll?.preRollOptions;
  if (!pre) return "unparseable";
  if (pre.progress != null) return "progress";
  if (pre.stat != null)     return "action";
  return "unparseable";
}

/**
 * Parse a foundry-ironsworn PROGRESS roll out of a chat message's content HTML.
 *
 * @param {string} content — ChatMessage.content (raw stored HTML)
 * @returns {{ score: number, challengeDice: [number, number],
 *             outcome: 'strong_hit'|'weak_hit'|'miss', source: string,
 *             moveDsId: string } | null}
 *   null when the content is not a foundry-ironsworn progress roll (action
 *   rolls, non-roll cards, our own cards, or any unrecognised shape). Use
 *   ironswornRollKind() to tell those cases apart for logging.
 */
export function parseIronswornProgressRoll(content) {
  const ex = extractIronswornRoll(content);
  if (ex.kind !== "roll") return null;
  const roll = ex.roll;

  const pre = roll?.preRollOptions;
  // A progress roll carries `progress`; an action roll carries `stat` instead.
  if (!pre || pre.progress == null) return null;

  const score = Number(pre.progress?.value);
  const dice  = Array.isArray(roll.rawChallengeDiceValues)
    ? roll.rawChallengeDiceValues.map(Number)
    : [];
  if (!Number.isFinite(score) || dice.length < 2 || !Number.isFinite(dice[0]) || !Number.isFinite(dice[1])) {
    return null;
  }

  const [c1, c2] = dice;
  const wins = (score > c1 ? 1 : 0) + (score > c2 ? 1 : 0);
  const outcome = wins === 2 ? "strong_hit" : wins === 1 ? "weak_hit" : "miss";

  return {
    score,
    challengeDice: [c1, c2],
    outcome,
    source:   typeof pre.progress?.source === "string" ? pre.progress.source : "",
    moveDsId: typeof pre.moveDsId === "string" ? pre.moveDsId : "",
  };
}

/**
 * Classify a parsed progress roll as a vow or connection resolution, returning
 * the Companion moveId to narrate it as — or null to skip (expedition/combat/
 * scene-challenge progress are resolved by the Companion's own cards, and
 * anything indeterminate is left alone).
 *
 * `subtypeLookup(source)` is an injected, side-effecting resolver the caller
 * supplies (it reads the speaker actor's progress Items); kept out of this pure
 * module. It should return 'vow' | 'connection' | null.
 *
 * @param {{ moveDsId: string, source: string }} parsed
 * @param {(source: string) => ('vow'|'connection'|null)} [subtypeLookup]
 * @returns {'fulfill_your_vow'|'forge_a_bond'|null}
 */
export function classifyProgressRoll(parsed, subtypeLookup) {
  const dsid = String(parsed?.moveDsId ?? "").toLowerCase();
  if (dsid.includes("fulfill_your_vow")) return "fulfill_your_vow";
  if (dsid.includes("forge_a_bond") || dsid.includes("develop_your_relationship")) return "forge_a_bond";

  const sub = typeof subtypeLookup === "function" ? subtypeLookup(parsed?.source ?? "") : null;
  if (sub === "vow")        return "fulfill_your_vow";
  if (sub === "connection") return "forge_a_bond";
  return null;
}

/**
 * Decide what the native-progress-roll hook should do once the Foundry-coupled
 * facts are known, and — when it declines — *why* and at what log level, so the
 * caller never skips without a trace (decisions.md → "No silent failures").
 * Pure: the caller resolves "is this my roll?", the roll kind, the parsed roll,
 * and the classified move (all need Foundry/regex), then hands them here.
 *
 * @param {{ isRoller: boolean, rollKind: string, parsed: object|null,
 *           moveId: string|null }} facts
 * @returns {{ act: boolean, reason: string, log: 'none'|'debug'|'warn' }}
 *   act:true → narrate. act:false → `reason` names the skip and `log` is the
 *   level to surface it ('none' = a correct, uninteresting stand-down).
 */
export function planNativeRollNarration({ isRoller, rollKind, parsed, moveId } = {}) {
  if (!isRoller) return { act: false, reason: "not-this-clients-roll", log: "none" };
  if (!parsed) {
    if (rollKind === "unparseable") return { act: false, reason: "unparseable-roll-card", log: "warn" };
    if (rollKind === "action")      return { act: false, reason: "action-roll", log: "none" };
    return { act: false, reason: "not-an-ironsworn-roll", log: "none" };
  }
  if (!moveId) return { act: false, reason: "not-vow-or-connection", log: "debug" };
  return { act: true, reason: "narrate", log: "debug" };
}
