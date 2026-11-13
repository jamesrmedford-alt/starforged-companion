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
  normaliseSkeleton, normalisePlans, normaliseOpenQuestions, normalisePlanRequests, applyPlanToSkeleton,
  sameQuestion, SKELETON_KIND_LABELS,
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
 * Apply a narration's plan side-data on the canonical GM (narrator.js
 * applySidecarSideData; a relayed sidecar's too):
 *  1. each plan the narration was asked to decide (`planRequests` — a price
 *     that revealed a new enemy) is filed: as the narrator decided it, or —
 *     its sidecar gave none — with its oracle rolls alone, its truth left for
 *     the next narration to decide ("keep the raw rolls as the skeleton");
 *  2. each other `plans` entry decides or corrects the plan of its id;
 *  3. each `openQuestions` entry not already a mystery of this scene becomes
 *     one, its hidden answer rolled now and decided by a later narration.
 * Every write is stamped with the narration's id. Never throws.
 *
 * @param {Object} sidecar — normaliseSidecar's
 * @param {{ campaignState: Object, narrationId?: string|null, moveId?: string|null, planRequests?: Object[] }} ctx
 * @returns {Promise<{ filed: number, decided: number, questions: number }>}
 */
export async function applyPlanSideData(sidecar, { campaignState, narrationId = null, moveId = null, planRequests = [] } = {}) {
  const out = { filed: 0, decided: 0, questions: 0 };
  if (!skeletonsEnabled() || !isCanonicalGM()) return out;
  try {
    const plans     = normalisePlans(sidecar?.plans);
    const questions = normaliseOpenQuestions(sidecar?.openQuestions);
    const requests  = normalisePlanRequests(planRequests);
    if (!plans.length && !questions.length && !requests.length) return out;
    const sceneId   = campaignState?.currentSceneId ?? null;
    const sessionId = campaignState?.currentSessionId ?? null;
    const byId = new Map(plans.map(p => [p.id, p]));

    for (const req of requests) {
      const plan = byId.get(req.ref) ?? null;
      byId.delete(req.ref);
      const base = {
        kind: req.kind, subject: { type: "name", id: null, name: plan?.subject || req.label },
        oracleSeeds: req.oracleSeeds, sceneId, sessionId,
        createdFrom: { narrationId, moveId, trigger: req.trigger || null },
      };
      const record = plan ? applyPlanToSkeleton(normaliseSkeleton({ ...base, id: "pending" }), plan) : base;
      const filed = await createSkeleton(record, { narrationId });
      if (filed) {
        out.filed += 1;
        await showRollsIfSet(filed);
      }
    }

    for (const plan of byId.values()) {
      const existing = getSkeleton(plan.id);
      if (!existing || existing.status !== "active") continue;
      if (await updateSkeleton(plan.id, r => applyPlanToSkeleton(r, plan), { narrationId })) out.decided += 1;
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
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: a narration's plans were not applied:`, err?.message ?? err);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOWN TO THE TABLE — a plan's rolls, and its truth when revealed
// ─────────────────────────────────────────────────────────────────────────────

/** The plan's oracle rolls as one line ("Character Role: Scout; …"), '' for none. */
function rollsLine(record) {
  return (record?.oracleSeeds ?? []).join("; ");
}

/** With "show hidden rolls" on, a new plan's rolls are posted to the table at once (issue #353 "Visibility"). */
async function showRollsIfSet(record) {
  if (!hiddenRollsShownAtOnce() || !record?.oracleSeeds?.length) return;
  const posted = await postSecretCard(
    `The oracle, behind the scenes`,
    `<p><strong>${escapeHtml(record.kind === "mystery" ? record.question : record.subject.name)}</strong></p><p>${escapeHtml(rollsLine(record))}</p>`,
    { secretRollsCard: true },
  );
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
  await recordLoreDiscovery(`${SKELETON_KIND_LABELS[record.kind]}: ${subject}`.slice(0, 120), {
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
