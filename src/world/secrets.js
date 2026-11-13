/**
 * STARFORGED COMPANION
 * src/world/secrets.js — the narrative skeleton's store (issue #353)
 *
 * The hidden plans the narrator plays toward live in the "World Journal —
 * Secrets" journal: one page per plan, its record in the page's
 * `secretEntry` flag (src/world/skeletons.js has the shape). The journal is
 * made with no player permission (worldJournal.js GM_ONLY_CATEGORIES), and no
 * plan reaches a player-visible card until the GM — or, in Phase 2, the
 * fiction — reveals it.
 *
 * Writes:
 *   - from narration (a sidecar's `plans` / `openQuestions`, the plans a
 *     narration's seeds asked it to decide) — on the canonical GM only, like
 *     every narrator side-data write, and stamped with the narration's id so
 *     an X-Card on it takes the plan back (worldJournal.js
 *     undoNarrationEntries: a plan it made is deleted, one it changed restored);
 *   - from the GM's Secrets panel (edit, reveal now, retire) — any GM, and the
 *     write carries no narration, so the GM owns the plan from then on.
 * Each is one read-modify-write of a page flag, queued on this client.
 *
 * Reads are synchronous over the journal's pages: the narrator's UNREVEALED
 * block (narrator.js buildNarratorExtras, the Private Channel's story) and the
 * panel. Every read is fail-open: no journal is no plans.
 */

import { isCanonicalGM } from "../multiplayer/gmGate.js";
import {
  FLAG_KEYS, findWorldJournal, getOrCreateWorldJournal, writeEntryPage, narrationStamp, recordLoreDiscovery,
} from "./worldJournal.js";
import {
  normaliseSkeleton, normalisePlans, normaliseOpenQuestions, normalisePlanRequests, normaliseReveals,
  normaliseCountdown, applyPlanToSkeleton, applyRevealToSkeleton, sameQuestion, sameSubjectName, nameMentioned,
  SKELETON_KIND_LABELS,
} from "./skeletons.js";

const MODULE_ID = "starforged-companion";

/** The world setting that turns the narrative skeleton on (default on). */
export const SKELETONS_SETTING = "narrativeSkeletons";
/** The world setting that shows a plan's oracle rolls to the table when it is made (default off: shown when its truth is revealed). */
export const SHOW_ROLLS_SETTING = "narrativeSkeletonsShowRolls";

/** Whether the narrative skeleton is on (unregistered — a unit test — is on). */
export function skeletonsEnabled() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, SKELETONS_SETTING) !== false;
  } catch {
    return true;
  }
}

/** Whether a plan's hidden oracle rolls are shown to the table when it is made. */
function hiddenRollsShownAtOnce() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, SHOW_ROLLS_SETTING) === true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

function secretPages() {
  try {
    return findWorldJournal("secrets")?.pages?.contents ?? [];
  } catch {
    return [];
  }
}

const entryOf = (page) => page?.flags?.[MODULE_ID]?.[FLAG_KEYS.secrets] ?? null;

/** The page holding the plan `id` — found by the plan's id, never by the page's name. */
function pageOf(id) {
  return secretPages().find(p => entryOf(p)?.id === id) ?? null;
}

/**
 * Every plan in the Secrets journal, as records (normaliseSkeleton) — the
 * active ones unless `includeInactive`. Fail-open: none on any failure.
 *
 * @param {{ includeInactive?: boolean }} [opts]
 * @returns {Object[]}
 */
export function listSkeletons({ includeInactive = false } = {}) {
  return secretPages()
    .map(p => normaliseSkeleton(entryOf(p)))
    .filter(r => r && (includeInactive || r.status === "active"));
}

/** The plan `id` as a record, or null. */
export function getSkeleton(id) {
  return typeof id === "string" ? normaliseSkeleton(entryOf(pageOf(id))) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE
// ─────────────────────────────────────────────────────────────────────────────

let _writes = Promise.resolve();

/** One page write at a time on this client: each reads the page it changes at its turn. */
function serialiseSecretWrite(task) {
  const run = _writes.then(task, task);
  _writes = run.catch(() => {});
  return run;
}

/** A new plan id. */
function newSkeletonId() {
  const rnd = globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2, 12);
  return `sk-${rnd}`;
}

/** The page's name: "Threat: the escort", "Mystery: Which name are we here to meet?". */
export function skeletonPageName(record) {
  const kind = SKELETON_KIND_LABELS[record?.kind] ?? "Plan";
  const name = record?.kind === "mystery" && record.question ? record.question : (record?.subject?.name ?? "");
  return `${kind}: ${name}`.slice(0, 120);
}

/** Whether this client may make the write: the canonical GM for narration's, any GM for the panel's. */
function mayWrite(byGm) {
  return byGm ? globalThis.game?.user?.isGM === true : isCanonicalGM();
}

/**
 * File a new plan. On the canonical GM (narration), or any GM with `byGm`.
 * Stamped with the narration that made it, for the X-Card.
 *
 * @param {Object} input — a record without an id (normaliseSkeleton's fields)
 * @param {{ narrationId?: string|null, byGm?: boolean }} [opts]
 * @returns {Promise<Object|null>} the record filed, or null when not written
 */
export async function createSkeleton(input, { narrationId = null, byGm = false } = {}) {
  if (!mayWrite(byGm)) return null;
  return serialiseSecretWrite(async () => {
    const now = new Date().toISOString();
    const record = normaliseSkeleton({ ...input, id: newSkeletonId(), createdAt: now, updatedAt: now });
    if (!record) return null;
    const journal = await getOrCreateWorldJournal("secrets");
    if (!journal) return null;
    const data = { ...record, ...narrationStamp(narrationId, null) };
    try {
      const created = await journal.createEmbeddedDocuments("JournalEntryPage", [{
        name:  skeletonPageName(record),
        type:  "text",
        text:  { format: 1, content: "" },
        flags: { [MODULE_ID]: { [FLAG_KEYS.secrets]: data } },
      }]);
      const page = Array.isArray(created) ? created[0] : created;
      if (page) await writeEntryPage(page, FLAG_KEYS.secrets, data);   // its body, for the GM who opens it
      return record;
    } catch (err) {
      console.warn(`${MODULE_ID} | secrets: filing the plan for "${record.subject.name}" failed:`, err?.message ?? err);
      return null;
    }
  });
}

/**
 * Change a plan: `change(record)` returns the next record (or null to leave
 * it). The version it replaces is kept when a narration changed it (for the
 * X-Card); a GM's change owns the plan from then on (worldJournal.js
 * narrationStamp).
 *
 * With `keepStamp` the change is bookkeeping, not a new version (its rolls
 * shown): the plan keeps the narration that made it, and the X-Card on that
 * narration still takes it back.
 *
 * @param {string} id
 * @param {(record: Object) => Object|null} change
 * @param {{ narrationId?: string|null, byGm?: boolean, keepStamp?: boolean }} [opts]
 * @returns {Promise<Object|null>} the record as written, or null
 */
export async function updateSkeleton(id, change, { narrationId = null, byGm = false, keepStamp = false } = {}) {
  if (!mayWrite(byGm)) return null;
  return serialiseSecretWrite(async () => {
    const page = pageOf(id);
    const stored = entryOf(page);
    const record = normaliseSkeleton(stored);
    if (!page || !record) return null;
    const changed = change(record);
    const next = changed ? normaliseSkeleton({ ...changed, id: record.id, createdAt: record.createdAt, updatedAt: new Date().toISOString() }) : null;
    if (!next) return null;
    const stamp = keepStamp
      ? { narrationId: stored.narrationId ?? null, previous: stored.previous ?? null }
      : narrationStamp(narrationId, stored);
    const data = { ...next, ...stamp };
    try {
      await writeEntryPage(page, FLAG_KEYS.secrets, data);
      const name = skeletonPageName(next);
      if (page.name !== name) await page.update?.({ name });
      return next;
    } catch (err) {
      console.warn(`${MODULE_ID} | secrets: updating the plan for "${record.subject.name}" failed:`, err?.message ?? err);
      return null;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FROM NARRATION — the sidecar's plans and open questions
// ─────────────────────────────────────────────────────────────────────────────

/** Rolls for a posed question's hidden answer: Action + Theme and Descriptor + Focus (issue #353 "Where to roll"). */
async function rollMysteryAnswer() {
  try {
    const { rollPaired } = await import("../oracles/roller.js");
    return [
      `Action + Theme: ${rollPaired("action", "theme").combined}`,
      `Descriptor + Focus: ${rollPaired("descriptor", "focus").combined}`,
    ];
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: the question's oracle roll failed:`, err?.message ?? err);
    return [];
  }
}

/**
 * The plan subject and fact a revealed truth becomes in the scene's ledger
 * (issue #353 Phase 2: "a revealed truth is promoted to Lore and the ledger,
 * so it becomes a stated fact"): the plans a sidecar's `reveals` reveal the
 * truth of, that were not revealed before. Read synchronously, for the
 * sidecar apply to add to the narration's own truths — stamped with its id,
 * so the X-Card retracts them with it.
 *
 * @param {Object} sidecar — normaliseSidecar's
 * @returns {Array<{ subject: string, fact: string }>}
 */
export function revealedTruthsOf(sidecar) {
  if (!skeletonsEnabled()) return [];
  const out = [];
  for (const reveal of normaliseReveals(sidecar?.reveals)) {
    if (!reveal.revealed.includes("truth")) continue;
    const record = getSkeleton(reveal.id);
    if (!record || record.status !== "active" || record.truthRevealed || !record.truth) continue;
    out.push(record.kind === "mystery" && record.question
      ? { subject: record.subject.name, fact: `The answer to "${record.question}": ${record.truth}` }
      : { subject: record.subject.name, fact: record.truth });
  }
  return out;
}

/**
 * Apply a narration's plan side-data on the canonical GM (narrator.js
 * applySidecarSideData; a relayed sidecar's too):
 *  1. each plan the narration was asked to decide (`planRequests` — a price
 *     that revealed a new enemy) is filed: as the narrator decided it, or —
 *     its sidecar gave none — with its oracle rolls alone, its truth left for
 *     the next narration to decide ("keep the raw rolls as the skeleton");
 *  2. each other `plans` entry decides or corrects the plan of its id;
 *  3. each `openQuestions` entry not already a mystery of this scene becomes
 *     one, its hidden answer rolled now and decided by a later narration;
 *  4. each `reveals` entry marks what the beat showed (Phase 2): clues shown,
 *     the truth revealed — filed as confirmed lore, and the oracle rolls behind
 *     it shown to the table — a step played, an ending.
 * Every write is stamped with the narration's id. Never throws.
 *
 * @param {Object} sidecar — normaliseSidecar's
 * @param {{ campaignState: Object, narrationId?: string|null, moveId?: string|null, planRequests?: Object[] }} ctx
 * @returns {Promise<{ filed: number, decided: number, questions: number, revealed: number }>}
 */
export async function applyPlanSideData(sidecar, { campaignState, narrationId = null, moveId = null, planRequests = [] } = {}) {
  const out = { filed: 0, decided: 0, questions: 0, revealed: 0 };
  if (!skeletonsEnabled() || !isCanonicalGM()) return out;
  try {
    const plans     = normalisePlans(sidecar?.plans);
    const questions = normaliseOpenQuestions(sidecar?.openQuestions);
    const requests  = normalisePlanRequests(planRequests);
    const reveals   = normaliseReveals(sidecar?.reveals);
    const countdown = normaliseCountdown(sidecar?.countdown);
    if (!plans.length && !questions.length && !requests.length && !reveals.length && !countdown) return out;
    const sceneId   = campaignState?.currentSceneId ?? null;
    const sessionId = campaignState?.currentSessionId ?? null;
    const byId = new Map(plans.map(p => [p.id, p]));

    for (const req of requests) {
      const plan = byId.get(req.ref) ?? null;
      byId.delete(req.ref);
      // A request about a known subject (an expedition's track) keeps it, by
      // id; any other takes the name the narration gave it.
      const subject = req.subject ? { ...req.subject } : { type: "name", id: null, name: plan?.subject || req.label };
      const base = {
        kind: req.kind, subject, oracleSeeds: req.oracleSeeds, sceneId, sessionId,
        createdFrom: { narrationId, moveId, trigger: req.trigger || null },
      };
      const decided = plan ? applyPlanToSkeleton(normaliseSkeleton({ ...base, id: "pending" }), plan) : base;
      const record = req.subject && plan ? { ...decided, subject: { ...req.subject } } : decided;
      const filed = await createSkeleton(record, { narrationId });
      if (filed) {
        out.filed += 1;
        await showRollsIfSet(filed);
        await ensureThreatClock(filed, { narrationId });
      }
    }

    for (const plan of byId.values()) {
      const existing = getSkeleton(plan.id);
      if (!existing || existing.status !== "active") continue;
      const decided = await updateSkeleton(plan.id, r => applyPlanToSkeleton(r, plan), { narrationId });
      if (decided) {
        out.decided += 1;
        await ensureThreatClock(decided, { narrationId });
      }
    }

    for (const q of questions) {
      const known = listSkeletons().some(r => r.kind === "mystery" && r.sceneId === sceneId && sameQuestion(r.question, q.question));
      if (known) continue;
      const filed = await createSkeleton({
        kind: "mystery", subject: { type: "scene", id: sceneId, name: q.about || "the scene" },
        question: q.question, oracleSeeds: await rollMysteryAnswer(), sceneId, sessionId,
        createdFrom: { narrationId, moveId, trigger: "open_question" },
      }, { narrationId });
      if (filed) {
        out.questions += 1;
        await showRollsIfSet(filed);
      }
    }

    for (const reveal of reveals) {
      const before = getSkeleton(reveal.id);
      if (!before || before.status !== "active") continue;
      const truthNow = reveal.revealed.includes("truth") && !before.truthRevealed && !!before.truth;
      const after = await updateSkeleton(reveal.id,
        r => ({ ...applyRevealToSkeleton(r, reveal), ...(truthNow ? { rollsShown: true } : {}) }), { narrationId });
      if (!after) continue;
      out.revealed += 1;
      if (truthNow) await onTruthRevealed(after, { campaignState, narrationId, rollsWereShown: before.rollsShown });
      await paceAfterReveal(before, after);
    }

    // A countdown the prose started becomes a real clock (Phase 3).
    await applyCountdown(countdown, { campaignState, narrationId, moveId });
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: a narration's plans were not applied:`, err?.message ?? err);
  }
  return out;
}

/** A plan's title in the Lore journal: "Threat: the escort", "Mystery: Which name…?". */
function loreTitleOf(record) {
  const subject = record.kind === "mystery" && record.question ? record.question : record.subject.name;
  return `${SKELETON_KIND_LABELS[record.kind] ?? "Plan"}: ${subject}`.slice(0, 120);
}

/**
 * A plan's truth the fiction revealed: filed as confirmed lore (stamped with
 * the narration, so the X-Card retracts it with the reveal), and the oracle
 * rolls behind it shown to the table — "hidden until their truth is revealed,
 * then shown" (decided) — unless they already were.
 */
async function onTruthRevealed(record, { campaignState, narrationId, rollsWereShown }) {
  await recordLoreDiscovery(loreTitleOf(record), {
    text: record.truth, category: "other", confirmed: true, subject: record.subject.name, fact: record.truth,
    ...(narrationId ? { narrationId } : {}),
  }, campaignState).catch(err =>
    console.warn(`${MODULE_ID} | secrets: the revealed truth was not filed as lore:`, err?.message ?? err));
  if (!rollsWereShown) await postRollsCard(record, { narrationId });
}

// ─────────────────────────────────────────────────────────────────────────────
// CLOCKS — a plan's escalation paced, a countdown made real (issue #353 Phase 3)
// ─────────────────────────────────────────────────────────────────────────────

/** How many clocks plans may hold at once — every tension clock turns on each Pay the Price. */
export const MAX_PLAN_CLOCKS = 4;

/** campaignState's clocks, as stored. */
function storedClocks() {
  try {
    const clocks = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState")?.clocks;
    return Array.isArray(clocks) ? clocks : [];
  } catch {
    return [];
  }
}

/** The running clock a plan holds, or null. */
export function planClock(record) {
  if (!record?.clockId) return null;
  return storedClocks().find(c => c?._id === record.clockId && c.active !== false) ?? null;
}

/**
 * A decided threat plan's escalation is paced by a clock (issue #353 "Threat
 * ↔ clock"): when it fills, the narrator plays the next step (narrator.js
 * narrateClockAdvancement). A threat the fiction just revealed is a scene's —
 * a 4-segment tension clock, turned by each Pay the Price; a significant
 * threat from the World Journal is the campaign's — a 6-segment campaign
 * clock, rolled at Begin a Session. Made once, stamped with the narration
 * that decided the plan (an X-Card or a supersede takes it back with the
 * plan), and only while fewer than MAX_PLAN_CLOCKS plan clocks run.
 *
 * @param {Object} record — the plan as written
 * @param {{ narrationId?: string|null }} [opts]
 * @returns {Promise<Object|null>} the clock made, or null
 */
async function ensureThreatClock(record, { narrationId = null } = {}) {
  if (record?.kind !== "threat" || !record.truth || !record.escalation?.some(e => !e.done) || planClock(record)) return null;
  if (storedClocks().filter(c => c?.planId && c.active !== false).length >= MAX_PLAN_CLOCKS) return null;
  try {
    const { createClock } = await import("../clocks/clocks.js");
    const campaignLevel = record.createdFrom?.trigger === "significant_threat";
    const clock = await createClock({
      name: `${record.subject.name} — escalation`.slice(0, 80),
      type: campaignLevel ? "campaign" : "tension", segments: campaignLevel ? 6 : 4,
      narrationId, planId: record.id,
    });
    await updateSkeleton(record.id, r => ({ ...r, clockId: clock._id }), { narrationId });
    return clock;
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: "${record.subject.name}"'s escalation clock was not made:`, err?.message ?? err);
    return null;
  }
}

/**
 * After a beat played a step of a plan with a clock, the clock paces the next
 * one: back to empty while a step is left, retired when none is — or when the
 * plan's story ended, or a countdown's mystery came out. Never throws.
 */
async function paceAfterReveal(before, after) {
  const clock = planClock(after);
  if (!clock) return;
  const played = after.escalation.some((e, i) => e.done && !before.escalation[i]?.done);
  const over = after.status !== "active"
    || !after.escalation.some(e => !e.done) && (played || (after.kind === "mystery" && after.truthRevealed));
  try {
    const clocks = await import("../clocks/clocks.js");
    if (over) await clocks.retireClock(clock._id);
    else if (played) await clocks.adjustClockSegments(clock._id, -clock.segments);
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: the clock of "${after.subject.name}" was not reset:`, err?.message ?? err);
  }
}

/**
 * A countdown the prose started — a count, a deadline — made a real tension
 * clock (issue #353 "When a skeleton is made": Archer's count becomes a real
 * clock). It belongs to the plan its `about` names (by id, or by its
 * subject's name); a countdown about nothing planned becomes a mystery —
 * "what happens when it runs out?", its answer rolled and decided by the next
 * narration. One clock a plan, none for a countdown already running. The GMs
 * are offered to play it as a scene challenge (sceneChallengeOffer.js).
 * Stamped with the narration. Never throws.
 */
async function applyCountdown(countdown, { campaignState, narrationId = null, moveId = null }) {
  if (!countdown) return null;
  try {
    if (storedClocks().some(c => c?.active !== false && sameSubjectName(c.name, countdown.label))) return null;
    const sceneId = campaignState?.currentSceneId ?? null;
    const active = listSkeletons();
    const about = countdown.about;
    let plan = active.find(r => r.id === about)
      ?? (about ? active.find(r => sameSubjectName(r.subject.name, about) || nameMentioned(r.subject.name, about)) : null)
      ?? null;
    if (plan && planClock(plan)) return null;
    if (!plan) {
      plan = await createSkeleton({
        kind: "mystery", subject: { type: "scene", id: sceneId, name: about || countdown.label },
        question: `What happens when ${countdown.label} runs out?`, oracleSeeds: await rollMysteryAnswer(),
        sceneId, sessionId: campaignState?.currentSessionId ?? null,
        createdFrom: { narrationId, moveId, trigger: "countdown" },
      }, { narrationId });
      if (!plan) return null;
    }
    const { createClock } = await import("../clocks/clocks.js");
    const clock = await createClock({ name: countdown.label, type: "tension", segments: countdown.segments, narrationId, planId: plan.id });
    await updateSkeleton(plan.id, r => ({ ...r, clockId: clock._id }), { narrationId });
    const { offerSceneChallenge } = await import("../moves/sceneChallengeOffer.js");
    await offerSceneChallenge({ label: countdown.label, clockId: clock._id, campaignState });
    return clock;
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: the countdown "${countdown.label}" was not made a clock:`, err?.message ?? err);
    return null;
  }
}

/**
 * The plan a clock paces, and what its filling plays (narrator.js
 * narrateClockAdvancement): its next unplayed escalation step, or — a
 * countdown's mystery with no steps left — its answer coming out. Null for a
 * clock no active plan holds.
 *
 * @param {string} clockId
 * @returns {{ plan: Object, step: Object|null, revealsTruth: boolean }|null}
 */
export function planForClock(clockId) {
  if (typeof clockId !== "string" || !clockId) return null;
  const plan = listSkeletons().find(r => r.clockId === clockId) ?? null;
  if (!plan) return null;
  const step = plan.escalation.find(e => !e.done) ?? null;
  return { plan, step, revealsTruth: !step && !!plan.truth && !plan.truthRevealed };
}

/** How a significant threat's agenda is rolled (Action + Theme), for its plan's seeds. */
async function rollThreatAgenda() {
  try {
    const { rollPaired } = await import("../oracles/roller.js");
    return [`Its agenda — Action + Theme: ${rollPaired("action", "theme").combined}`];
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: the threat's oracle roll failed:`, err?.message ?? err);
    return [];
  }
}

/**
 * A threat the detection pass recorded at significant salience or above gets
 * a plan (issue #353 Phase 2, "When a skeleton is made"): what it really is,
 * wants and does next, decided by the next narration it is in play for, from
 * an Action + Theme roll for its agenda. It shares the threat page's id. A
 * plan already filed under its name — a new enemy the narration named — is
 * linked to the page instead of a second one. Canonical GM; stamped with the
 * narration whose capture recorded the threat. Never throws.
 *
 * @param {{ name: string, pageId?: string|null, summary?: string }} threat — recordThreat's result
 * @param {{ campaignState?: Object, narrationId?: string|null }} [ctx]
 * @returns {Promise<Object|null>} the plan filed or linked, or null
 */
export async function planSignificantThreat(threat, { campaignState = null, narrationId = null } = {}) {
  if (!skeletonsEnabled() || !isCanonicalGM()) return null;
  const name = typeof threat?.name === "string" ? threat.name.trim() : "";
  if (!name) return null;
  const pageId = typeof threat.pageId === "string" ? threat.pageId : null;
  try {
    const all = listSkeletons({ includeInactive: true });
    const byPage = pageId ? all.find(r => r.subject.type === "threat" && r.subject.id === pageId) : null;
    if (byPage) return null;
    const byName = all.find(r => r.status === "active" && ["threat", "npcAgenda"].includes(r.kind) && sameSubjectName(r.subject.name, name));
    if (byName) {
      if (byName.subject.type !== "name" || !pageId) return null;
      return updateSkeleton(byName.id, r => ({ ...r, subject: { type: "threat", id: pageId, name: r.subject.name } }), { narrationId });
    }
    return createSkeleton({
      kind: "threat", subject: { type: "threat", id: pageId, name },
      oracleSeeds: await rollThreatAgenda(),
      sceneId: campaignState?.currentSceneId ?? null, sessionId: campaignState?.currentSessionId ?? null,
      createdFrom: { narrationId, moveId: null, trigger: "significant_threat" },
    }, { narrationId });
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: the threat "${name}" was not planned:`, err?.message ?? err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOWN TO THE TABLE — a plan's rolls, and its truth when revealed
// ─────────────────────────────────────────────────────────────────────────────

/** The plan's oracle rolls as one line ("Character Role: Scout; …"), '' for none. */
function rollsLine(record) {
  return (record?.oracleSeeds ?? []).join("; ");
}

/**
 * The table's card of a plan's oracle rolls ("the oracle, behind the
 * scenes"): posted when its truth is revealed, or — "show hidden rolls" on —
 * when it is made. Carries the narration that showed it.
 */
async function postRollsCard(record, { narrationId = null } = {}) {
  if (!record?.oracleSeeds?.length) return null;
  return postSecretCard(
    `The oracle, behind the scenes`,
    `<p><strong>${escapeHtml(record.kind === "mystery" ? record.question : record.subject.name)}</strong></p><p>${escapeHtml(rollsLine(record))}</p>`,
    { secretRollsCard: true, skeletonId: record.id, ...(narrationId ? { narrationId } : {}) },
  );
}

/** With "show hidden rolls" on, a new plan's rolls are posted to the table at once (issue #353 "Visibility"). */
async function showRollsIfSet(record) {
  if (!hiddenRollsShownAtOnce() || !record?.oracleSeeds?.length) return;
  const posted = await postRollsCard(record);
  if (posted) await updateSkeleton(record.id, r => ({ ...r, rollsShown: true }), { keepStamp: true });
}

/**
 * The GM's "Reveal now" (the Secrets panel): the plan's truth is told to the
 * table on a card with the oracle rolls behind it ("the oracle said: …"), and
 * becomes confirmed lore, so every later narration holds it as fact. Any GM.
 *
 * @param {string} id
 * @returns {Promise<Object|null>} the plan as written, or null
 */
export async function revealSkeletonNow(id) {
  if (globalThis.game?.user?.isGM !== true) return null;
  const record = getSkeleton(id);
  if (!record || !record.truth) return null;
  const subject = record.kind === "mystery" ? record.question : record.subject.name;
  const rolls = record.rollsShown ? "" : rollsLine(record);
  await postSecretCard(
    `Revealed: ${escapeHtml(subject)}`,
    `<p>${escapeHtml(record.truth)}</p>${rolls ? `<p><em>The oracle said: ${escapeHtml(rolls)}</em></p>` : ""}`,
    { secretRevealCard: true, skeletonId: record.id },
  );
  const campaignState = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? null;
  await recordLoreDiscovery(loreTitleOf(record), {
    text: record.truth, category: "other", confirmed: true, subject: record.subject.name, fact: record.truth,
  }, campaignState).catch(err =>
    console.warn(`${MODULE_ID} | secrets: the revealed truth was not filed as lore:`, err?.message ?? err));
  return updateSkeleton(id, r => ({ ...r, truthRevealed: true, rollsShown: true }), { byGm: true });
}

/** The GM's "Retire": the plan leaves play (kept in the journal). Any GM. */
export async function retireSkeleton(id) {
  return updateSkeleton(id, r => ({ ...r, status: "retired" }), { byGm: true });
}

/**
 * The GM's edit of a plan from the Secrets panel: the fields given replace
 * the plan's (lists one item per line). Any GM; the plan is the GM's after.
 *
 * @param {string} id
 * @param {{ subject?: string, truth?: string, wants?: string, knows?: string,
 *           escalation?: string[], clues?: string[], resolutions?: string[] }} fields
 * @returns {Promise<Object|null>}
 */
export async function editSkeleton(id, fields = {}) {
  // An item kept word for word keeps whether it was played or shown.
  const relist = (lines, old, prefix, flag) => lines.map((t, i) => ({
    id: `${prefix}${i + 1}`, text: t, [flag]: old.some(o => o.text === t && o[flag] === true),
  }));
  return updateSkeleton(id, (r) => {
    const next = { ...r, subject: { ...r.subject } };
    if (typeof fields.subject === "string" && fields.subject.trim()) next.subject.name = fields.subject;
    for (const f of ["truth", "wants", "knows"]) if (typeof fields[f] === "string") next[f] = fields[f];
    if (Array.isArray(fields.escalation)) next.escalation = relist(fields.escalation, r.escalation, "e", "done");
    if (Array.isArray(fields.clues)) next.clues = relist(fields.clues, r.clues, "c", "revealed");
    if (Array.isArray(fields.resolutions)) next.resolutions = fields.resolutions;
    return next;
  }, { byGm: true });
}

async function postSecretCard(title, body, flags) {
  try {
    return await globalThis.ChatMessage?.create?.({
      content: `<div class="sf-card sf-card--secret"><div class="sf-card-header">${title}</div><div class="sf-card-body">${body}</div></div>`,
      flags:   { [MODULE_ID]: { ...flags } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: card post failed:`, err?.message ?? err);
    return null;
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
