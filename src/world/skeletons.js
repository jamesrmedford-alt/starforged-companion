/**
 * STARFORGED COMPANION
 * src/world/skeletons.js — the narrative skeleton's record, pure (issue #353)
 *
 * A skeleton is a small hidden plan for something the fiction introduced that
 * carries a mystery, a threat or an arc: what is really true about it, what it
 * wants and knows, how it escalates, the clues that point at it and the ways
 * it could end. It is kept in the GM-only World Journal — Secrets journal
 * (src/world/secrets.js), given to the narrator as UNREVEALED, and revealed
 * over move outcomes. The narrator's own sidecar decides it (`plans`) from the
 * oracle rolls that seeded it (decided, issue #353: the narrator interprets,
 * in its sidecar, first).
 *
 * This module is the record's shape and the pure rules over it — no Foundry,
 * no I/O, so the sidecar parser, the prompt builder and the store share one
 * definition:
 *   - normaliseSkeleton / normalisePlans / normaliseOpenQuestions — bound and
 *     clean what a store, a sidecar or a relay hands in
 *   - applyPlanToSkeleton — a narrator plan laid onto a record
 *   - selectRelevantSkeletons — the plans one beat is shown
 *   - planRequestsFromSeeds — the plans a narration's seeds ask it to decide
 *   - planFiledFor / seedsWithPlannedEnemy — the plan already filed for a
 *     request's resolution, and a re-narration's seeds told with its rolls
 */

import { sameSubject } from "../entities/nameMatch.js";
import { words, tellingStems } from "./tellingWords.js";

/** The kinds of plan (issue #353 "The skeleton record"). */
export const SKELETON_KINDS = Object.freeze(["threat", "mystery", "npcAgenda", "expedition", "discovery", "vow"]);

/** Their names on the page, the panel and in the prompt. */
export const SKELETON_KIND_LABELS = Object.freeze({
  threat:     "Threat",
  mystery:    "Mystery",
  npcAgenda:  "NPC agenda",
  expedition: "Expedition",
  discovery:  "Discovery",
  vow:        "Vow",
});

/** A plan in play, one that has ended in the fiction, one the GM set aside or the fiction outgrew. */
export const SKELETON_STATUSES = Object.freeze(["active", "resolved", "retired"]);

/** What a subject reference points at: a World Journal threat page, an entity Actor, a progress track, a vow, a scene, or a name the fiction gave. */
export const SUBJECT_TYPES = Object.freeze(["threat", "entity", "track", "vow", "scene", "name"]);

const TEXT_MAX     = 600;   // truth / wants / knows
const ITEM_MAX     = 300;   // one escalation step, clue or ending
const LIST_MAX     = 4;     // steps, clues, endings
const SUBJECT_MAX  = 120;
const QUESTION_MAX = 240;
const SEED_MAX     = 8;
const ID_RE        = /^[\w-]{1,64}$/;

/** Plans a narration may write in one sidecar, questions it may pose, and plans it may mark revealed. */
export const PLANS_PER_SIDECAR     = 4;
export const QUESTIONS_PER_SIDECAR = 1;
export const REVEALS_PER_SIDECAR   = 4;
/** New enemies a narration may introduce in one sidecar (issue #354 P2-29). */
export const NEW_THREATS_PER_SIDECAR = 2;
/** Other names a plan's subject may be known by (issue #354 P2-30). */
export const ALIASES_MAX = 6;

/** A trimmed, length-capped string ('' for anything else). */
function text(value, max) {
  if (typeof value !== "string") return "";
  const t = value.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Up to LIST_MAX non-empty strings, each capped. A single string is a list of one. */
function textList(value) {
  const list = Array.isArray(value) ? value : (typeof value === "string" ? [value] : []);
  return list.map(v => text(typeof v === "string" ? v : v?.text, ITEM_MAX)).filter(Boolean).slice(0, LIST_MAX);
}

/** A stable id for a list item: its prefix and position ("c1", "e2"). */
const itemId = (prefix, i) => `${prefix}${i + 1}`;

/**
 * A played escalation step's mark: the narration that played it (`playedBy`),
 * kept on a step that is played and nowhere else. Taking that narration back
 * — the X-Card, a Burn Momentum / Improve Result supersede — un-plays the
 * step by this mark (worldJournal.js undoNarrationEntries), whatever was
 * written to the plan since (issue #364 PLAN-STEP-REWRITTEN-BEFORE-BURN).
 */
const playedMark = (step) => (step?.done === true && typeof step.playedBy === "string" && ID_RE.test(step.playedBy)
  ? { playedBy: step.playedBy } : {});

/**
 * A shown clue's mark: the narration whose beat showed it (`revealedBy`),
 * kept on a clue that is shown and nowhere else — the step's mark, for a
 * clue. Only steps carried one, so a clue a taken-back narration showed still
 * stood as shown once another narration, or a GM, had written the plan since
 * (issue #364 PLAN-CLUE-TRUTH-NO-MARK). A clue shown before this carries
 * none, and is taken back only with its narration's own version of the plan,
 * as before.
 */
const shownMark = (clue) => (clue?.revealed === true && typeof clue.revealedBy === "string" && ID_RE.test(clue.revealedBy)
  ? { revealedBy: clue.revealedBy } : {});

/** A record-level mark's narration id, or null: kept only while what it marks stands (`stands`). */
const markOf = (stands, id) => (stands && typeof id === "string" && ID_RE.test(id) ? id : null);

/**
 * A skeleton record as the store keeps it: every field present, bounded and
 * typed. Unknown fields are dropped; a missing id, kind or subject name makes
 * it null (nothing to file).
 *
 * @param {Object} raw
 * @returns {Object|null}
 */
export function normaliseSkeleton(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id   = typeof raw.id === "string" && ID_RE.test(raw.id) ? raw.id : null;
  const kind = SKELETON_KINDS.includes(raw.kind) ? raw.kind : null;
  const subject = normaliseSubject(raw.subject);
  if (!id || !kind || !subject) return null;
  const escalation = (Array.isArray(raw.escalation) ? raw.escalation : []).slice(0, LIST_MAX)
    .map((e, i) => ({ id: typeof e?.id === "string" && ID_RE.test(e.id) ? e.id : itemId("e", i), text: text(e?.text ?? e, ITEM_MAX), done: e?.done === true, ...playedMark(e) }))
    .filter(e => e.text);
  const clues = (Array.isArray(raw.clues) ? raw.clues : []).slice(0, LIST_MAX)
    .map((c, i) => ({ id: typeof c?.id === "string" && ID_RE.test(c.id) ? c.id : itemId("c", i), text: text(c?.text ?? c, ITEM_MAX), revealed: c?.revealed === true, ...shownMark(c) }))
    .filter(c => c.text);
  const truth = text(raw.truth, TEXT_MAX);
  const truthRevealed = raw.truthRevealed === true && !!truth;
  const rollsShown    = raw.rollsShown === true;
  const status        = SKELETON_STATUSES.includes(raw.status) ? raw.status : "active";
  return {
    id,
    kind,
    subject,
    // Other names the story has used for the subject — the narrator's own
    // say that a "new" enemy was this one (issue #354 P2-30). Read wherever
    // the subject's name is: secrets.js subjectNames, selectRelevantSkeletons.
    aliases:       normaliseAliases(raw.aliases, subject.name),
    question:      text(raw.question, QUESTION_MAX),
    truth,
    wants:         text(raw.wants, TEXT_MAX),
    knows:         text(raw.knows, TEXT_MAX),
    escalation,
    clues,
    resolutions:   textList(raw.resolutions),
    // A truth not yet decided was never revealed: a flag set on one (a
    // reveal of an undecided plan, before issue #362 AC16) does not stand.
    truthRevealed,
    // The narration whose beat revealed the truth, and the one that showed
    // its oracle rolls with it — the step's `playedBy`, for the truth: taking
    // that narration back un-reveals it by this mark, whatever was written to
    // the plan since (issue #364 PLAN-CLUE-TRUTH-NO-MARK). Null on a truth a
    // GM revealed, or one revealed before the mark was kept. Always present:
    // a page flag is merged on write, and a mark left out would never clear.
    truthRevealedBy: markOf(truthRevealed, raw.truthRevealedBy),
    rollsShownBy:    markOf(rollsShown, raw.rollsShownBy),
    // The narration whose reveal of the truth the X-Card took back: the truth
    // is withheld from the narrator from then on — never shown it, never
    // offered to reveal it, a narration's reveal of it not recorded (issue
    // #364 XCARD-REVEAL-REREVEAL-NO-LORE, the maintainer's ruling: the
    // X-Card's exclusion holds). Set by the X-Card's undo
    // (worldJournal.js undoNarrationEntries `withholdTruths`); lifted by a
    // GM's edit of the truth (secrets.js editSkeleton) and by a GM's Reveal
    // now — kept only while the truth is decided and unrevealed. Null on
    // every other plan, and on one stored before the mark was kept.
    truthWithheldBy: markOf(!!truth && !truthRevealed, raw.truthWithheldBy),
    // The narration whose reveal of the truth a Burn Momentum / Improve
    // Result supersede took back (worldJournal.js undoNarrationEntries): the
    // burn hides the truth again and withholds nothing — its re-narration may
    // reveal it — but an X-Card that later removes that narration with the
    // beat it upgraded (issue #347 D2) reads the mark as a reveal it took back
    // itself, and withholds the truth (issue #364
    // XCARD-ON-UPGRADE-AFTER-SUPERSEDED-REVEAL). Kept only while the truth is
    // decided and unrevealed; ended by a write that changes the truth's text
    // (secrets.js updateSkeleton — the new truth was never on screen), and
    // spent when the X-Card withholds by it. Null on every other plan.
    truthTakenBackBy: markOf(!!truth && !truthRevealed, raw.truthTakenBackBy),
    // The narration whose capture linked a plan filed about a name to the
    // card or Threats page made for that name (secrets.js planNpcAgenda,
    // planSignificantThreat) — the link's own mark, as `playedBy` is a step's:
    // a Burn / Improve supersede of that narration keeps the link while the
    // card or page stands, and an undo that takes the narration back without
    // keeping it (the X-Card) puts the plan back about the name, whatever was
    // written to it since (worldJournal.js undoNarrationEntries; issue #364
    // SUPERSEDE-UNLINKS-EARLIER-PLAN). Kept only while the subject is linked.
    subjectLinkedBy: markOf(subject.type !== "name" && !!subject.id, raw.subjectLinkedBy),
    clockId:       typeof raw.clockId === "string" && ID_RE.test(raw.clockId) ? raw.clockId : null,
    oracleSeeds:   (Array.isArray(raw.oracleSeeds) ? raw.oracleSeeds : []).map(s => text(s, ITEM_MAX)).filter(Boolean).slice(0, SEED_MAX),
    // The one re-roll a plan awaiting its decision may use in place of a
    // result that contradicts the story ("one re-roll", issue #353 "Rules for
    // these rolls"); spent or dropped once it is decided.
    reroll:        text(raw.reroll, ITEM_MAX),
    rollsShown,
    status,
    // The narration whose beat ended the plan's story (`resolved`) — the
    // truth's mark, for the ending: taking that narration back puts the plan
    // back in play, whatever was written to it since (issue #364
    // PLAN-RESOLVED-NO-MARK). Null on a plan its subject's end, or a GM,
    // closed. Always present, as the truth's marks are.
    resolvedBy:    markOf(status === "resolved", raw.resolvedBy),
    sceneId:       typeof raw.sceneId === "string" ? raw.sceneId : null,
    sessionId:     typeof raw.sessionId === "string" ? raw.sessionId : null,
    createdFrom:   normaliseProvenance(raw.createdFrom),
    createdAt:     typeof raw.createdAt === "string" ? raw.createdAt : null,
    updatedAt:     typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

/** A plan's other names: trimmed, each once (case aside), never the subject's own, at most ALIASES_MAX. */
function normaliseAliases(aliases, subjectName) {
  const seen = new Set([String(subjectName ?? "").toLowerCase()]);
  const out = [];
  for (const a of Array.isArray(aliases) ? aliases : []) {
    const name = text(a, SUBJECT_MAX);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= ALIASES_MAX) break;
  }
  return out;
}

/**
 * A plan with one more name for its subject (issue #354 P2-30). The same
 * record when the name is empty, the subject's own, or already kept.
 *
 * @param {Object} record — normaliseSkeleton's
 * @param {string} name
 * @returns {Object}
 */
export function withAlias(record, name) {
  const aliases = normaliseAliases([...(record?.aliases ?? []), name], record?.subject?.name);
  return aliases.length === (record?.aliases ?? []).length ? record : { ...record, aliases };
}

/** `{ type, id, name }` — a known type, an id when it has one, and the name the fiction uses. Null without a name. */
export function normaliseSubject(subject) {
  if (!subject || typeof subject !== "object") return null;
  const name = text(subject.name, SUBJECT_MAX);
  if (!name) return null;
  return {
    type: SUBJECT_TYPES.includes(subject.type) ? subject.type : "name",
    id:   typeof subject.id === "string" && subject.id && subject.id.length <= 64 ? subject.id : null,
    name,
  };
}

/**
 * Where a plan came from (`createdFrom`): the narration that filed it, the
 * move, what asked for it (`trigger`), and the resolution it was filed for
 * (`resolutionId` — the move's own id; for a Burn Momentum / Improve Result
 * re-narration, the resolution it upgrades; a Batch Mode round entry's own).
 * The resolution is what a plan filed with its rolls alone by a narration
 * that was never written — which no narration id stamps — is found by: a
 * later narration of the same move decides it instead of filing a second
 * (planFiledFor; issue #364 KEPT-PRICE-NEW-ENEMY-PLANNED-TWICE). Null on a
 * plan no move's request filed, and on every plan filed before the field.
 */
function normaliseProvenance(p) {
  if (!p || typeof p !== "object") return { narrationId: null, moveId: null, trigger: null, resolutionId: null };
  const str = (v) => (typeof v === "string" && v.length <= 64 ? v : null);
  return { narrationId: str(p.narrationId), moveId: str(p.moveId), trigger: str(p.trigger), resolutionId: str(p.resolutionId) };
}

/**
 * The sidecar's `plans` (issue #353 Phase 1): the narrator's decision of what
 * is true about a subject the prompt asked it to decide, or a correction where
 * its prose contradicted a plan. Each needs the id it was shown; the rest is
 * what it decided. Bounded — it may come over the relay from a client.
 *
 * @param {*} plans
 * @returns {Array<{ id, subject, truth, wants, knows, escalation, clues, resolutions, rerolled, sameAs }>}
 */
export function normalisePlans(plans) {
  if (!Array.isArray(plans)) return [];
  const out = [];
  for (const p of plans) {
    if (!p || typeof p !== "object") continue;
    const id = typeof p.id === "string" && ID_RE.test(p.id.trim()) ? p.id.trim() : null;
    if (!id) continue;
    const plan = {
      id,
      subject:     text(p.subject, SUBJECT_MAX),
      truth:       text(p.truth, TEXT_MAX),
      wants:       text(p.wants, TEXT_MAX),
      knows:       text(p.knows, TEXT_MAX),
      escalation:  textList(p.escalation),
      clues:       textList(p.clues),
      resolutions: textList(p.resolutions),
      // The oracle result the plan's re-roll replaced, when it used it.
      rerolled:    text(p.rerolled, ITEM_MAX),
      // The plan this one's subject already has, under another name (issue
      // #354 P2-30): the id the narrator was shown under ALREADY PLANNED.
      sameAs:      typeof p.sameAs === "string" && ID_RE.test(p.sameAs.trim()) && p.sameAs.trim() !== id ? p.sameAs.trim() : "",
    };
    if (!plan.truth && !plan.wants && !plan.escalation.length && !plan.clues.length && !plan.sameAs) continue;
    out.push(plan);
    if (out.length >= PLANS_PER_SIDECAR) break;
  }
  return out;
}

/**
 * The sidecar's `openQuestions` (issue #353 Phase 1): a question or mystery
 * the prose poses that the characters are meant to answer — its hidden answer
 * is rolled and kept (a `mystery` plan). At most QUESTIONS_PER_SIDECAR.
 *
 * @param {*} questions
 * @returns {Array<{ question: string, about: string }>}
 */
export function normaliseOpenQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  const out = [];
  for (const q of questions) {
    const question = text(typeof q === "string" ? q : q?.question, QUESTION_MAX);
    if (!question) continue;
    out.push({ question, about: text(q?.about, SUBJECT_MAX) });
    if (out.length >= QUESTIONS_PER_SIDECAR) break;
  }
  return out;
}

/**
 * The sidecar's `newThreats` (issue #354 P2-29): an enemy or a danger the
 * prose introduced that the story will have to deal with. Each gets a hidden
 * plan — its rolls made now, its truth decided by the next narration it is in
 * play for (secrets.js applyPlanSideData). A plan was asked for only when a
 * rolled price was "A new enemy is revealed"; since a miss usually pays the
 * outcome stated before the roll, that row is rare, and an enemy that entered
 * any other way had no plan until entity detection recorded it as a threat.
 * At most NEW_THREATS_PER_SIDECAR, each name once. Bounded — it may come over
 * the relay.
 *
 * @param {*} threats
 * @returns {Array<{ name: string }>}
 */
export function normaliseNewThreats(threats) {
  if (!Array.isArray(threats)) return [];
  const out = [];
  for (const t of threats) {
    const name = text(typeof t === "string" ? t : t?.name, SUBJECT_MAX);
    if (!name || out.some(o => sameSubjectName(o.name, name))) continue;
    out.push({ name });
    if (out.length >= NEW_THREATS_PER_SIDECAR) break;
  }
  return out;
}

/** The kinds of plan that can be about one being: an enemy the story revealed, a threat, an NPC's agenda. */
export const BEING_KINDS = Object.freeze(["threat", "npcAgenda"]);

/**
 * The beings that already have a plan, as the narrator is shown them when it
 * has a new one to decide (issue #354 P2-30) — so it can say the "new" one is
 * one of these under another name. Active plans of a being kind, less the ones
 * being decided (`exclude`), newest first, at most `max`.
 *
 * @param {Object[]} records — normaliseSkeleton's
 * @param {{ exclude?: string[], max?: number }} [opts]
 * @returns {Array<{ id: string, kind: string, name: string, aliases: string[] }>}
 */
export function plannedBeings(records, { exclude = [], max = 8 } = {}) {
  const skip = new Set(Array.isArray(exclude) ? exclude : []);
  const time = (r) => String(r.updatedAt ?? r.createdAt ?? "");
  return (Array.isArray(records) ? records : [])
    .filter(r => r?.status === "active" && BEING_KINDS.includes(r.kind) && r.subject?.name && !skip.has(r.id))
    .sort((a, b) => time(b).localeCompare(time(a)))
    .slice(0, Math.max(0, max))
    .map(r => ({ id: r.id, kind: r.kind, name: r.subject.name, aliases: r.aliases ?? [] }));
}

/**
 * The sidecar's `reveals` (issue #353 Phase 2): what this beat showed of a
 * plan — clues by id (or "truth" for the truth itself), the escalation step
 * it played, whether the subject's story ended. Each needs the plan's id and
 * at least one of those. Bounded — it may come over the relay.
 *
 * @param {*} reveals
 * @returns {Array<{ id: string, revealed: string[], advanced: string|null, resolved: boolean }>}
 */
export function normaliseReveals(reveals) {
  if (!Array.isArray(reveals)) return [];
  const out = [];
  for (const r of reveals) {
    if (!r || typeof r !== "object") continue;
    const id = typeof r.id === "string" && ID_RE.test(r.id.trim()) ? r.id.trim() : null;
    if (!id) continue;
    const revealed = [...new Set((Array.isArray(r.revealed) ? r.revealed : (typeof r.revealed === "string" ? [r.revealed] : []))
      .filter(v => typeof v === "string").map(v => v.trim().toLowerCase())
      .filter(v => v === "truth" || /^c\d{1,2}$/.test(v)))].slice(0, LIST_MAX + 1);
    const advanced = typeof r.advanced === "string" && /^e\d{1,2}$/i.test(r.advanced.trim()) ? r.advanced.trim().toLowerCase() : null;
    const resolved = r.resolved === true;
    if (!revealed.length && !advanced && !resolved) continue;
    out.push({ id, revealed, advanced, resolved });
    if (out.length >= REVEALS_PER_SIDECAR) break;
  }
  return out;
}

/**
 * The sidecar's `countdown` (issue #353 Phase 3): a countdown the prose
 * started — a count, a deadline, "before it asks again". It becomes a real
 * tension clock, paced by Pay the Price, tied to the plan it belongs to
 * (`about` — a plan id, or who or what it concerns). Null for anything else.
 *
 * @param {*} countdown
 * @returns {{ label: string, about: string, segments: 4|6 }|null}
 */
export function normaliseCountdown(countdown) {
  const c = Array.isArray(countdown) ? countdown[0] : countdown;
  if (!c || typeof c !== "object") return null;
  const label = text(c.label, 60);
  if (!label) return null;
  return { label, about: text(c.about, SUBJECT_MAX), segments: Number(c.segments) === 6 ? 6 : 4 };
}

/**
 * What a beat showed, laid onto the plan: its clues shown, its truth
 * revealed, its step played, its story ended (`status: "resolved"`). A truth
 * not yet decided cannot be revealed (issue #362 AC16): a "truth" reveal of a
 * plan still waiting for its decision changes nothing — marked, the plan read
 * as revealed once a later narration decided it, and its hidden wants showed
 * on every player's Session panel as a standing demand.
 *
 * The step it plays is marked with the narration that played it (`playedBy`,
 * playedMark) — a step already played keeps the mark it has. So is each clue
 * it shows (`revealedBy`, shownMark) and the truth it reveals
 * (`truthRevealedBy`), each only when this beat is what showed it: a clue
 * already shown, a truth already revealed, keeps the mark — or the lack of
 * one — it has (issue #364 PLAN-CLUE-TRUTH-NO-MARK). And the ending, when
 * this beat is what ends the story (`resolvedBy`; a plan its subject's end
 * already resolved keeps none — issue #364 PLAN-RESOLVED-NO-MARK).
 *
 * @param {Object} record — normaliseSkeleton's
 * @param {{ revealed: string[], advanced: string|null, resolved: boolean }} reveal
 * @param {{ narrationId?: string|null }} [opts] — the narration whose beat showed it
 * @returns {Object} a new record
 */
export function applyRevealToSkeleton(record, reveal, { narrationId = null } = {}) {
  const shown = new Set(reveal.revealed);
  const id = typeof narrationId === "string" && ID_RE.test(narrationId) ? narrationId : null;
  const by = id ? { playedBy: id } : {};
  // A truth the X-Card withheld is not revealed by a narration (issue #364
  // XCARD-REVEAL-REREVEAL-NO-LORE): the rest of the beat's reveal stands.
  const truthNow = !record.truthRevealed && !record.truthWithheldBy && shown.has("truth") && !!record.truth;
  const endsNow  = reveal.resolved === true && record.status !== "resolved";
  return {
    ...record,
    truthRevealed: record.truthRevealed || truthNow,
    ...(truthNow ? { truthRevealedBy: id } : {}),
    ...(endsNow ? { resolvedBy: id } : {}),
    clues:         record.clues.map(c => (shown.has(c.id) && !c.revealed ? { ...c, revealed: true, ...(id ? { revealedBy: id } : {}) } : c)),
    escalation:    record.escalation.map(e => (e.id === reveal.advanced && !e.done ? { ...e, done: true, ...by } : e)),
    status:        reveal.resolved ? "resolved" : record.status,
  };
}


/**
 * A plan the narrator decided, laid onto its record: each field it gave
 * replaces the record's; a list it gave replaces the list, keeping what was
 * already revealed or played of an item it repeated word for word. The
 * subject's name follows the prose when the plan names it — the narrated fact
 * wins (issue #353 "How binding a plan is").
 *
 * @param {Object} record — normaliseSkeleton's
 * @param {Object} plan — normalisePlans'
 * @returns {Object} a new record
 */
export function applyPlanToSkeleton(record, plan) {
  const next = { ...record, subject: { ...record.subject } };
  // The decision may use the plan's one re-roll in place of a result that
  // contradicts the story: kept with its rolls, and spent. Only while it is
  // being decided — a correction re-rolls nothing.
  if (!record.truth && plan.rerolled && record.reroll) {
    next.oracleSeeds = [...(record.oracleSeeds ?? []).slice(0, SEED_MAX - 1),
      text(`Re-rolled in place of "${plan.rerolled}": ${record.reroll}`, ITEM_MAX)];
    next.reroll = "";
  }
  if (plan.subject) next.subject.name = plan.subject;
  // A withheld truth is the GM's to change, never a narration's: the narrator
  // is not shown it (issue #364 XCARD-REVEAL-REREVEAL-NO-LORE).
  for (const field of ["truth", "wants", "knows"]) {
    if (plan[field] && !(field === "truth" && record.truthWithheldBy)) next[field] = plan[field];
  }
  if (plan.escalation.length) {
    const done = new Map(record.escalation.filter(e => e.done).map(e => [e.text, e]));
    next.escalation = plan.escalation.map((t, i) => ({ id: itemId("e", i), text: t, done: done.has(t), ...playedMark(done.get(t)) }));
  }
  if (plan.clues.length) {
    const shown = new Map(record.clues.filter(c => c.revealed).map(c => [c.text, c]));
    next.clues = plan.clues.map((t, i) => ({ id: itemId("c", i), text: t, revealed: shown.has(t), ...shownMark(shown.get(t)) }));
  }
  if (plan.resolutions.length) next.resolutions = plan.resolutions;
  if (next.truth) next.reroll = "";   // decided: an unused re-roll goes
  return next;
}

/** Leading articles and filler a subject name may carry ("the escort"). */
const NAME_FILLER = new Set(["the", "a", "an", "of", "and", "to", "in", "on", "at"]);

/**
 * Whether `name` is mentioned in `passage`: its words, less articles, appear
 * there in order (whole words). "the escort" is found in "The escort waits";
 * "Vuldar Archer" in "Archer's count" is not (a part name is not the name).
 */
export function nameMentioned(name, passage) {
  const need = words(name).filter(w => !NAME_FILLER.has(w));
  if (!need.length) return false;
  // Filler is dropped from both: a name with one inside ("Free the Kessan
  // miners") is found in its own words.
  const have = words(passage).map(w => w.replace(/'s$/, "")).filter(w => !NAME_FILLER.has(w));
  for (let i = 0; i + need.length <= have.length; i += 1) {
    if (need.every((w, j) => have[i + j] === w)) return true;
  }
  return false;
}

// The telling words a reveal is read by — the common ones left out, each
// stemmed — are tellingWords.js's, which a scene question's provenance reads
// too (overhaul 2): a leaf, so its readers read no plan.

/**
 * Whether a narration's prose tells any of a plan's truth (known-issues
 * VOW-FULFILLED-WITH-NOBODY-NAMED — the long haul's third live run, a64): the
 * prose has at least one of the truth's own telling words, other than the
 * words of what the plan is about (`about`: its subject's name, a mystery's
 * question), which a narration uses without telling anything. A fulfilment's
 * fact block recorded its vow's truth as revealed — the raiders are "a
 * coordinated crew working the lanes from inside Hollow Spire's shadow",
 * their leader after "a vulnerable enclave kept hidden" — under prose that
 * said "The thing you swore to find has a hand and a seal, and both are named
 * now": none of it.
 *
 * A floor, not a judgement of whether the truth was stated — that is asked of
 * the narrator in its prompt (narratorPrompt.js formatUnrevealedBlock). It
 * catches the reveal whose prose told nothing, and takes any telling that
 * keeps one of the truth's words: a higher bar turned away plain reveals in
 * other words ("Someone sold her berth to people who wanted her gone"), and a
 * truth left unrevealed after its prose told it is the worse mistake to make
 * by rule. True for a truth with no telling words of its own.
 *
 * @param {string} prose — the narration, its fact block removed
 * @param {string} truth — the plan's truth
 * @param {{ about?: string[] }} [opts] — what the plan is about: left out of the truth's words
 * @returns {boolean}
 */
export function proseTellsTruth(prose, truth, { about = [] } = {}) {
  const own = tellingStems(truth);
  for (const a of Array.isArray(about) ? about : []) for (const s of tellingStems(a)) own.delete(s);
  if (!own.size) return true;
  const told = tellingStems(prose);
  for (const s of own) if (told.has(s)) return true;
  return false;
}

/** How many plans one beat is shown, at most (the token cap trims further). */
export const MAX_RELEVANT_SKELETONS = 4;

/**
 * Whether a plan is in play for a beat whose moves end `endingIds` (tracks,
 * vows — `endingTrackIds`): an active plan, or one resolved because its
 * subject ended — its expedition's track completed, its vow fulfilled — when
 * this beat is the one that ends it (issue #362 D4: the plan is resolved in
 * code as its subject ends, and the narration of the Finish an Expedition or
 * Fulfill Your Vow that ended it still reveals its end, and records it).
 *
 * @param {Object|null} record — normaliseSkeleton's
 * @param {Iterable<string>|null} [endingIds]
 * @returns {boolean}
 */
export function planInPlay(record, endingIds = null) {
  if (record?.status === "active") return true;
  if (record?.status !== "resolved" || !record.subject?.id || !endingIds) return false;
  const ending = endingIds instanceof Set ? endingIds : new Set(endingIds);
  return ending.has(record.subject.id);
}

/**
 * The plans relevant to this beat (issue #353 "What the narrator sees"):
 * active ones whose subject is in play — made in this scene, its entity among
 * the matched or the scene frame's cast, its name in the frame or the player's
 * line, or one of the open tracks or vows the beat serves — and a plan its
 * subject's end resolved, in the beat that ends it (planInPlay, issue #362
 * D4). Made-in-scene first, then the most recently changed. At most `max`.
 *
 * @param {Object[]} records — normaliseSkeleton's
 * @param {Object} ctx
 * @param {string|null} [ctx.sceneId]
 * @param {Object|null} [ctx.frame] — the scene frame { location, present, situation }
 * @param {string[]} [ctx.matchedEntityIds]
 * @param {string} [ctx.text] — the player's line, or the question asked
 * @param {string[]} [ctx.openTrackIds] — open progress tracks (an expedition's plan)
 * @param {string[]} [ctx.activeThreatNames] — the World Journal's immediate threats (a threat's plan)
 * @param {string[]} [ctx.endingTrackIds] — tracks this beat finishes (an expedition's plan, its ending
 *   revealed; a fulfilled vow's, by its stable vowId)
 * @param {string[]} [ctx.planIds] — plans this beat is about whatever else (a clock vignette's, a complication's)
 * @param {{ id?: string|null, name?: string }|null} [ctx.sceneVow] — the vow this scene serves
 *   (R3's openThreads.readSceneVow: a linked track's, the quest focus, the only vow in play) — its
 *   plan is in play (Phase 4)
 * @param {number} [ctx.max]
 * @returns {Object[]}
 */
export function selectRelevantSkeletons(records, ctx = {}) {
  const ending  = new Set(Array.isArray(ctx.endingTrackIds) ? ctx.endingTrackIds : []);
  // Active plans — and one its subject's end resolved, in the beat that ends it (planInPlay).
  const list = (Array.isArray(records) ? records : []).filter(r => planInPlay(r, ending));
  if (!list.length) return [];
  const matched = new Set(Array.isArray(ctx.matchedEntityIds) ? ctx.matchedEntityIds : []);
  const tracks  = new Set(Array.isArray(ctx.openTrackIds) ? ctx.openTrackIds : []);
  const threats = (Array.isArray(ctx.activeThreatNames) ? ctx.activeThreatNames : []).filter(n => typeof n === "string");
  const sceneVow = ctx.sceneVow && typeof ctx.sceneVow === "object" ? ctx.sceneVow : null;
  const pinned  = new Set(Array.isArray(ctx.planIds) ? ctx.planIds : []);
  const frame   = ctx.frame && typeof ctx.frame === "object" ? ctx.frame : {};
  const passage = [
    ctx.text,
    frame.location,
    frame.situation,
    ...(Array.isArray(frame.present) ? frame.present : []),
  ].filter(v => typeof v === "string" && v.trim()).join(" \n ");
  const inScene = (r) => !!ctx.sceneId && r.sceneId === ctx.sceneId;
  const relevant = (r) => {
    if (pinned.has(r.id) || inScene(r)) return true;
    const s = r.subject ?? {};
    if (s.id && (matched.has(s.id) || tracks.has(s.id) || ending.has(s.id))) return true;
    // Every name the subject goes by: its own and the others the story used.
    const names = [s.name, ...(r.aliases ?? [])];
    if (r.kind === "threat" && threats.some(n => names.some(own => sameSubject(n, own)))) return true;   // a variant of its name too (issue #354 P2-30)
    if (r.kind === "vow" && sceneVow && ((s.id && s.id === sceneVow.id) || sameSubjectName(sceneVow.name, s.name))) return true;
    return names.some(own => nameMentioned(own, passage));
  };
  const time = (r) => String(r.updatedAt ?? r.createdAt ?? "");
  const first = (r) => (pinned.has(r.id) ? 2 : (inScene(r) ? 1 : 0));
  return list.filter(relevant)
    .sort((a, b) => (first(b) - first(a)) || time(b).localeCompare(time(a)))
    .slice(0, Math.max(0, Number.isInteger(ctx.max) ? ctx.max : MAX_RELEVANT_SKELETONS));
}

/** The seed lines a price that reveals a new enemy carries (resolver.js newEnemySeedLines), and what each begins with. */
const NEW_ENEMY_SEED = /^The new enemy — /;
const NEW_ENEMY_PREFIX = "The new enemy — ";

/** What asks for a new enemy's plan: the price that revealed it (a plan's `createdFrom.trigger`). */
const NEW_ENEMY_TRIGGER = "new_enemy";

/** What a new enemy's plan is called until a narration names it. */
const NEW_ENEMY_LABEL = "the new enemy this price reveals";

/**
 * Whether a name is a plan request's placeholder — what a plan is filed under
 * when the narration asked to decide it named none ("the new enemy this price
 * reveals", "the discovery this move makes"): never a name the story gave its
 * subject (secrets.js planAsAnother keeps it off the plan it joins' aliases,
 * issue #362 AC36).
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isPlanRequestLabel(name) {
  return [NEW_ENEMY_LABEL, ...Object.values(DISCOVERY_MOVES).map(d => d.label)].some(label => sameSubjectName(label, name));
}

/**
 * The plans a narration's oracle seeds ask it to decide (issue #353 Phase 1):
 * a price that revealed a new enemy (its Character Role, Goal and Disposition
 * seed lines) asks for a `threat` plan. Each request carries a ref the
 * narration's sidecar `plans` entry answers under.
 *
 * @param {{ results?: string[] }|string[]|null} seeds — a resolution's oracleSeeds, or seed lines
 * @param {string} refBase — unique to the narration (its id)
 * @returns {Array<{ ref: string, kind: string, trigger: string, label: string, oracleSeeds: string[] }>}
 */
export function planRequestsFromSeeds(seeds, refBase) {
  const lines = Array.isArray(seeds) ? seeds : (Array.isArray(seeds?.results) ? seeds.results : []);
  if (typeof refBase !== "string" || !refBase) return [];
  const out = [];
  const enemy = lines.filter(l => typeof l === "string" && NEW_ENEMY_SEED.test(l));
  if (enemy.length) {
    out.push({
      ref:         `plan-${refBase}-enemy`.slice(0, 64),
      kind:        "threat",
      trigger:     NEW_ENEMY_TRIGGER,
      label:       NEW_ENEMY_LABEL,
      oracleSeeds: enemy.map(l => l.replace(NEW_ENEMY_SEED, "")),
    });
  }
  // Make a Discovery and Confront Chaos roll what they find (Phase 4): the
  // plan keeps what it means (issue #353 "When a skeleton is made").
  const discovery = DISCOVERY_MOVES[String(seeds?.context ?? "").split(" ")[0]];
  const found = lines.filter(l => typeof l === "string" && !/^Pay the Price: /.test(l) && !NEW_ENEMY_SEED.test(l));
  if (discovery && found.length) {
    out.push({
      ref:         `plan-${refBase}-find`.slice(0, 64),
      kind:        "discovery",
      trigger:     discovery.trigger,
      label:       discovery.label,
      oracleSeeds: found,
    });
  }
  return out;
}

/**
 * The plan already filed for the resolution a request is made for (issue #364
 * KEPT-PRICE-NEW-ENEMY-PLANNED-TWICE): the same kind, asked for by the same
 * trigger, for the same resolution (`createdFrom.resolutionId`). A Battle or
 * Clash burned or improved to a weak hit keeps its price; when that price
 * revealed a new enemy and the move's first narration was never written, the
 * enemy's plan was filed with its rolls alone, stamped with no narration —
 * and the re-narration's seeds asked for it again, with no subject id to
 * know it by. Null for a request that names no resolution, and never a plan
 * filed before plans kept theirs.
 *
 * @param {Object[]} records — normaliseSkeleton's, inactive ones too: a plan a GM retired, or one that
 *   joined another, was still filed
 * @param {{ kind?: string, trigger?: string, resolutionId?: string }|null} request
 * @returns {Object|null}
 */
export function planFiledFor(records, request) {
  const resolutionId = typeof request?.resolutionId === "string" && request.resolutionId ? request.resolutionId : null;
  if (!resolutionId) return null;
  return (Array.isArray(records) ? records : []).find(r => r?.kind === request.kind
    && r.createdFrom?.resolutionId === resolutionId
    && (r.createdFrom.trigger ?? "") === (request.trigger ?? "")) ?? null;
}

/**
 * A narration's oracle seeds with the new enemy's lines as its plan holds
 * them — planRequestsFromSeeds' enemy lines, the other way: the narration
 * that decides a plan already filed for its price (planFiledFor) is told the
 * rolls that plan was filed with, not a second set rolled for the
 * re-narration. The same seeds when they carry no enemy line, or none of the
 * plans is a price's new enemy that keeps its rolls.
 *
 * @param {{ results?: string[] }|null} seeds — a resolution's oracleSeeds
 * @param {Object[]} plans — the plans already filed for the resolution (normaliseSkeleton's)
 * @returns {{ results?: string[] }|null}
 */
export function seedsWithPlannedEnemy(seeds, plans) {
  const lines = Array.isArray(seeds?.results) ? seeds.results : [];
  const plan = (Array.isArray(plans) ? plans : []).find(p => p?.kind === "threat" && p.createdFrom?.trigger === NEW_ENEMY_TRIGGER);
  const rolls = (Array.isArray(plan?.oracleSeeds) ? plan.oracleSeeds : []).filter(s => typeof s === "string" && s);
  const first = lines.findIndex(l => typeof l === "string" && NEW_ENEMY_SEED.test(l));
  if (first < 0 || !rolls.length) return seeds ?? null;
  const rest = lines.filter(l => !(typeof l === "string" && NEW_ENEMY_SEED.test(l)));
  return { ...seeds, results: [...rest.slice(0, first), ...rolls.map(s => `${NEW_ENEMY_PREFIX}${s}`), ...rest.slice(first)] };
}

/** The moves whose rolled find a plan keeps the meaning of (Phase 4). */
const DISCOVERY_MOVES = Object.freeze({
  make_a_discovery: { trigger: "make_a_discovery", label: "the discovery this move makes" },
  confront_chaos:   { trigger: "confront_chaos",   label: "the chaos this move confronts" },
});

/**
 * How many plan requests one narration may carry (issue #364
 * ROUND-PLAN-REQUEST-CAP). A narration is *asked* to decide the first
 * PLANS_PER_SIDECAR of them (DECIDE NOW — its sidecar holds no more plans);
 * the rest are filed with their rolls alone, for the next narration they are
 * in play for. A move brings three at most (a price's new enemy, a find, an
 * expedition); a Batch Mode round brings each acting entry's, and the fifth
 * onward was dropped with no plan filed. Eight entries' worth.
 */
export const PLAN_REQUESTS_PER_NARRATION = 24;

/**
 * Plan requests, bounded: known kinds, bounded refs and seeds, at most `max`.
 * The default — PLANS_PER_SIDECAR — is the bound on what crosses the relay
 * from a client; a narration on this client carries up to
 * PLAN_REQUESTS_PER_NARRATION (narrator.js buildNarratorExtras, secrets.js
 * applyPlanSideData).
 *
 * @param {*} requests
 * @param {{ max?: number }} [opts]
 * @returns {Array<{ ref: string, kind: string, trigger: string, label: string, oracleSeeds: string[],
 *   reroll?: string, subject?: Object, resolutionId?: string }>}
 */
export function normalisePlanRequests(requests, { max = PLANS_PER_SIDECAR } = {}) {
  if (!Array.isArray(requests)) return [];
  const most = Number.isInteger(max) && max >= 0 ? max : PLANS_PER_SIDECAR;
  return requests
    .filter(r => r && typeof r.ref === "string" && ID_RE.test(r.ref) && SKELETON_KINDS.includes(r.kind))
    .slice(0, most)
    .map(r => ({
      ref:         r.ref,
      kind:        r.kind,
      trigger:     typeof r.trigger === "string" ? r.trigger.slice(0, 32) : "",
      label:       text(r.label, SUBJECT_MAX) || "the subject",
      oracleSeeds: (Array.isArray(r.oracleSeeds) ? r.oracleSeeds : []).map(s => text(s, ITEM_MAX)).filter(Boolean).slice(0, SEED_MAX),
      // Its one re-roll (narrator.js buildNarratorExtras rolls it).
      ...(text(r.reroll, ITEM_MAX) ? { reroll: text(r.reroll, ITEM_MAX) } : {}),
      // A request about a known subject (an expedition's track) names it by id.
      ...(normaliseSubject(r.subject) ? { subject: normaliseSubject(r.subject) } : {}),
      // The resolution it is made for — the plan's provenance (normaliseProvenance).
      ...(typeof r.resolutionId === "string" && ID_RE.test(r.resolutionId) ? { resolutionId: r.resolutionId } : {}),
    }));
}

/** Two subject names are the same when their words are, articles aside ("The Escort" is "the escort"). */
export function sameSubjectName(a, b) {
  const wa = words(a).filter(w => !NAME_FILLER.has(w)).join(" ");
  const wb = words(b).filter(w => !NAME_FILLER.has(w)).join(" ");
  return !!wa && wa === wb;
}

/** Two questions are the same when their words are (case and punctuation aside). */
export function sameQuestion(a, b) {
  const wa = words(a).join(" ");
  const wb = words(b).join(" ");
  return !!wa && (wa === wb || wa.includes(wb) || wb.includes(wa));
}
