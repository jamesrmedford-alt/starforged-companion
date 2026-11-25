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
 *             offer line; a sheet number), [match] (the word, for a roll that
 *             matched), [material] (a set-piece's rolled word as a label, a
 *             name or its pair — materialViolations) — a failure is re-asked
 *             once
 *   floor     a lexical minimum: [vow] (the prose shares a word with the
 *             vow's name, or says what is still not known — re-asked once);
 *             [chosen] (a word of the cost's meter — logged); [letgo] (a stem
 *             of the let-go question in the prose's last two sentences that
 *             the beat's player words do not hold — logged; overhaul 2 §10.3)
 *   judge     a NOT YET / NOT SO line whose tripwire words appear in the prose
 *             ([premise], [cost], [price], [fight], [offer], [oracle],
 *             [state], [unsaid] (speech words, on a move pressed on a card),
 *             and overhaul 2's [place]: "docked", "berth", "clamps"
 *             on the beat that opens a fight's scene while the ship's record
 *             has her docked): one small model call (Haiku, through
 *             api-proxy.js, label `obligationJudge`) asks whether the prose
 *             tells any tripped line as true — it reads a line's `judge` words
 *             where it has them — and a violation is re-asked once
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

const MODULE_ID = "starforged-companion";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const JUDGE_MODEL = "claude-haiku-5-5";
const JUDGE_MAX_TOKENS = 400;
/** A judge slower than this passes the narration as written. */
export const JUDGE_TIMEOUT_MS = 4000;

// ─────────────────────────────────────────────────────────────────────────────
// Certain
// ─────────────────────────────────────────────────────────────────────────────

const OUTCOME_NAME = /\b(?:strong|weak)[ -]hit\b/i;
const SHEET_NUMBER = /\b\d+\s+(?:health|spirit|supply|momentum|integrity)\b|[+−-]\d+\s+momentum\b/i;
// The narration speaking of its own build — the beat-shape hint read back as prose
// (proseVariety.js BEAT_SHAPES; NARRATION-WRITES-ITS-SHAPE-DIRECTIVE): "The first
// sentence should be about someone other than Ren: Vance, or Mira." opened a
// recorded round (the batch-round playthrough, 2026-11-25).
const SHAPE_ECHO = /\bfirst sentence\b|\bacting character\b/i;

/** The prose without its closing italic offer line (the one place a move may be named). */
function bodyOf(prose) {
  return String(prose ?? "").replace(/\s*[*_][^*_\n]{3,}[*_]\s*$/, "").trim();
}

/** Move display names of two words or more — a one-word name is an ordinary word (Strike, Heal, Compel). */
const MULTIWORD_MOVE_NAMES = Object.freeze(Object.keys(MOVES)
  .map(id => { try { return moveDisplayName(id); } catch { return null; } })
  .filter(n => typeof n === "string" && /\s/.test(n.trim())));

const quoteAround = (text, index, len) => text.slice(Math.max(0, index - 30), Math.min(text.length, index + len + 30)).trim();

/**
 * The certain checks: [apparatus] and [match].
 *
 * @param {string} prose
 * @param {Array<{ kind: string }>} obligations
 * @returns {Array<{ tag: string, quote: string }>}
 */
export function certainViolations(prose, obligations) {
  const kinds = new Set((obligations ?? []).map(o => o?.kind));
  const text = String(prose ?? "");
  const out = [];
  if (kinds.has("apparatus")) {
    const body = bodyOf(text);
    const outcome = OUTCOME_NAME.exec(body);
    if (outcome) out.push({ tag: "apparatus", quote: quoteAround(body, outcome.index, outcome[0].length) });
    const number = SHEET_NUMBER.exec(body);
    if (number) out.push({ tag: "apparatus", quote: quoteAround(body, number.index, number[0].length) });
    const shape = SHAPE_ECHO.exec(body);
    if (shape) out.push({ tag: "apparatus", quote: quoteAround(body, shape.index, shape[0].length) });
    for (const name of MULTIWORD_MOVE_NAMES) {
      const at = body.indexOf(name);
      if (at >= 0) { out.push({ tag: "apparatus", quote: quoteAround(body, at, name.length) }); break; }
    }
  }
  if (kinds.has("match")) {
    const m = /\bmatch(?:es|ed)?\b/i.exec(text);
    if (m) out.push({ tag: "match", quote: quoteAround(text, m.index, m[0].length) });
  }
  const material = (obligations ?? []).find(o => o?.kind === "material");
  if (material) out.push(...materialViolations(bodyOf(text), material));
  return out;
}

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const capitalised = (w) => w.charAt(0).toUpperCase() + w.slice(1);

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

/**
 * The floor checks: [vow] (re-asked), [chosen] and [letgo] (logged).
 *
 * @param {string} prose
 * @param {Array<Object>} obligations
 * @param {{ vowName?: string|null, line?: string }} [ctx] — `line`: the beat's player words ([letgo])
 * @returns {{ reask: Array<{ tag: string, quote: string }>, logged: Array<{ tag: string, quote: string }> }}
 */
export function floorViolations(prose, obligations, { vowName = null, line = "" } = {}) {
  const text = String(prose ?? "").toLowerCase();
  const reask = [];
  const logged = [];
  for (const o of obligations ?? []) {
    if (o?.kind === "vow") {
      // A word of the vow's name, by its stem (its first four letters —
      // "raiding" is told as "raiders"), or what is still not known.
      const stems = contentWords(vowName).map(w => w.slice(0, 4));
      const said = new Set(contentWords(text).map(w => w.slice(0, 4)));
      if (stems.length && !stems.some(w => said.has(w)) && !STILL_UNKNOWN.test(prose ?? "")) {
        reask.push({ tag: "vow", quote: "" });
      }
    } else if (o?.kind === "chosen") {
      const meters = Object.keys(METER_WORDS).filter(m => new RegExp(`\\b${m}\\b|${m === "supply" ? "resources" : m === "health" ? "harm" : m === "spirit" ? "stress" : "momentum"}`, "i").test(o.text));
      const words = meters.flatMap(m => METER_WORDS[m]);
      if (words.length && !words.some(w => text.includes(w))) logged.push({ tag: "chosen", quote: "" });
    } else if (o?.kind === "letgo" && o.letGo) {
      // Ended on what play let go (overhaul 2 §7.3, §10.3): a stem of its
      // question in the last two sentences. A player's line that names the
      // question — any of its stems — takes it up, and the narration may end
      // on it ("I look up at the amber light": the second amber light above
      // the stall may blink); provenance.js touchesLetGo stays per stem for
      // the frame's own lines.
      const said = tellingStems(line);
      const takenUp = (o.letGo.stems ?? []).some(st => said.has(st));
      const ending = lastSentences(prose, 2);
      if (!takenUp && touchesLetGo(ending, line, [o.letGo])) logged.push({ tag: "letgo", quote: ending.slice(0, 200) });
    }
  }
  return { reask, logged };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tripwires → the judge
// ─────────────────────────────────────────────────────────────────────────────

const FIGHT_WORDS = ["fire", "fires", "fired", "shot", "shoots", "salvo", "strike", "strikes", "struck", "blow", "lance", "rake", "slash", "lands", "hit", "hits"];
/** A ship told as still docked (overhaul 2 §6.2's [place]). */
const DOCKED_WORDS = ["docked", "berth", "berthed", "clamps", "clamped", "moored"];
const HEAL_WORDS  = ["cut", "cuts", "gash", "wound", "wounds", "blood", "bandage", "dressing", "stitch", "antiseptic", "medkit", "sealant", "binding"];
const PREMISE_WORDS = Object.freeze({
  "recoverable-health": HEAL_WORDS,
  "recoverable-spirit": ["calm", "steadies", "eases", "comfort", "nerve", "fear"],
  "recoverable-supply": ["restock", "restocked", "supplies", "rations", "provisions", "stores"],
  "something-damaged":  ["patched", "repaired", "fixed", "welded", "sealed", "replaced"],
  "open-fight":         FIGHT_WORDS,
  "their-connection":   ["bond", "bonded", "connection", "trust"],
});
const OFFER_WORDS = Object.freeze({
  set_a_course: ["arrive", "arrives", "docks", "dock", "reach", "reaches", "land", "lands"],
  undertake_an_expedition: ["arrive", "arrives", "reach", "reaches"],
  finish_an_expedition: ["arrive", "arrives", "reach", "reaches"],
  repair: ["patched", "repaired", "fixed", "welded"],
  heal: HEAL_WORDS,
  resupply: ["restock", "restocked", "supplies"],
  enter_the_fray: FIGHT_WORDS,
  forge_a_bond: ["bond", "bonded"],
});

/** Speech, said or told — what trips [unsaid] (a move pressed on a card gives the character no words). */
const SPEECH_WORDS = ["tell", "tells", "told", "say", "says", "said", "ask", "asks", "asked", "promise", "promises", "promised",
  "admit", "admits", "confess", "confesses", "swear", "swears", "explain", "explains", "answer", "answers", "reply", "replies",
  "assure", "assures", "whisper", "whispers", "murmur", "murmurs", "insist", "insists"];

/** The words that trip a line's judge, by what it tells; null for a line with none. */
function tripWords(o, { refusalCode = null, offer = null, question = "", person = null } = {}) {
  switch (o?.kind) {
    case "premise": return PREMISE_WORDS[refusalCode] ?? null;
    case "fight":   return FIGHT_WORDS;
    case "offer":   return OFFER_WORDS[offer] ?? null;
    case "cost":    return Object.entries(METER_WORDS).filter(([m]) => new RegExp(m === "supply" ? "supply|resources" : m === "health" ? "health|harm" : m === "spirit" ? "spirit|stress" : m, "i").test(o.text)).flatMap(([, w]) => w);
    case "price":   return contentWords(o.text.replace(/^THE PRICE[^.]*\.\s*/, "")).slice(0, 12);
    case "oracle":  return o.list === "NOT SO" ? contentWords(question) : null;
    case "state":   return person && /not a bond/.test(o.text) ? ["bond", "bonded"] : (/No fight/.test(o.text) ? FIGHT_WORDS : null);
    case "place":   return DOCKED_WORDS;
    case "unsaid":  return SPEECH_WORDS;
    default:        return null;
  }
}

/**
 * The NOT YET and NOT SO lines whose tripwire words appear in the prose.
 *
 * @param {string} prose
 * @param {Array<Object>} obligations
 * @param {{ refusalCode?: string|null, offer?: string|null, question?: string }} [ctx]
 * @returns {Array<Object>} the tripped obligations
 */
export function trippedLines(prose, obligations, ctx = {}) {
  const words = String(prose ?? "").toLowerCase().split(/[^a-z0-9'’-]+/).filter(Boolean);
  const said = new Set(words);
  return (obligations ?? []).filter((o) => {
    if (o?.list !== "NOT YET" && o?.list !== "NOT SO") return false;
    const person = o.kind === "state" ? (/^(.+?) is .*connection/.exec(o.text)?.[1] ?? null) : null;
    const trip = tripWords(o, { ...ctx, person });
    if (!Array.isArray(trip) || !trip.length) return false;
    return trip.some(w => said.has(w));
  });
}

/**
 * One small model call: does the narration tell any tripped line as true?
 * Fail-open: an error, a timeout (JUDGE_TIMEOUT_MS) or an answer that does
 * not parse is no violation.
 *
 * @param {string} prose
 * @param {Array<Object>} tripped
 * @param {{ apiKey: string|null }} opts
 * @returns {Promise<{ violations: Array<{ tag: string, quote: string }>, judged: boolean, error?: string }>}
 */
export async function judgeNarration(prose, tripped, { apiKey } = {}) {
  if (!apiKey || !tripped?.length) return { violations: [], judged: false };
  const lines = tripped.map(o => `- [${o.kind}] (${o.list}) ${o.judge ?? o.text}`).join("\n");
  const system = "You check a short piece of game narration against lines it must keep. A NOT YET line names something the "
    + "table has not decided; telling it as done breaks it. A NOT SO line names something that is not true; telling it as "
    + "true breaks it. Read only what the narration says happens — a thing about to happen, feared, offered or merely "
    + "possible breaks nothing. Answer with JSON only: {\"violations\":[{\"tag\":\"<the line's tag>\",\"quote\":\"<the words that break it>\"}]} "
    + "— an empty list when nothing breaks.";
  const body = {
    model: JUDGE_MODEL, max_tokens: JUDGE_MAX_TOKENS, system,
    messages: [{ role: "user", content: `LINES:\n${lines}\n\nNARRATION:\n"""${String(prose ?? "").slice(0, 4000)}"""` }],
  };
  const headers = { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
  let timer = null;
  try {
    const data = await Promise.race([
      apiPost(ANTHROPIC_URL, headers, body, { label: "obligationJudge" }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("the judge timed out")), JUDGE_TIMEOUT_MS); }),
    ]);
    const text = (data?.content ?? []).filter(b => b?.type === "text").map(b => b.text).join("");
    const json = /\{[\s\S]*\}/.exec(text)?.[0];
    const parsed = json ? JSON.parse(json) : null;
    if (!parsed || !Array.isArray(parsed.violations)) return { violations: [], judged: false, error: "unparsed" };
    const tags = new Set(tripped.map(o => o.kind));
    const violations = parsed.violations
      .filter(v => v && tags.has(String(v.tag ?? "").replace(/^\[|\]$/g, "")))
      .map(v => ({ tag: String(v.tag).replace(/^\[|\]$/g, ""), quote: String(v.quote ?? "").slice(0, 200) }));
    return { violations, judged: true };
  } catch (err) {
    console.warn(`${MODULE_ID} | obligation judge: no verdict — the narration passes as written:`, err?.message ?? err);
    return { violations: [], judged: false, error: String(err?.message ?? err) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The re-ask's addendum to the user message: the draft, not posted, and the
 * lines it broke.
 *
 * @param {string} draft
 * @param {Array<{ tag: string, quote: string }>} violations
 * @param {Array<Object>} obligations
 * @returns {string}
 */
export function redraftBlock(draft, violations, obligations) {
  const byTag = new Map((obligations ?? []).map(o => [o.kind, o]));
  const broke = [...new Set(violations.map(v => v.tag))].map((tag) => {
    const o = byTag.get(tag);
    const quote = violations.find(v => v.tag === tag && v.quote)?.quote;
    return `- [${tag}] ${o?.text ?? ""}${quote ? ` (it says: "${quote}")` : ""}`;
  });
  return `## YOUR DRAFT — NOT POSTED\n"${String(draft ?? "").trim()}"\n\nThis breaks:\n${broke.join("\n")}\n`
    + "Write the narration again; keep everything else.";
}

/**
 * Call the narrator, check its reply against the obligations, and on a failure
 * ask once more. `call(addendum)` makes the narrator call — with `addendum`
 * (the re-ask's block) appended to its user message when given — and returns
 * the raw reply (prose and fact block). Only the reply returned is the one
 * whose fact block is applied. A re-ask that throws (a rate limit, a dropped
 * connection) keeps the first draft: it was a narration, and only its check
 * failed — it threw out to the narrator's catch and the beat was not told.
 *
 * @param {(addendum: string|null) => Promise<string|null>} call
 * @param {Array<Object>} obligations
 * @param {{ apiKey?: string|null, judge?: boolean, ctx?: Object, onVerdict?: Function }} [opts]
 * @returns {Promise<{ raw: string|null, reasked: boolean, verdicts: Array<Object>, stillBroken: Array<Object> }>}
 */
export async function narrateKeepingObligations(call, obligations, { apiKey = null, judge = true, ctx = {}, onVerdict = null } = {}) {
  const raw = await call(null);
  const verdicts = [];
  if (typeof raw !== "string" || !raw.trim() || !Array.isArray(obligations) || !obligations.length) {
    return { raw, reasked: false, verdicts, stillBroken: [] };
  }
  const prose = extractSidecar(raw).prose ?? raw;
  const certain = certainViolations(prose, obligations);
  const floor = floorViolations(prose, obligations, ctx);
  for (const v of floor.logged) verdicts.push({ ...v, class: "floor", action: "logged" });
  let broken = [...certain.map(v => ({ ...v, class: "certain" })), ...floor.reask.map(v => ({ ...v, class: "floor" }))];
  if (!broken.length && judge) {
    const tripped = trippedLines(prose, obligations, ctx);
    if (tripped.length) {
      const verdict = await judgeNarration(prose, tripped, { apiKey });
      verdicts.push({ class: "judge", tripped: tripped.map(o => o.kind), judged: verdict.judged, violations: verdict.violations, error: verdict.error ?? null });
      broken = verdict.violations.map(v => ({ ...v, class: "judge" }));
    }
  }
  if (!broken.length) {
    if (verdicts.length) onVerdict?.({ verdicts, reasked: false });
    return { raw, reasked: false, verdicts, stillBroken: [] };
  }
  verdicts.push(...broken.map(v => ({ ...v, action: "reask" })));
  let again = null;
  try {
    again = await call(redraftBlock(prose, broken, obligations));
  } catch (err) {
    console.warn(`${MODULE_ID} | obligations: the re-ask failed — the first draft stands:`, err?.message ?? err);
  }
  if (typeof again !== "string" || !again.trim()) {
    // The re-ask failed: the first draft stands, its breach logged.
    onVerdict?.({ verdicts, reasked: true, stillBroken: broken });
    return { raw, reasked: true, verdicts, stillBroken: broken };
  }
  const stillBroken = certainViolations(extractSidecar(again).prose ?? again, obligations).map(v => ({ ...v, class: "certain" }));
  onVerdict?.({ verdicts, reasked: true, stillBroken });
  return { raw: again, reasked: true, verdicts, stillBroken };
}
