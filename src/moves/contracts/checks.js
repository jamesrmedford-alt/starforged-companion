/**
 * STARFORGED COMPANION
 * src/moves/contracts/checks.js — is the narration true to its obligations?
 *
 * Overhaul 4, "moves as contracts" (slice 4; design §8.5, D9). The table
 * reads a narration as soon as it posts, so it is checked before: each line
 * of its obligations block (obligations.js) by its class —
 *
 *   certain   a regular expression in code: [apparatus] (an outcome's name;
 *             a move's display name of two words or more outside the closing
 *             offer line; a sheet number; a meter named as the game names
 *             it; a stat with its number; time counted in boxes; a track
 *             read out beside a word of the track's; the narration speaking
 *             of its own build), [match] (the word, for a roll that matched),
 *             [material] (a set-piece's rolled word as a label, a name or its
 *             pair — materialViolations), [person] (a second-person
 *             narration's character by name — personViolations), [here] (the
 *             fact block's frame, its present or the prose putting the
 *             characters at another place than the record's —
 *             hereViolations, which reads the fact block too), [arrival] (a
 *             journey's arrival: its fact block's present holding someone the
 *             record has elsewhere), and [quote] (a quoted line of six words
 *             or more an earlier narration of the session gave) — a failure
 *             is re-asked once
 *   floor     a lexical minimum: [vow] (the prose shares a word with the
 *             vow's name, or says what is still not known — re-asked once);
 *             [chosen] (a word of the cost's meter — logged); [letgo] (a stem
 *             of the let-go question in the prose's last two sentences that
 *             the beat's player words do not hold — logged; overhaul 2 §10.3)
 *   judge     a NOT YET / NOT SO line whose tripwire words appear in the prose
 *             (a word's possessive counts as the word)
 *             ([premise], [cost], [price], [fight], [offer], [oracle],
 *             [state], [unsaid] (speech words, on a move pressed on a card),
 *             [foe] (the fight told over before Take Decisive Action), [dice]
 *             (what the dice decided about what the line names),
 *             [whereabouts] (someone the record has elsewhere), and overhaul
 *             2's [place]: "docked", "berth", "clamps"
 *             on the beat that opens a fight's scene while the ship's record
 *             has her docked): one small model call (Haiku, through
 *             api-proxy.js, label `obligationJudge`) asks whether the prose
 *             tells any tripped line as true (its `judge` words where it has
 *             them); a violation re-asks only for a kind judgeMayAct allows
 *   logged    everything else ([scene] among them), left to the
 *             post-narration audit
 *
 * narrateKeepingObligations wraps the narrator call: the reply's prose is
 * read (sidecarParser.extractSidecar — pure, before any fact block is
 * applied), checked, and on a failure asked once more with the draft and the
 * line it broke; the second reply is held to the certain checks only and
 * posted whatever it says. Budget: one judge call and one re-ask a
 * narration — at most two narrator calls a beat. Fail-open: a judge that
 * errs, times out or answers unparsed passes the narration as written. No
 * key, no judge.
 */

import { apiPost } from "../../api-proxy.js";
import { extractSidecar } from "../../factContinuity/sidecarParser.js";
import { touchesLetGo } from "../../factContinuity/provenance.js";
import { tellingStems } from "../../world/tellingWords.js";
import { MOVES } from "../../schemas.js";
import { moveDisplayName } from "../../system/i18n.js";
import { personSaidIn } from "../../entities/nameMatch.js";
import { quotedLinesOf } from "../../narration/proseVariety.js";
import { OBLIGATION_KINDS } from "./obligations.js";

const MODULE_ID = "starforged-companion";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const JUDGE_MODEL = "claude-haiku-5-5";
const JUDGE_MAX_TOKENS = 400;
/** A judge slower than this passes the narration as written. */
const JUDGE_TIMEOUT_MS = 4000;

// ─────────────────────────────────────────────────────────────────────────────
// Certain
// ─────────────────────────────────────────────────────────────────────────────

const OUTCOME_NAME = /\b(?:strong|weak)[ -]hit\b/i;
const SHEET_NUMBER = /\b\d+\s+(?:health|spirit|supply|momentum|integrity)\b|[+−-]\d+\s+momentum\b/i;
// A meter named as the game names it, in the middle of a sentence: round 8's a71, "and Momentum drains out of you".
const METER_TERM = /(?<=[a-z,;:] )(?:Health|Spirit|Supply|Momentum)\b/;
// Issue #397, Code fix 4 (TABLE-WORDS-IN-THE-FICTION). Narrow on purpose: each
// match re-asks the narrator. A stat with its number — the capital and the digit
// together keep "her heart" and "cold iron" out (r1 a15, "because Wits 3 is a lot
// of thinking").
const STAT_NUMBER = /\b(?:Edge|Heart|Iron|Shadow|Wits)\s+\d\b/;
const COUNT_WORD = String.raw`(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)`;
// Time counted in boxes (r5 a78, "Four boxes ago this was only a rumor on a dock").
const BOXES_AGO = new RegExp(String.raw`\b${COUNT_WORD}\s+(?:box(?:es)?|ticks?)\s+ago\b`, "i");
// A track read out — only beside a word of the track's (r5 a58, "Still counting your
// boxes? … Two of ten."): alone, "two of ten ships" is ordinary prose.
const OF_TEN = new RegExp(String.raw`\b${COUNT_WORD}\s+of\s+(?:ten|10)\b`, "i");
const TRACK_WORDS = /\b(?:box|boxes|track|progress|milestones?)\b/i;
// The narration speaking of its own build — the beat-shape hint read back as prose
// (proseVariety.js BEAT_SHAPES; NARRATION-WRITES-ITS-SHAPE-DIRECTIVE): "The first
// sentence should be about someone other than Ren: Vance, or Mira." opened a
// recorded round (the batch-round playthrough, 2026-11-25).
const SHAPE_ECHO = /\bfirst sentence\b|\bacting character\b/i;

/** The prose without its closing italic offer line (the one place a move may be named). */
function bodyOf(prose) {
  return String(prose ?? "").replace(/\s*[*_][^*_\n]{3,}[*_]\s*$/, "").trim();
}

/**
 * The one text any judge reads (issue #399, D1): the narration without its
 * fact block and without its closing offer line — the line the rules let
 * name a move, which round 9's judge and audit read as the move made (eleven
 * false findings, none right). `kind` says what narration this is; a
 * `cutaway` (a session's closing vignette, a spotlight) is not about where
 * the characters are, so it is not held to the lines that say so. Both the
 * pre-post judge (judgeNarration) and the audit (consistencyCheck.js) read
 * it; nothing else builds text for a judge. Pure.
 *
 * @param {string} text — a narration, its fact block on or off
 * @param {{ kind?: string|null }} [opts] — the narration's kind: `cutaway`, a mode, or none
 * @returns {{ text: string, cutaway: boolean }}
 */
export function judgedView(text, { kind = null } = {}) {
  const raw = String(text ?? "");
  const prose = extractSidecar(raw).prose ?? raw;
  return { text: bodyOf(prose), cutaway: kind === "cutaway" };
}

/**
 * The kinds whose verdicts may act, by pass (issue #399, D7: authority
 * follows the measure) — the pre-post judge's (`judge`) may re-ask a
 * narration before it posts, the audit's (`audit`) may post its review card.
 * Each pass is measured on its own (the audit's N3: the two read every line
 * with different prompts), on the labelled set of the kept runs
 * (test/ci/playwright/judges.mjs; decisions.md → "Issue #399"). A kind is
 * here only where it passes that pass's bar on the counts pooled over the
 * runs made with the current judge sentences (judges/pool.json), the newest
 * as the module ships: the model samples at its default, so one run's flip
 * of a verdict is noise, and the pool is the measure.
 * tests/unit/judgeMeasure.test.js holds the sets to it.
 *
 * A pass is asked about a kind only where its verdict may act (D10): the
 * judge-class kinds are exactly the `judge` set (a kind that failed it was
 * retired to "logged", so it trips no call), and the audit is sent the lines
 * of the `audit` set's kinds and no others (consistencyCheck.js). [dice]
 * and [place] passed neither, and no judge reads them.
 */
const JUDGE_KINDS_THAT_ACT = Object.freeze({
  judge: Object.freeze(new Set(["cost", "fight", "foe", "oracle", "premise", "price", "unsaid", "whereabouts"])),
  audit: Object.freeze(new Set(["cost", "fight", "offer", "premise", "price", "state"])),
});

/**
 * Whether a verdict on a line of `kind` may act in `pass` — "judge" (re-ask)
 * or "audit" (a review card) — by JUDGE_KINDS_THAT_ACT.
 *
 * @param {string} kind
 * @param {"judge"|"audit"} pass
 * @returns {boolean}
 */
export function judgeMayAct(kind, pass) {
  const acting = JUDGE_KINDS_THAT_ACT[pass];
  return !!acting && acting.has(String(kind ?? "").replace(/^\[|\]$/g, ""));
}

/**
 * The check class a kind's row declares — "certain", "floor", "judge",
 * "logged" — or null for a kind no row declares (issue #399, D4: the `check`
 * word on each row of obligations.js OBLIGATION_KINDS is what the code holds
 * a line to; it was documentation, and the split was hard-coded here).
 *
 * @param {string} kind
 * @returns {"certain"|"floor"|"judge"|"logged"|null}
 */
export function checkClassOf(kind) {
  return OBLIGATION_KINDS[String(kind ?? "")]?.check ?? null;
}

/** Move display names of two words or more — a one-word name is an ordinary word (Strike, Heal, Compel). */
const MULTIWORD_MOVE_NAMES = Object.freeze(Object.keys(MOVES)
  .map(id => { try { return moveDisplayName(id); } catch { return null; } })
  .filter(n => typeof n === "string" && /\s/.test(n.trim())));

const quoteAround = (text, index, len) => text.slice(Math.max(0, index - 30), Math.min(text.length, index + len + 30)).trim();

/** [apparatus]: the table's words in the prose's body. One violation a pattern; a move's name once. */
function apparatusViolations(body) {
  const out = [];
  const outcome = OUTCOME_NAME.exec(body);
  if (outcome) out.push({ tag: "apparatus", quote: quoteAround(body, outcome.index, outcome[0].length) });
  const number = SHEET_NUMBER.exec(body);
  if (number) out.push({ tag: "apparatus", quote: quoteAround(body, number.index, number[0].length) });
  const shape = SHAPE_ECHO.exec(body);
  if (shape) out.push({ tag: "apparatus", quote: quoteAround(body, shape.index, shape[0].length) });
  const meter = METER_TERM.exec(body);
  if (meter) out.push({ tag: "apparatus", quote: quoteAround(body, meter.index, meter[0].length) });
  for (const found of [STAT_NUMBER.exec(body), BOXES_AGO.exec(body), TRACK_WORDS.test(body) ? OF_TEN.exec(body) : null]) {
    if (found) { out.push({ tag: "apparatus", quote: quoteAround(body, found.index, found[0].length) }); break; }
  }
  for (const name of MULTIWORD_MOVE_NAMES) {
    const at = body.indexOf(name);
    if (at >= 0) { out.push({ tag: "apparatus", quote: quoteAround(body, at, name.length) }); break; }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Harm told where the sheet took none (issue #399, D9; HARM-TOLD-WITHOUT-A-COST)
// ─────────────────────────────────────────────────────────────────────────────

// A body's part, said as "your …".
const BODY_PARTS = "shoulders?|arms?|forearms?|wrists?|hands?|palms?|fingers?|knuckles|elbows?|ribs|side|chest|back|neck|throat|face|"
  + "cheeks?|jaw|lips?|scalp|head|temples?|brow|forehead|legs?|thighs?|knees?|shins?|calf|calves|ankles?|feet|foot|hips?|skin|flesh";
const YOUR_PART = `your (?:left |right |good |bad |bare |outstretched )?(?:${BODY_PARTS})\\b`;
// Harm done now, in the narration's present: a wound's verb on your body ("Something hot rakes your shoulder").
const HARM_DONE = new RegExp(`\\b(?:rakes|burns|scalds|sears|singes|blisters|slices|cuts|gashes|grazes|bites|tears|splits|pierces|stabs|`
  + `lacerates|cracks|breaks|crushes|lashes)(?: into| across| along| through| at| open)? ${YOUR_PART}`, "i");
// …or harm carried onto it ("spits scalding vapor across your forearm").
const HARM_CARRIED = new RegExp(`\\b(?:scalding|searing|burning|scorched|burnt|burned|white-hot|red-hot|blistering)\\b[^.!?\\n]{0,40}?\\b(?:across|along|into|over|`
  + `through|on|down) ${YOUR_PART}`, "i");
// A wound told: on a character whose sheet holds none, any is the prose's own.
const WOUND_TOLD = new RegExp(`\\b(?:the|your|a|fresh|new) (?:cuts?|gash(?:es)?|wounds?|burns?|grazes?|scrapes?)\\b|${YOUR_PART} `
  + "(?:bleeds?|throbs?|stings?|aches?|burns?)\\b|\\b(?:bandages?|dressings?|sealant|antiseptic|stitches)\\b", "i");
// A move whose narration tells a wound by design: the harm itself, or its treatment.
const WOUND_MOVES = new Set(["endure_harm", "face_death", "heal", "sojourn"]);
// A TELL line that names health lost — a stated price, a chosen cost.
const HEALTH_TOLD = /\bEndure Harm\b|\bhealth\b|\bharm\b/i;

/**
 * Words of bodily harm said of "you" where the sheet took no health (issue
 * #399, D9). Two cases, each read from the narration's lines alone:
 *   - a beat of play — its [sheet] line holds the sheet to what TELL names —
 *     whose TELL lines name no health lost, and none of whose moves tells a
 *     wound by design (Endure Harm, Face Death; Heal, Sojourn, whose
 *     treatment does): harm done now, in the present ("heat rakes your ribs";
 *     round 8's a40, a44, a46 — each price fell on the ship);
 *   - a refused Heal's [premise], "no wound is marked": any wound told
 *     ("starts on the cuts"; round 4's a62, a63).
 * Narrow by design: a wound from before, said in the past, and someone
 * else's harm break nothing. Pure.
 *
 * @param {string} body — the prose, its closing offer line left out
 * @param {Array<Object>} lines — the narration's obligation lines
 * @param {{ moveId?: string|null, moveIds?: string[] }} [ctx] — the move narrated; a round's, its moves
 * @returns {Array<{ tag: "sheet", quote: string, note: string }>}
 */
export function harmViolations(body, lines, { moveId = null, moveIds = [] } = {}) {
  const text = String(body ?? "");
  const all = Array.isArray(lines) ? lines : [];
  const noWound = all.some(o => o?.kind === "premise" && /no wound is marked/.test(String(o.text ?? "")));
  const moves = [moveId, ...(Array.isArray(moveIds) ? moveIds : [])];
  const beat = all.some(o => o?.kind === "sheet") && !moves.some(m => WOUND_MOVES.has(m))
    && !all.some(o => o?.list === "TELL" && HEALTH_TOLD.test(String(o.text ?? "")));
  const found = (noWound ? [HARM_DONE, HARM_CARRIED, WOUND_TOLD] : beat ? [HARM_DONE, HARM_CARRIED] : [])
    .map(re => re.exec(text)).find(Boolean);
  if (!found) return [];
  return [{ tag: "sheet", quote: quoteAround(text, found.index, found[0].length),
    note: noWound ? "the sheet holds no wound: tell none" : "the sheet took no health on this beat: tell no harm done to you" }];
}

/**
 * The certain checks, by kind (issue #399, D4) — each the certain-class
 * kind's check, run on the first line of its kind, in this order. Each reads
 * the prose's body: the closing offer line is the rules' own, never a breach
 * (D1; [here] once read it, so an offer to fly somewhere re-asked as a
 * flight). [here] reads the fact block too.
 */
export const CERTAIN_CHECKS = Object.freeze({
  // [here]: the fact block's frame, its present, and the prose, against the
  // record's place (CHARACTERS-MOVED-BY-THE-NARRATION, round 7).
  here: (body, sidecar, o) => hereViolations(body, sidecar, o),
  // [arrival]: a journey's arrival, its present alone — whoever was not with
  // the characters as they set out is not waiting there (PEOPLE-WAITING-AT-THE-ARRIVAL).
  arrival: (body, sidecar, o) => hereViolations(body, sidecar, { ...o, places: [] }).map(v => ({ ...v, tag: "arrival" })),
  apparatus: (body) => apparatusViolations(body),
  match: (body) => {
    const m = /\bmatch(?:es|ed)?\b/i.exec(body);
    return m ? [{ tag: "match", quote: quoteAround(body, m.index, m[0].length) }] : [];
  },
  material: (body, _sidecar, o) => materialViolations(body, o),
  person: (body, _sidecar, o) => personViolations(body, o),
  // [quote]: a line of speech an earlier narration of the session already
  // gave (THE-REFRAINS-THE-LIST-CANNOT-NAME, round 8: a92 said a84's line again).
  quote: (body, _sidecar, o) => {
    const said = new Set(Array.isArray(o.quotes) ? o.quotes : []);
    const again = quotedLinesOf(body).find(q => said.has(q));
    return again ? [{ tag: "quote", quote: again, note: "an earlier narration of this session already gave this line, word for word — say it new, or let it go unsaid" }] : [];
  },
  // [sheet]: its harm clause — bodily harm said of "you" where the sheet took
  // no health (issue #399 D9, HARM-TOLD-WITHOUT-A-COST). The rest of the line
  // (supplies, repairs, bonds) is told, not held.
  sheet: (body, _sidecar, _o, { lines, ctx }) => harmViolations(body, lines, ctx),
});

/**
 * The certain checks (CERTAIN_CHECKS): each certain-class kind among the
 * obligations, its first line, on the prose's body.
 *
 * @param {string} prose
 * @param {Array<{ kind: string }>} obligations
 * @param {{ sidecar?: Object|null, ctx?: Object }} [opts] — the reply's fact block ([here], [arrival]); the check's context ([sheet]: the move)
 * @returns {Array<{ tag: string, quote: string, note?: string }>}
 */
export function certainViolations(prose, obligations, { sidecar = null, ctx = {} } = {}) {
  const lines = Array.isArray(obligations) ? obligations : [];
  const body = bodyOf(String(prose ?? ""));
  const out = [];
  for (const [kind, check] of Object.entries(CERTAIN_CHECKS)) {
    if (checkClassOf(kind) !== "certain") continue;
    const o = lines.find(l => l?.kind === kind);
    if (o) out.push(...check(body, sidecar, o, { lines, ctx: ctx ?? {} }));
  }
  return out;
}

/**
 * [person]: a second-person set-piece that calls its character by name
 * outside quoted speech (issue #389 #4, OPENING-IN-THE-THIRD-PERSON — "Mira is
 * counting the water ration for the third time", a52). A name in double
 * quotes is a speaker's, and stays. One violation at most.
 *
 * @param {string} body — the prose, its closing offer line left out
 * @param {{ names?: string[] }} person — the character's full and first name
 * @returns {Array<{ tag: "person", quote: string }>}
 */
export function personViolations(body, { names = [] } = {}) {
  const text = String(body ?? "");
  // Quoted speech blanked to its length, so an index still points into the prose.
  const told = text.replace(/"[^"\n]*"|“[^”\n]*”/g, (q) => " ".repeat(q.length));
  for (const raw of names ?? []) {
    const name = String(raw ?? "").trim();
    if (name.length < 2) continue;
    const m = new RegExp(`(?<![A-Za-z])${escapeRe(name)}(?![A-Za-z])`).exec(told);
    if (m) return [{ tag: "person", quote: quoteAround(text, m.index, m[0].length) }];
  }
  return [];
}

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const capitalised = (w) => w.charAt(0).toUpperCase() + w.slice(1);

// ─────────────────────────────────────────────────────────────────────────────
// [here] — where the characters are, by the record
// ─────────────────────────────────────────────────────────────────────────────

const cleanText = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** A place name's trailing words too common to be said with it ("Bleakhold Station" is told "Bleakhold"). */
const PLACE_SUFFIXES = new Set(["station", "port", "outpost", "base", "colony", "hub", "city", "town", "habitat", "settlement", "depot"]);

/** A place's name, and its core when a trailing word is generic ("Bleakhold Station" → "Bleakhold"). */
function placeForms(name) {
  const full = cleanText(name);
  if (!full) return [];
  const words = full.split(" ");
  while (words.length > 1 && PLACE_SUFFIXES.has(words.at(-1).toLowerCase())) words.pop();
  const core = words.join(" ");
  return core !== full && core.length >= 4 ? [full, core] : [full];
}

/**
 * The first place of `places` a text names, by its name or its core, as whole
 * words — written as a name is, with its capitals: a planet called Haven is
 * not "a safe haven".
 */
function placeIn(text, places) {
  const t = String(text ?? "");
  for (const p of places ?? []) {
    for (const form of placeForms(p?.name)) {
      const m = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(form)}(?![\\p{L}\\p{N}])`, "u").exec(t);
      if (m) return { place: p, index: m.index, form };
    }
  }
  return null;
}

/** Whether a person's name is said in a text — the whole name, or (unless `exact`, a person not yet on record) a word of it of three letters or more (nameMatch.js personSaidIn, the one matcher). */
function personIn(text, name, exact = false) {
  return personSaidIn(text, name, { exact });
}

// The characters reaching a place, in the prose: a verb of arriving or going
// there, then (within a clause) a preposition and the place — or "reach" and
// the place — said of "you", "your …" or their craft; or a sentence opened by
// the going itself ("The walk to the Hollow Spire docks takes …", round 6's
// a64). A sentence of what could or would happen moves no one.
const MOTION = String.raw`(?:arriv(?:e|es|ed|ing)|land(?:s|ed|ing)?|dock(?:s|ed|ing)?|touch(?:es|ed|ing)? down|set(?:s|ting)? down|`
  + String.raw`nos(?:e|es|ed|ing) (?:down|in)|descend(?:s|ed|ing)?|fl(?:y|ies|ew|ying)|walk(?:s|ed|ing)?|cross(?:es|ed|ing)?|`
  + String.raw`r(?:ide|ides|ode|iding)|pull(?:s|ed|ing)? in|head(?:s|ed|ing)? (?:back|down|in)|return(?:s|ed|ing)?|go(?:es)? back|went back)`;
const GOING_NOUN = String.raw`(?:walk|trip|hop|flight|ride|crossing|journey|run|drop)`;
const NOT_DONE = /\b(?:could|would|might|may|can|should|shall|will|if|unless|whether|until)\b|['’]ll\b/i;
/** A frame's words for a place it is away from or bound for, just before the place's name. */
const AWAY_FROM = /\b(?:from|toward|towards|for|beyond|past|leaving|behind|away from|out of|en route to)\s+(?:the\s+)?$/i;
const CRAFT = /\b(?:you|your|yours|skiff|shuttle|lander|launch|pod)\b/i;

/** The sentences of a narration's prose, quoted speech blanked (a speaker may talk of going anywhere). */
function toldSentences(prose) {
  const told = String(prose ?? "").replace(/"[^"\n]*"|“[^”\n]*”/g, (q) => " ".repeat(q.length));
  return told.split(/(?<=[.!?…])\s+/).map(s => s.trim()).filter(Boolean);
}

/**
 * [here]: does the narration put the characters at another place than the
 * record's (CHARACTERS-MOVED-BY-THE-NARRATION — the seventh live round's a60:
 * the line "I fly the Kobayashi IV's skiff to her stall" named no one, and the
 * prose flew Mira to Hollow Spire while the record had her at Bleakhold
 * Station)? Three readings, each certain:
 *   - the fact block's frame: its "location" names another recorded place
 *     (and not the characters' own);
 *   - its "present": a person the record has at another place, in person —
 *     one heard over a comm goes under "remote";
 *   - the prose: a sentence takes "you" or their craft to another place.
 * Between places (on an expedition), any recorded place is another. One
 * violation a reading, each with a note for the re-ask.
 *
 * @param {string} prose — the narration's prose
 * @param {Object|null} sidecar — its fact block (sidecarParser.extractSidecar)
 * @param {{ hereName?: string|null, here?: string|null, underway?: string|null, places?: Array<{ id?: string, name: string }>,
 *   people?: Array<{ name: string, where: string }>, markers?: string[] }} o — the [here] line and its data
 * @returns {Array<{ tag: "here", quote: string, note: string, placeId?: string|null, placeName?: string }>}
 */
export function hereViolations(prose, sidecar, o) {
  const out = [];
  const here = cleanText(o?.here);
  const places = (Array.isArray(o?.places) ? o.places : []).filter(p => cleanText(p?.name));
  const at = here ? `at ${here}` : "between places";
  const going = (p) => `the characters are ${at}: ${p.name} is reached only by a journey's move — when the line seeks it, `
    + "tell them making ready to go, and stop there";
  // The frame's where.
  const frame = sidecar?.sceneFrame ?? null;
  const location = cleanText(frame?.location);
  if (location && places.length && !(here && placeIn(location, [{ name: here }]))) {
    const hit = placeIn(location, places);
    // A place the frame is away from, or bound for, is not where it puts them:
    // "the cockpit, a day out from Hollow Spire".
    const away = hit && AWAY_FROM.test(location.slice(0, hit.index));
    if (hit && !away) out.push({ tag: "here", quote: location, note: `the fact block's "location" puts them at ${hit.place.name}; ${going(hit.place)}`,
      placeId: hit.place.id ?? null, placeName: hit.place.name });
  }
  // Who is present in person.
  const remote = Array.isArray(frame?.remote) ? frame.remote : [];
  for (const entry of Array.isArray(frame?.present) ? frame.present : []) {
    const person = (Array.isArray(o?.people) ? o.people : []).find(p => cleanText(p?.name) && personIn(entry, p.name, p.exact === true));
    if (!person || remote.some(r => personIn(r, person.name, person.exact === true))) continue;
    out.push({ tag: "here", quote: cleanText(entry),
      note: `${person.name} is ${cleanText(person.where) || "elsewhere"}, not here: one heard over a comm goes under "remote", never "present" — `
        + "or leave them out" });
    break;
  }
  // The prose.
  if (places.length) {
    const craft = (Array.isArray(o?.markers) ? o.markers : []).map(cleanText).filter(m => m.length >= 3);
    const craftRe = craft.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${craft.map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`, "iu") : null;
    for (const s of toldSentences(prose)) {
      if (NOT_DONE.test(s)) continue;
      const hit = placeIn(s, places);
      if (!hit || (here && placeIn(s, [{ name: here }]))) continue;
      const before = s.slice(0, hit.index);
      const reaching = new RegExp(`\\b${MOTION}\\b[^.!?]{0,48}?\\b(?:to|toward|towards|into|onto|at|on|in)\\s+(?:the\\s+)?$`, "i").test(before)
        || /\breach(?:es|ed|ing)?\s+(?:the\s+)?$/i.test(before);
      const opened = new RegExp(`^(?:the\\s+)?${GOING_NOUN}\\s+(?:back\\s+|down\\s+|over\\s+|across\\s+)?to\\s+(?:the\\s+)?$`, "i").test(before);
      if (opened || (reaching && (CRAFT.test(s) || craftRe?.test(s)))) {
        out.push({ tag: "here", quote: s.slice(0, 200), note: `the prose takes them to ${hit.place.name}; ${going(hit.place)}`,
          placeId: hit.place.id ?? null, placeName: hit.place.name });
        break;
      }
    }
  }
  return out;
}

/**
 * [material]: a set-piece's rolled word written as it was rolled (issue #388
 * #11, ORACLE-WORD-WRITTEN-AS-ROLLED) — as a label (a sentence opened by the
 * word and set off by a comma, a colon or a dash, or the word alone in quotes:
 * "Fortify, in the plainest sense"), as a name (the word with a capital in
 * mid-sentence — "who on this ring served the Dominion" — unless the records
 * hold it so, `onRecord`), or a result's words together ("a fiery gas"). The
 * word in an ordinary sentence ("a vial of her blood") is the prose's: only
 * these three are certain. One violation a word.
 *
 * @param {string} body — the prose, its closing offer line left out
 * @param {{ words?: string[], pairs?: string[][], onRecord?: string[] }} material
 * @returns {Array<{ tag: "material", quote: string }>}
 */
export function materialViolations(body, { words = [], pairs = [], onRecord = [] } = {}) {
  const text = String(body ?? "");
  const out = [];
  const seen = new Set();
  const push = (m, word) => {
    if (!m || seen.has(word.toLowerCase())) return;
    seen.add(word.toLowerCase());
    out.push({ tag: "material", quote: quoteAround(text, m.index, m[0].length) });
  };
  const named = new Set((onRecord ?? []).map(w => String(w).toLowerCase()));
  for (const raw of words ?? []) {
    const word = String(raw ?? "").trim();
    if (word.length < 3) continue;
    const w = escapeRe(word);
    const label = new RegExp(`(?:^|[.!?…]["”’)]*\\s+)${w}\\s*(?:[,:;—–]|-\\s)|["“‘*_]${w}["”’*_]`, "i").exec(text);
    if (label) { push(label, word); continue; }
    if (named.has(word.toLowerCase())) continue;
    push(new RegExp(`(?<=[a-z0-9,;'’)]\\s{1,3})${escapeRe(capitalised(word))}(?![A-Za-z])`).exec(text), word);
  }
  for (const pair of pairs ?? []) {
    const parts = (Array.isArray(pair) ? pair : []).map(p => String(p ?? "").trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const m = new RegExp(`(?<![A-Za-z])${parts.map(escapeRe).join("[\\s-]+")}(?![A-Za-z])`, "i").exec(text);
    if (m && !seen.has(parts.join(" ").toLowerCase())) {
      seen.add(parts.join(" ").toLowerCase());
      out.push({ tag: "material", quote: quoteAround(text, m.index, m[0].length) });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Floor
// ─────────────────────────────────────────────────────────────────────────────

const STOP = new Set(["the", "and", "who", "what", "find", "from", "with", "that", "this", "into", "their", "them", "they", "for", "out", "about"]);
const contentWords = (s) => String(s ?? "").toLowerCase().split(/[^a-z0-9'’-]+/).filter(w => w.length >= 4 && !STOP.has(w));
const STILL_UNKNOWN = /\b(?:not|no one|nobody)\s+(?:yet\s+)?(?:know|knows|known|named|name)\b|\bstill\s+(?:unknown|unnamed)\b/i;

/** The meters a cost may take from, and the words a narration of it has. */
const METER_WORDS = Object.freeze({
  momentum: ["ground", "time", "delay", "behind", "slow", "lost", "momentum"],
  health:   ["hurt", "wound", "pain", "blood", "bruise", "cut", "ache"],
  spirit:   ["fear", "dread", "nerve", "shaking", "despair", "doubt", "spirit"],
  supply:   ["stores", "rations", "fuel", "spent", "short", "supplies", "used"],
});

/** The last `n` sentences of a narration's body (its closing offer line left out). */
function lastSentences(prose, n) {
  const sentences = bodyOf(prose).split(/(?<=[.!?…]["”’)]?)\s+/).map(s => s.trim()).filter(Boolean);
  return sentences.slice(-n).join(" ");
}

/** A cost's meters, by the words of its line ([chosen], [chosen-since]). */
function costMeterWords(text) {
  const meters = Object.keys(METER_WORDS).filter(m => new RegExp(`\\b${m}\\b|${m === "supply" ? "resources" : m === "health" ? "harm" : m === "spirit" ? "stress" : "momentum"}`, "i").test(text));
  return meters.flatMap(m => METER_WORDS[m]);
}

/** A chosen cost told: a word of its meter in the narration ([chosen], [chosen-since] — logged). */
const costTold = (body, o) => {
  const words = costMeterWords(o.text);
  const text = body.toLowerCase();
  return words.length && !words.some(w => text.includes(w)) ? [{ tag: o.kind, quote: "" }] : [];
};

/**
 * The floor checks, by kind (issue #399, D4) — each floor-class kind's
 * lexical minimum and what a miss does: `reask` once, or `logged`. Each reads
 * the prose's body, the closing offer line left out (D1).
 */
export const FLOOR_CHECKS = Object.freeze({
  // A word of the vow's name, by its stem (its first four letters —
  // "raiding" is told as "raiders"), or what is still not known.
  vow: Object.freeze({ action: "reask", check: (body, o, { vowName = null } = {}) => {
    const stems = contentWords(o.vowName ?? vowName).map(w => w.slice(0, 4));
    const said = new Set(contentWords(body).map(w => w.slice(0, 4)));
    return stems.length && !stems.some(w => said.has(w)) && !STILL_UNKNOWN.test(body) ? [{ tag: "vow", quote: "" }] : [];
  } }),
  chosen: Object.freeze({ action: "logged", check: (body, o) => costTold(body, o) }),
  // A cost chosen since the last narration (D10): told as [chosen] is. Its
  // row declared it floor, and nothing held it to one (issue #399's audit).
  "chosen-since": Object.freeze({ action: "logged", check: (body, o) => costTold(body, o) }),
  // Ended on what play let go (overhaul 2 §7.3, §10.3): a stem of its
  // question in the last two sentences. A player's line that names the
  // question — any of its stems — takes it up, and the narration may end
  // on it ("I look up at the amber light": the second amber light above
  // the stall may blink); provenance.js touchesLetGo stays per stem for
  // the frame's own lines.
  letgo: Object.freeze({ action: "logged", check: (body, o, { line = "" } = {}) => {
    if (!o.letGo) return [];
    const said = tellingStems(line);
    const takenUp = (o.letGo.stems ?? []).some(st => said.has(st));
    const ending = lastSentences(body, 2);
    return !takenUp && touchesLetGo(ending, line, [o.letGo]) ? [{ tag: "letgo", quote: ending.slice(0, 200) }] : [];
  } }),
});

/**
 * The floor checks (FLOOR_CHECKS): every floor-class line, on the prose's
 * body — a miss re-asked or logged, as its kind's check says.
 *
 * @param {string} prose
 * @param {Array<Object>} obligations
 * @param {{ vowName?: string|null, line?: string }} [ctx] — `line`: the beat's player words ([letgo])
 * @returns {{ reask: Array<{ tag: string, quote: string }>, logged: Array<{ tag: string, quote: string }> }}
 */
export function floorViolations(prose, obligations, ctx = {}) {
  const body = bodyOf(String(prose ?? ""));
  const reask = [];
  const logged = [];
  for (const o of obligations ?? []) {
    const floor = checkClassOf(o?.kind) === "floor" ? FLOOR_CHECKS[o.kind] : null;
    if (!floor) continue;
    (floor.action === "reask" ? reask : logged).push(...floor.check(body, o, ctx ?? {}));
  }
  return { reask, logged };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tripwires → the judge
// ─────────────────────────────────────────────────────────────────────────────

const FIGHT_WORDS = ["fire", "fires", "fired", "shot", "shoots", "salvo", "strike", "strikes", "struck", "blow", "lance", "rake", "slash", "lands", "hit", "hits"];
// A fight told as over before Take Decisive Action ([foe] — FIGHT-PAST-ITS-END: "drifting dead and hurt", "a dead thing
// with no guns left", the cutter's "hulk", round 8's a38–a43).
const FOE_DOWN_WORDS = ["dead", "dies", "died", "dying", "killed", "kills", "destroyed", "destroy", "destroys", "wreck", "wrecked", "wreckage",
  "hulk", "fled", "flee", "flees", "retreat", "retreats", "retreated", "surrender", "surrenders", "surrendered", "beaten", "defeated",
  "finished", "explode", "explodes", "exploded", "explosion", "crippled"];
const HEAL_WORDS  = ["cut", "cuts", "gash", "wound", "wounds", "blood", "bandage", "dressing", "stitch", "antiseptic", "medkit", "sealant", "binding"];
const PREMISE_WORDS = Object.freeze({
  "recoverable-health": HEAL_WORDS,
  "recoverable-spirit": ["calm", "steadies", "eases", "comfort", "nerve", "fear"],
  "recoverable-supply": ["restock", "restocked", "supplies", "rations", "provisions", "stores"],
  "something-damaged":  ["patched", "repaired", "fixed", "welded", "sealed", "replaced"],
  "open-fight":         FIGHT_WORDS,
  "their-connection":   ["bond", "bonded", "connection", "trust"],
});
/** Speech, said or told — what trips [unsaid] (a move pressed on a card gives the character no words). */
const SPEECH_WORDS = ["tell", "tells", "told", "say", "says", "said", "ask", "asks", "asked", "promise", "promises", "promised",
  "admit", "admits", "confess", "confesses", "swear", "swears", "explain", "explains", "answer", "answers", "reply", "replies",
  "assure", "assures", "whisper", "whispers", "murmur", "murmurs", "insist", "insists"];

/**
 * The words that trip each judge-class kind's line, by what it tells — null
 * for a line with none (issue #399, D4: one entry for each kind its row
 * declares judge-class, and no other).
 */
export const TRIPWIRES = Object.freeze({
  premise: (o, { refusalCode = null } = {}) => PREMISE_WORDS[o.refusalCode ?? refusalCode] ?? null,
  fight:   () => FIGHT_WORDS,
  foe:     () => FOE_DOWN_WORDS,
  cost:    (o) => Object.entries(METER_WORDS).filter(([m]) => new RegExp(m === "supply" ? "supply|resources" : m === "health" ? "health|harm" : m === "spirit" ? "spirit|stress" : m, "i").test(o.text)).flatMap(([, w]) => w),
  price:   (o) => contentWords(o.text.replace(/^THE PRICE[^.]*\.\s*/, "")).slice(0, 12),
  oracle:  (o, { question = "" } = {}) => (o.list === "NOT SO" ? contentWords(question) : null),
  unsaid:  () => SPEECH_WORDS,
  whereabouts: (o) => (Array.isArray(o.words) && o.words.length ? o.words : null),
});

/** The words that trip a line's judge: its kind's TRIPWIRES, for a judge-class line; null for any other. */
function tripWords(o, ctx = {}) {
  if (checkClassOf(o?.kind) !== "judge") return null;
  const words = TRIPWIRES[o.kind];
  return typeof words === "function" ? words(o, ctx) : null;
}

/**
 * The NOT YET and NOT SO lines whose tripwire words appear in the prose.
 *
 * @param {string} prose
 * @param {Array<Object>} obligations
 * @param {{ refusalCode?: string|null, question?: string }} [ctx]
 * @returns {Array<Object>} the tripped obligations
 */
export function trippedLines(prose, obligations, ctx = {}) {
  const words = String(prose ?? "").toLowerCase().split(/[^a-z0-9'’-]+/).filter(Boolean);
  // A possessive's word is said too: "the hulk's guns" says "hulk" (issue #397, Code fix 4).
  const said = new Set(words.flatMap(w => { const bare = w.replace(/['’]s$/, ""); return bare && bare !== w ? [w, bare] : [w]; }));
  return (obligations ?? []).filter((o) => {
    if (o?.list !== "NOT YET" && o?.list !== "NOT SO") return false;
    const trip = tripWords(o, ctx);
    if (!Array.isArray(trip) || !trip.length) return false;
    return trip.some(w => said.has(w));
  });
}

/**
 * How a tripped line is put to a judge (issue #399; the audit's N1): a line
 * with a judge sentence is the breach itself — "BREACH", the narration
 * breaks it by doing what it says — and any other is its narrator list. Round
 * 9's [dice] sentence went out as "(NOT SO) The dice decided this: …" under
 * the rule "telling it as true breaks it", which read the fact as the breach.
 *
 * @param {Object} o — an obligation line
 * @returns {{ mark: string, words: string }}
 */
export function judgedLine(o) {
  return typeof o?.judge === "string" && o.judge.trim()
    ? { mark: "BREACH", words: o.judge.trim() }
    : { mark: String(o?.list ?? "NOT SO"), words: String(o?.text ?? "").trim() };
}

/**
 * What the narration's lines mean to a judge, said once for both passes
 * (the audit's N2: the audit lacked the rule on what merely might happen).
 */
export const JUDGED_LINES_RULE = "A BREACH line describes a breach: the narration breaks it when it does what the line says. "
  + "A NOT YET line names something the table has not decided; telling it as done breaks it. A NOT SO line names something "
  + "that is not true; telling it as true breaks it. A TELL line names what has happened; leaving it untold breaks it. Read "
  + "only what the narration says happens — a thing about to happen, feared, offered or merely possible breaks nothing.";

/** A quote's words, compared loosely: case, emphasis, curly quotes and spacing aside. */
const looseWords = (s) => String(s ?? "").toLowerCase().replace(/[*_]/g, "").replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
  .replace(/\s+/g, " ").trim();

/**
 * Whether a judge's quote is the narration's own words (D3): each part of it
 * between ellipses is in the text, in order. A quote of what the judged view
 * took off — the offer line, the fact block — or a paraphrase is not.
 *
 * @param {string} text — the judged view
 * @param {string} quote
 * @returns {boolean}
 */
export function quoteInNarration(text, quote) {
  const told = looseWords(text);
  const parts = looseWords(quote).split(/\s*(?:…|\.\.\.)\s*/)
    .map(p => p.replace(/^["'\s.,;:!?-]+|["'\s.,;:!?-]+$/g, "")).filter(p => p.length > 0);
  if (!parts.length) return false;
  let from = 0;
  for (const part of parts) {
    const at = told.indexOf(part, from);
    if (at < 0) return false;
    from = at + part.length;
  }
  return true;
}

/**
 * A judge's answer read against the lines it was asked about (D3): each
 * violation names its line by number — or, the old form, by a tag that is
 * exactly one line's kind — and quotes the narration. One that names no line
 * or quotes words the judged view does not hold is dropped, with why.
 *
 * @param {Array} answered — the answer's `violations`
 * @param {Array<Object>} lines — the lines asked about, in their numbered order
 * @param {string} text — the judged view
 * @returns {{ violations: Array<{ tag: string, line: number, quote: string, text: string }>,
 *   dropped: Array<{ tag?: string, line?: number, quote: string, why: string }> }}
 */
export function verdictsByLine(answered, lines, text) {
  const violations = [];
  const dropped = [];
  for (const v of Array.isArray(answered) ? answered : []) {
    if (!v || typeof v !== "object") continue;
    const quote = String(v.quote ?? "").slice(0, 200);
    const n = Number.isInteger(v.line) ? v.line : (/^\s*\d+\s*$/.test(String(v.line ?? "")) ? Number(v.line) : null);
    let index = n !== null && n >= 1 && n <= lines.length ? n - 1 : -1;
    if (index < 0 && n === null && v.tag != null) {
      const kind = String(v.tag).trim().replace(/^\[|\]$/g, "");
      const same = lines.flatMap((o, i) => (o?.kind === kind ? [i] : []));
      if (same.length === 1) index = same[0];
    }
    if (index < 0) {
      dropped.push({ ...(n !== null ? { line: n } : {}), ...(v.tag != null ? { tag: String(v.tag).slice(0, 80) } : {}), quote, why: "names no line" });
      continue;
    }
    const o = lines[index];
    if (!quoteInNarration(text, quote)) {
      dropped.push({ tag: o.kind, line: index + 1, quote, why: "not in the narration" });
      continue;
    }
    violations.push({ tag: o.kind, line: index + 1, quote, text: o.text });
  }
  return { violations, dropped };
}

/** The first JSON object in a reply, or null: a reply cut off or not JSON parses to nothing. */
function firstJsonObject(text) {
  const json = /\{[\s\S]*\}/.exec(String(text ?? ""))?.[0];
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

/**
 * One small model call: does the narration break any tripped line? Its lines
 * are numbered and it answers by number with the narration's own words (D3),
 * each line put as a breach where it has a judge sentence (judgedLine). It
 * reads the judged view (D1). Fail-open: an error, a timeout
 * (JUDGE_TIMEOUT_MS), a refusal or an answer that does not parse is no
 * violation — `judged: false`, with `error` saying which ("timeout",
 * "refused", "cut off at its token cap", "unparsed", "error: …", "no key").
 *
 * @param {string} prose
 * @param {Array<Object>} tripped
 * @param {{ apiKey: string|null }} opts
 * @returns {Promise<{ violations: Array<{ tag: string, line: number, quote: string, text: string }>,
 *   dropped: Array<Object>, judged: boolean, error: string|null }>}
 */
export async function judgeNarration(prose, tripped, { apiKey } = {}) {
  if (!tripped?.length) return { violations: [], dropped: [], judged: false, error: null };
  if (!apiKey) return { violations: [], dropped: [], judged: false, error: "no key" };
  const lines = tripped.map((o, i) => { const l = judgedLine(o); return `${i + 1}. [${o.kind}] ${l.mark}: ${l.words}`; }).join("\n");
  const system = `You check a short piece of game narration against numbered lines. ${JUDGED_LINES_RULE} `
    + "Answer with JSON only: {\"violations\":[{\"line\":<the line's number>,\"quote\":\"<the narration's words that break it, copied exactly>\"}]} "
    + "— an empty list when nothing breaks.";
  // The judged view (D1): the closing offer line is the rules' own, never a breach.
  const view = judgedView(prose);
  const body = {
    model: JUDGE_MODEL, max_tokens: JUDGE_MAX_TOKENS, system,
    messages: [{ role: "user", content: `LINES:\n${lines}\n\nNARRATION:\n"""${view.text.slice(0, 4000)}"""` }],
  };
  const headers = { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
  let timer = null;
  const unjudged = (error) => {
    console.warn(`${MODULE_ID} | obligation judge: no verdict (${error}) — the narration passes as written.`);
    return { violations: [], dropped: [], judged: false, error };
  };
  try {
    const data = await Promise.race([
      apiPost(ANTHROPIC_URL, headers, body, { label: "obligationJudge" }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("the judge timed out")), JUDGE_TIMEOUT_MS); }),
    ]);
    const text = (data?.content ?? []).filter(b => b?.type === "text").map(b => b.text).join("");
    const parsed = firstJsonObject(text);
    if (!parsed || !Array.isArray(parsed.violations)) {
      return unjudged(data?.stop_reason === "max_tokens" ? "cut off at its token cap" : data?.stop_reason === "refusal" ? "refused" : "unparsed");
    }
    return { ...verdictsByLine(parsed.violations, tripped, view.text), judged: true, error: null };
  } catch (err) {
    const message = String(err?.message ?? err);
    return unjudged(message === "the judge timed out" ? "timeout" : `error: ${message}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The re-ask's addendum to the user message: the draft, not posted, and the
 * lines it broke — each line once, in its own words (a judge's verdict
 * carries its line's `text`; a certain or floor breach is its kind's first
 * line, the one the check read), with every quote of it (the audit's N11:
 * one quote a kind, with that kind's last line, went out).
 *
 * @param {string} draft
 * @param {Array<{ tag: string, quote?: string, note?: string, text?: string }>} violations
 * @param {Array<Object>} obligations
 * @returns {string}
 */
export function redraftBlock(draft, violations, obligations) {
  const firstOf = new Map();
  for (const o of obligations ?? []) if (o?.kind && !firstOf.has(o.kind)) firstOf.set(o.kind, o);
  const groups = new Map();
  for (const v of violations ?? []) {
    const text = typeof v?.text === "string" ? v.text : (firstOf.get(v?.tag)?.text ?? "");
    const key = `${v?.tag}\u0000${text}`;
    if (!groups.has(key)) groups.set(key, { tag: v?.tag, text, quotes: [], notes: [] });
    const g = groups.get(key);
    if (v?.quote && !g.quotes.includes(v.quote)) g.quotes.push(v.quote);
    // What a certain check found, in its own words ([here]: what the frame,
    // the present or the prose said, and what the record says instead).
    if (v?.note && !g.notes.includes(v.note)) g.notes.push(v.note);
  }
  const broke = [...groups.values()].map(g => `- [${g.tag}] ${g.text}`
    + `${g.quotes.length ? ` (it says: ${g.quotes.map(q => `"${q}"`).join("; ")})` : ""}`
    + `${g.notes.length ? ` — ${g.notes.join("; ")}.` : ""}`);
  return `## YOUR DRAFT — NOT POSTED\n"${String(draft ?? "").trim()}"\n\nThis breaks:\n${broke.join("\n")}\n`
    + "Write the narration again; keep everything else.";
}

/** A reply's checks in code — certain and floor — for one draft: what re-asks, and what is logged. */
function codeChecks(prose, sidecar, obligations, ctx, draft) {
  const floor = floorViolations(prose, obligations, ctx);
  return {
    broken: [...certainViolations(prose, obligations, { sidecar, ctx }).map(v => ({ ...v, class: "certain", draft })),
      ...floor.reask.map(v => ({ ...v, class: "floor", draft }))],
    logged: floor.logged.map(v => ({ ...v, class: "floor", action: "logged", draft })),
  };
}

/**
 * Call the narrator, check its reply against the obligations, and on a failure
 * ask once more. `call(addendum)` makes the narrator call — with `addendum`
 * (the re-ask's block) appended to its user message when given — and returns
 * the raw reply (prose and fact block). Only the reply returned is the one
 * whose fact block is applied. A re-ask that throws (a rate limit, a dropped
 * connection), or that comes back with no prose — a fact block alone is no
 * narration — keeps the first draft: it was a narration, and only its check
 * failed.
 *
 * Every verdict is a row of `verdicts`, marked with the draft it describes
 * (`draft` 1 or 2); a judge's call is one summary row and one row a
 * violation or a dropped one. `stopped()` is the caller's own discard test
 * (an X-Card played, a round taken over, a dropped connection — the audit's
 * N14): once it is true no judge is called and `onVerdict` is not told, as
 * the caller posts nothing of this narration.
 *
 * @param {(addendum: string|null) => Promise<string|null>} call
 * @param {Array<Object>} obligations
 * @param {{ apiKey?: string|null, judge?: boolean, ctx?: Object, onVerdict?: Function, stopped?: Function }} [opts]
 * @returns {Promise<{ raw: string|null, reasked: boolean, verdicts: Array<Object>, stillBroken: Array<Object> }>}
 */
export async function narrateKeepingObligations(call, obligations, { apiKey = null, judge = true, ctx = {}, onVerdict = null, stopped = null } = {}) {
  const halted = () => { try { return typeof stopped === "function" && stopped() === true; } catch { return false; } };
  const tell = (v) => { if (!halted() && (v.verdicts.length || v.stillBroken?.length)) onVerdict?.(v); };
  const raw = await call(null);
  const verdicts = [];
  if (typeof raw !== "string" || !raw.trim() || !Array.isArray(obligations) || !obligations.length) {
    return { raw, reasked: false, verdicts, stillBroken: [] };
  }
  const first = extractSidecar(raw);
  const prose = first.prose ?? raw;
  const firstChecks = codeChecks(prose, first.sidecar, obligations, ctx, 1);
  verdicts.push(...firstChecks.logged);
  let broken = firstChecks.broken;
  if (!broken.length && judge && !halted()) {
    // The trip words are read in the judged view too (D1): an offer line's
    // move name ("…would be a Forge a Bond") trips nothing.
    const tripped = trippedLines(judgedView(prose).text, obligations, ctx);
    if (tripped.length) {
      const verdict = await judgeNarration(prose, tripped, { apiKey });
      verdicts.push({ class: "judge", draft: 1, tripped: tripped.map(o => o.kind), judged: verdict.judged, error: verdict.error ?? null });
      for (const d of verdict.dropped ?? []) verdicts.push({ ...d, class: "judge", action: "dropped", draft: 1 });
      // Authority follows the measure (issue #399, D7): a verdict on a kind
      // that has not passed is logged and counted, and the first draft posts.
      // Round 9's four re-asks were all on wrong verdicts, and a redraft is
      // posted unjudged ("…would be a Forge a Bond, if you press it").
      const acts = (v) => judgeMayAct(v.tag, "judge");
      for (const v of verdict.violations.filter(x => !acts(x))) {
        verdicts.push({ class: "judge", draft: 1, tag: v.tag, line: v.line, quote: v.quote, action: "logged" });
      }
      broken = verdict.violations.filter(acts).map(v => ({ ...v, class: "judge", draft: 1 }));
    }
  }
  if (!broken.length) {
    tell({ verdicts, reasked: false });
    return { raw, reasked: false, verdicts, stillBroken: [] };
  }
  verdicts.push(...broken.map(({ text: _text, ...v }) => ({ ...v, action: "reask" })));
  let again = null;
  try {
    again = await call(redraftBlock(prose, broken, obligations));
  } catch (err) {
    console.warn(`${MODULE_ID} | obligations: the re-ask failed — the first draft stands:`, err?.message ?? err);
  }
  const second = typeof again === "string" ? extractSidecar(again) : null;
  const secondProse = second ? String(second.prose ?? again) : "";
  if (!secondProse.trim()) {
    // The re-ask failed, or gave no narration: the first draft stands, its breach logged.
    const stillBroken = broken.map(({ text: _text, ...v }) => v);
    tell({ verdicts, reasked: true, stillBroken });
    return { raw, reasked: true, verdicts, stillBroken };
  }
  // The redraft is held to the code's checks — the certain and the floor
  // (the audit's N9: it was held to the certain alone) — and posted whatever
  // they say; what it still breaks is reported, marked draft 2.
  const secondChecks = codeChecks(secondProse, second.sidecar, obligations, ctx, 2);
  verdicts.push(...secondChecks.logged);
  tell({ verdicts, reasked: true, stillBroken: secondChecks.broken });
  return { raw: again, reasked: true, verdicts, stillBroken: secondChecks.broken };
}
