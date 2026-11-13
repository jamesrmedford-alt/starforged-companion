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
 */

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
    .map((e, i) => ({ id: typeof e?.id === "string" && ID_RE.test(e.id) ? e.id : itemId("e", i), text: text(e?.text ?? e, ITEM_MAX), done: e?.done === true }))
    .filter(e => e.text);
  const clues = (Array.isArray(raw.clues) ? raw.clues : []).slice(0, LIST_MAX)
    .map((c, i) => ({ id: typeof c?.id === "string" && ID_RE.test(c.id) ? c.id : itemId("c", i), text: text(c?.text ?? c, ITEM_MAX), revealed: c?.revealed === true }))
    .filter(c => c.text);
  return {
    id,
    kind,
    subject,
    question:      text(raw.question, QUESTION_MAX),
    truth:         text(raw.truth, TEXT_MAX),
    wants:         text(raw.wants, TEXT_MAX),
    knows:         text(raw.knows, TEXT_MAX),
    escalation,
    clues,
    resolutions:   textList(raw.resolutions),
    truthRevealed: raw.truthRevealed === true,
    clockId:       typeof raw.clockId === "string" && ID_RE.test(raw.clockId) ? raw.clockId : null,
    oracleSeeds:   (Array.isArray(raw.oracleSeeds) ? raw.oracleSeeds : []).map(s => text(s, ITEM_MAX)).filter(Boolean).slice(0, SEED_MAX),
    rollsShown:    raw.rollsShown === true,
    status:        SKELETON_STATUSES.includes(raw.status) ? raw.status : "active",
    sceneId:       typeof raw.sceneId === "string" ? raw.sceneId : null,
    sessionId:     typeof raw.sessionId === "string" ? raw.sessionId : null,
    createdFrom:   normaliseProvenance(raw.createdFrom),
    createdAt:     typeof raw.createdAt === "string" ? raw.createdAt : null,
    updatedAt:     typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
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

function normaliseProvenance(p) {
  if (!p || typeof p !== "object") return { narrationId: null, moveId: null, trigger: null };
  const str = (v) => (typeof v === "string" && v.length <= 64 ? v : null);
  return { narrationId: str(p.narrationId), moveId: str(p.moveId), trigger: str(p.trigger) };
}

/**
 * The sidecar's `plans` (issue #353 Phase 1): the narrator's decision of what
 * is true about a subject the prompt asked it to decide, or a correction where
 * its prose contradicted a plan. Each needs the id it was shown; the rest is
 * what it decided. Bounded — it may come over the relay from a client.
 *
 * @param {*} plans
 * @returns {Array<{ id, subject, truth, wants, knows, escalation, clues, resolutions }>}
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
    };
    if (!plan.truth && !plan.wants && !plan.escalation.length && !plan.clues.length) continue;
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
 * revealed, its step played, its story ended (`status: "resolved"`).
 *
 * @param {Object} record — normaliseSkeleton's
 * @param {{ revealed: string[], advanced: string|null, resolved: boolean }} reveal
 * @returns {Object} a new record
 */
export function applyRevealToSkeleton(record, reveal) {
  const shown = new Set(reveal.revealed);
  return {
    ...record,
    truthRevealed: record.truthRevealed || shown.has("truth"),
    clues:         record.clues.map(c => (shown.has(c.id) ? { ...c, revealed: true } : c)),
    escalation:    record.escalation.map(e => (e.id === reveal.advanced ? { ...e, done: true } : e)),
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
  if (plan.subject) next.subject.name = plan.subject;
  for (const field of ["truth", "wants", "knows"]) if (plan[field]) next[field] = plan[field];
  if (plan.escalation.length) {
    const done = new Set(record.escalation.filter(e => e.done).map(e => e.text));
    next.escalation = plan.escalation.map((t, i) => ({ id: itemId("e", i), text: t, done: done.has(t) }));
  }
  if (plan.clues.length) {
    const shown = new Set(record.clues.filter(c => c.revealed).map(c => c.text));
    next.clues = plan.clues.map((t, i) => ({ id: itemId("c", i), text: t, revealed: shown.has(t) }));
  }
  if (plan.resolutions.length) next.resolutions = plan.resolutions;
  return next;
}

/** The words of a name or a passage, lower-cased, for whole-word matching. */
function words(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
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

/** How many plans one beat is shown, at most (the token cap trims further). */
export const MAX_RELEVANT_SKELETONS = 4;

/**
 * The plans relevant to this beat (issue #353 "What the narrator sees"):
 * active ones whose subject is in play — made in this scene, its entity among
 * the matched or the scene frame's cast, its name in the frame or the player's
 * line, or one of the open tracks or vows the beat serves. Made-in-scene
 * first, then the most recently changed. At most `max`.
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
 * @param {string[]} [ctx.openVowNames] — the open vow when it is the only one (a vow's plan, Phase 4)
 * @param {number} [ctx.max]
 * @returns {Object[]}
 */
export function selectRelevantSkeletons(records, ctx = {}) {
  const list = (Array.isArray(records) ? records : []).filter(r => r?.status === "active");
  if (!list.length) return [];
  const matched = new Set(Array.isArray(ctx.matchedEntityIds) ? ctx.matchedEntityIds : []);
  const tracks  = new Set(Array.isArray(ctx.openTrackIds) ? ctx.openTrackIds : []);
  const threats = (Array.isArray(ctx.activeThreatNames) ? ctx.activeThreatNames : []).filter(n => typeof n === "string");
  const ending  = new Set(Array.isArray(ctx.endingTrackIds) ? ctx.endingTrackIds : []);
  const vowNames = (Array.isArray(ctx.openVowNames) ? ctx.openVowNames : []).filter(n => typeof n === "string");
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
    if (r.kind === "threat" && threats.some(n => sameSubjectName(n, s.name))) return true;
    if (r.kind === "vow" && vowNames.some(n => sameSubjectName(n, s.name))) return true;
    return nameMentioned(s.name, passage);
  };
  const time = (r) => String(r.updatedAt ?? r.createdAt ?? "");
  const first = (r) => (pinned.has(r.id) ? 2 : (inScene(r) ? 1 : 0));
  return list.filter(relevant)
    .sort((a, b) => (first(b) - first(a)) || time(b).localeCompare(time(a)))
    .slice(0, Math.max(0, Number.isInteger(ctx.max) ? ctx.max : MAX_RELEVANT_SKELETONS));
}

/** The seed lines a price that reveals a new enemy carries (resolver.js newEnemySeedLines). */
const NEW_ENEMY_SEED = /^The new enemy — /;

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
      trigger:     "new_enemy",
      label:       "the new enemy this price reveals",
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

/** The moves whose rolled find a plan keeps the meaning of (Phase 4). */
const DISCOVERY_MOVES = Object.freeze({
  make_a_discovery: { trigger: "make_a_discovery", label: "the discovery this move makes" },
  confront_chaos:   { trigger: "confront_chaos",   label: "the chaos this move confronts" },
});

/**
 * Plan requests as they cross the relay from a client: known kinds, bounded
 * refs and seeds, at most PLANS_PER_SIDECAR.
 *
 * @param {*} requests
 * @returns {Array<{ ref: string, kind: string, trigger: string, label: string, oracleSeeds: string[] }>}
 */
export function normalisePlanRequests(requests) {
  if (!Array.isArray(requests)) return [];
  return requests
    .filter(r => r && typeof r.ref === "string" && ID_RE.test(r.ref) && SKELETON_KINDS.includes(r.kind))
    .slice(0, PLANS_PER_SIDECAR)
    .map(r => ({
      ref:         r.ref,
      kind:        r.kind,
      trigger:     typeof r.trigger === "string" ? r.trigger.slice(0, 32) : "",
      label:       text(r.label, SUBJECT_MAX) || "the subject",
      oracleSeeds: (Array.isArray(r.oracleSeeds) ? r.oracleSeeds : []).map(s => text(s, ITEM_MAX)).filter(Boolean).slice(0, SEED_MAX),
      // A request about a known subject (an expedition's track) names it by id.
      ...(normaliseSubject(r.subject) ? { subject: normaliseSubject(r.subject) } : {}),
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
