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
  normaliseNewThreats, withAlias, BEING_KINDS,
  SKELETON_KIND_LABELS,
} from "./skeletons.js";

import { sameSubject, personNameMatch } from "../entities/nameMatch.js";

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

/**
 * What the GM's "has a plan" markers need (issue #353 Phase 4 — "subject
 * cards show a small marker for the GM, with no content"): the subject ids
 * and names of the active plans. Never their content. Fail-open.
 *
 * @returns {{ ids: Set<string>, names: string[] }}
 */
export function plannedSubjects() {
  const plans = listSkeletons();
  return {
    ids:   new Set(plans.map(r => r.subject.id).filter(Boolean)),
    names: plans.map(r => r.subject.name).filter(Boolean),
  };
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
  // A plan filed with its rolls but nothing decided gets its one re-roll now,
  // for the narration that decides it (issue #353 "one re-roll").
  const reroll = !input?.truth && !input?.reroll && Array.isArray(input?.oracleSeeds) && input.oracleSeeds.length
    ? await rollReroll() : "";
  return serialiseSecretWrite(async () => {
    const now = new Date().toISOString();
    const record = normaliseSkeleton({ ...input, ...(reroll ? { reroll } : {}), id: newSkeletonId(), createdAt: now, updatedAt: now });
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
// ONE PLAN A SUBJECT (issue #354 P2-30)
// ─────────────────────────────────────────────────────────────────────────────
//
// A plan was matched to its subject by the page or card it links, or by its
// exact name, articles aside. One enemy named three ways — a price's "the
// escort", a threat page's "Escort breaching the blockade: imminent", an NPC
// card's "The Escort" — got three plans, each free to decide a different
// truth: the incoherence the skeleton exists to prevent. Names are now
// matched the way the entity gates match them (entities/nameMatch.js, shared
// with issue #354 P2-16 / P2-17), and a plan that names a subject already
// planned is merged into that plan. Names with no word in common cannot be
// matched in code: only someone who read the scene knows "the second
// presence" is the escort. So the narrator says so — a plan it is asked to
// decide may answer `sameAs` with the id of the plan the subject already has
// (it is shown them under ALREADY PLANNED), and that plan keeps the other
// name as an alias (planAsAnother, applyPlanSideData).

/**
 * Every name a plan's subject goes by: the one it was filed under, the
 * others the narrator said are the same subject (`aliases`), and — a plan
 * linked to something by id — that thing's own name now: its card's (an NPC
 * or a place the GM may have renamed since), its Threats page's.
 *
 * @param {Object} record — normaliseSkeleton's
 * @returns {string[]}
 */
function subjectNames(record) {
  const names = [record?.subject?.name, ...(Array.isArray(record?.aliases) ? record.aliases : [])];
  const id = record?.subject?.id ?? null;
  try {
    if (id && record.subject.type === "entity") names.push(globalThis.game?.actors?.get?.(id)?.name);
    if (id && record.subject.type === "threat") {
      const page = (findWorldJournal("threats")?.pages?.contents ?? []).find(p => p?.id === id);
      names.push(page?.flags?.[MODULE_ID]?.[FLAG_KEYS.threats]?.name ?? page?.name);
    }
  } catch (err) {
    console.debug?.(`${MODULE_ID} | secrets: a plan's linked name could not be read:`, err?.message ?? err);
  }
  return [...new Set(names.filter(n => typeof n === "string" && n.trim()).map(n => n.trim()))];
}

/**
 * Whether a plan is about the subject a name names: one of the plan's names
 * (subjectNames) is that name, a variant of it, or its start or end
 * (nameMatch.js sameSubject) — and, for an NPC's agenda, either name of the
 * person ("Vuldar" for Vuldar Archer, personNameMatch).
 *
 * @param {Object} record — normaliseSkeleton's
 * @param {string} name
 * @returns {boolean}
 */
export function planIsAbout(record, name) {
  if (typeof name !== "string" || !name.trim()) return false;
  return subjectNames(record).some(n => sameSubject(n, name) || (record.kind === "npcAgenda" && !!personNameMatch(n, name)));
}

/**
 * The active plan a new one about `name` would double: one of the same kind —
 * or, for a being, either being kind — that is about that subject
 * (planIsAbout). null when the subject has no plan.
 *
 * @param {string} name
 * @param {string} kind — the plan about to be filed
 * @returns {Object|null}
 */
function activePlanAbout(name, kind) {
  const kinds = BEING_KINDS.includes(kind) ? BEING_KINDS : [kind];
  return listSkeletons().find(r => kinds.includes(r.kind) && planIsAbout(r, name)) ?? null;
}

/**
 * A plan the narration decided for a subject that already has one, laid onto
 * that plan (applyPlanSideData): an undecided plan is decided by it; a decided
 * one keeps its truth and every list it has, and takes only what it lacked —
 * two plans for one thing could hold two truths. The subject keeps the name
 * it was planned under.
 *
 * @param {Object} record — the plan the subject has
 * @param {Object} plan — normalisePlans'
 * @returns {Object} the next record
 */
function mergePlanInto(record, plan) {
  if (!record.truth) return applyPlanToSkeleton(record, { ...plan, subject: "" });
  return applyPlanToSkeleton(record, {
    ...plan,
    subject:     "",
    truth:       "",
    wants:       record.wants ? "" : plan.wants,
    knows:       record.knows ? "" : plan.knows,
    escalation:  record.escalation.length ? [] : plan.escalation,
    clues:       record.clues.length ? [] : plan.clues,
    resolutions: record.resolutions.length ? [] : plan.resolutions,
    rerolled:    "",
  });
}

/**
 * The active plan of a being a `sameAs` answer points at, for a plan of
 * `kind` about to be decided — null when the id names none, or either is not
 * a being's plan (a vow or a mystery is never "the same as" an enemy).
 *
 * @param {string} id — normalisePlans' `sameAs`
 * @param {string} kind
 * @returns {Object|null}
 */
function plannedAs(id, kind) {
  if (!id || !BEING_KINDS.includes(kind)) return null;
  const target = getSkeleton(id);
  return target && target.status === "active" && BEING_KINDS.includes(target.kind) ? target : null;
}

/**
 * A plan waiting to be decided is, by the narrator's say, a subject that
 * already has one (issue #354 P2-30): the plan it has takes what the answer
 * adds and the waiting plan's name as another of its names — and its link to
 * a Threats page or an NPC's card when it had none of its own — and the
 * waiting plan is retired. Only for a plan not yet decided: a decided
 * duplicate holds a truth of its own, which is a GM's to Retire. Both writes
 * carry the narration, so the X-Card on it puts both back.
 *
 * @param {Object} waiting — the undecided plan (its id is the answer's)
 * @param {Object} plan — normalisePlans', with `sameAs`
 * @param {{ narrationId?: string|null }} [opts]
 * @returns {Promise<Object|null>} the plan it joined, as written
 */
async function planAsAnother(waiting, plan, { narrationId = null } = {}) {
  if (waiting.truth) return null;
  const target = plannedAs(plan.sameAs, waiting.kind);
  if (!target || target.id === waiting.id) return null;
  const merged = await updateSkeleton(target.id, r => {
    let next = withAlias(withAlias(mergePlanInto(r, plan), waiting.subject.name), plan.subject);
    for (const alias of waiting.aliases ?? []) next = withAlias(next, alias);
    // A plan known only by name takes the waiting plan's page or card.
    if (next.subject.type === "name" && waiting.subject.id && waiting.subject.type !== "name") {
      next = { ...next, subject: { type: waiting.subject.type, id: waiting.subject.id, name: next.subject.name } };
    }
    return next;
  }, { narrationId });
  if (!merged) return null;
  await updateSkeleton(waiting.id, r => ({ ...r, status: "retired" }), { narrationId });
  await ensureThreatClock(merged, { narrationId });
  return merged;
}

/** A player character's name, or part of one: never an enemy to plan (the acting PC named in a sidecar). */
async function namesPlayerCharacter(name) {
  try {
    const { getPlayerActors } = await import("../character/actorBridge.js");
    return getPlayerActors().some(a => typeof a?.name === "string" && !!personNameMatch(a.name, name));
  } catch {
    return false;
  }
}

/**
 * An enemy or danger a narration introduced gets a plan (issue #354 P2-29):
 * a `threat` plan under the name the prose gave it, with a Character Role,
 * Goal and Disposition rolled once — what a price's "A new enemy is revealed"
 * rolls (resolver.js newEnemySeedLines) — and no truth, so the next narration
 * it is in play for decides it under DECIDE NOW. Nothing is filed for a
 * subject already planned under any name it goes by (a resolved or retired
 * plan included: its story was told), or for a player character. Canonical
 * GM. Never throws.
 *
 * @param {string} name — the name the prose uses for it
 * @param {{ campaignState?: Object|null, narrationId?: string|null, moveId?: string|null }} [ctx]
 * @returns {Promise<Object|null>} the plan filed, or null
 */
async function planNarratedThreat(name, { campaignState = null, narrationId = null, moveId = null } = {}) {
  if (!skeletonsEnabled() || !isCanonicalGM()) return null;
  const subject = typeof name === "string" ? name.trim() : "";
  if (!subject || await namesPlayerCharacter(subject)) return null;
  try {
    if (listSkeletons({ includeInactive: true }).some(r => BEING_KINDS.includes(r.kind) && planIsAbout(r, subject))) return null;
    const { rollOracle } = await import("../oracles/roller.js");
    const seeds = [];
    for (const [id, label] of [["character_role", "Character Role"], ["character_goal", "Character Goal"], ["character_disposition", "Character Disposition"]]) {
      const result = rollOracle(id)?.result;
      if (result && result !== "—") seeds.push(`${label}: ${result}`);
    }
    return await createSkeleton({
      kind: "threat", subject: { type: "name", id: null, name: subject }, oracleSeeds: seeds,
      sceneId: campaignState?.currentSceneId ?? null, sessionId: campaignState?.currentSessionId ?? null,
      createdFrom: { narrationId, moveId, trigger: "narrated_enemy" },
    }, { narrationId });
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: the narrated enemy "${subject}" was not planned:`, err?.message ?? err);
    return null;
  }
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
 *  5. each `newThreats` entry — an enemy or danger the prose introduced — not
 *     already planned under any of its names gets a `threat` plan, its
 *     Character Role, Goal and Disposition rolled now and its truth left for
 *     the next narration to decide (issue #354 P2-29).
 * A plan answered `sameAs` (steps 1 and 2) is not decided again: it joins the
 * plan its subject already has (issue #354 P2-30).
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
    const newThreats = normaliseNewThreats(sidecar?.newThreats);
    if (!plans.length && !questions.length && !requests.length && !reveals.length && !countdown && !newThreats.length) return out;
    const sceneId   = campaignState?.currentSceneId ?? null;
    const sessionId = campaignState?.currentSessionId ?? null;
    const byId = new Map(plans.map(p => [p.id, p]));

    for (const req of requests) {
      const plan = byId.get(req.ref) ?? null;
      byId.delete(req.ref);
      // The subject the narration named already has a plan (issue #354
      // P2-30) — by a name the two share, or by the narrator's own say
      // (`sameAs`): this decision joins it — no second plan, no second clock.
      const planned = req.subject ? null
        : (plannedAs(plan?.sameAs, req.kind) ?? (plan?.subject ? activePlanAbout(plan.subject, req.kind) : null));
      if (planned) {
        const merged = await updateSkeleton(planned.id, r => withAlias(mergePlanInto(r, plan), plan.subject), { narrationId });
        if (merged) {
          out.decided += 1;
          await ensureThreatClock(merged, { narrationId });
        }
        continue;
      }
      // A request about a known subject (an expedition's track) keeps it, by
      // id; any other takes the name the narration gave it.
      const subject = req.subject ? { ...req.subject } : { type: "name", id: null, name: plan?.subject || req.label };
      const base = {
        kind: req.kind, subject, oracleSeeds: req.oracleSeeds, sceneId, sessionId,
        ...(req.reroll ? { reroll: req.reroll } : {}),
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
      // A plan waiting to be decided that the narrator says is a subject
      // already planned (issue #354 P2-30) joins that plan, and is retired.
      if (plan.sameAs) {
        if (await planAsAnother(existing, plan, { narrationId })) out.decided += 1;
        continue;
      }
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

    // An enemy the prose introduced gets a plan (issue #354 P2-29) — after
    // the plans above, so one this same narration decided is found by name.
    for (const threat of newThreats) {
      const filed = await planNarratedThreat(threat.name, { campaignState, narrationId, moveId });
      if (filed) {
        out.filed += 1;
        await showRollsIfSet(filed);
      }
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
      ?? (about ? active.find(r => planIsAbout(r, about) || nameMentioned(r.subject.name, about)) : null)
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

// ─────────────────────────────────────────────────────────────────────────────
// NPCs AND VOWS (issue #353 Phase 4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The NPC card (Actor) of a connection record createConnection returned: its
 * id and its record as stored now (the Auto-Seed may have rolled its goal and
 * role since), or null.
 */
async function connectionCard(record) {
  if (!record?._id) return null;
  try {
    const { iterEntityDocuments } = await import("../entities/registry.js");
    for (const { document, data } of iterEntityDocuments("connection")) {
      if (data?._id === record._id) return document?.id ? { id: document.id, data } : null;
    }
  } catch (err) {
    console.debug?.(`${MODULE_ID} | secrets: the connection's card could not be found:`, err?.message ?? err);
  }
  return null;
}

/**
 * A significant NPC gets an agenda plan (issue #353 "When a skeleton is
 * made": a connection made, or a named NPC the GM confirmed): who they really
 * are and what they hide, wants (their rolled goal), knows, how they act if
 * ignored or crossed. Its rolls — their goal, a disposition, and an Action +
 * Theme for what they hide — wait for the next narration they are in play
 * for to decide it (DECIDE NOW). About the NPC's card, by id; one plan an
 * NPC. Canonical GM; stamped with the narration whose capture made them.
 * Never throws.
 *
 * @param {Object} record — the connection record (createConnection's)
 * @param {{ campaignState?: Object|null, narrationId?: string|null, trigger?: string }} [ctx]
 * @returns {Promise<Object|null>} the plan filed, or null
 */
export async function planNpcAgenda(record, { campaignState = null, narrationId = null, trigger = "connection" } = {}) {
  if (!skeletonsEnabled() || !isCanonicalGM()) return null;
  const name = typeof record?.name === "string" ? record.name.trim() : "";
  if (!name) return null;
  try {
    const card = await connectionCard(record);
    const actorId = card?.id ?? null;
    const all = listSkeletons({ includeInactive: true });
    if (all.some(r => actorId && r.subject.id === actorId)) return null;
    // A plan already about them under a name — the enemy a price revealed,
    // the threat they were recorded as — is theirs (issue #354 P2-30): it is
    // linked to their card, and no agenda is filed beside it. The link keeps
    // the plan's own narration stamp when no narration made this one.
    const theirs = all.find(r => r.status === "active" && BEING_KINDS.includes(r.kind) && planIsAbout(r, name));
    if (theirs) {
      if (theirs.subject.type !== "name" || !actorId) return null;
      return await updateSkeleton(theirs.id, r => ({ ...r, subject: { type: "entity", id: actorId, name: r.subject.name } }),
        { narrationId, keepStamp: !narrationId });
    }
    // An agenda of theirs that was resolved or retired is not planned again.
    if (all.some(r => r.kind === "npcAgenda" && planIsAbout(r, name))) return null;
    const { rollOracle, rollPaired } = await import("../oracles/roller.js");
    const seeds = [];
    const goal = [card?.data?.goal, record.goal].find(v => typeof v === "string" && v.trim());
    const role = [card?.data?.role, record.role].find(v => typeof v === "string" && v.trim());
    if (goal) seeds.push(`Their goal: ${goal.trim()}`);
    if (role) seeds.push(`Their role: ${role.trim()}`);
    const disposition = rollOracle("character_disposition")?.result;
    if (disposition && disposition !== "—") seeds.push(`Character Disposition: ${disposition}`);
    seeds.push(`What they hide — Action + Theme: ${rollPaired("action", "theme").combined}`);
    return await createSkeleton({
      kind: "npcAgenda", subject: { type: actorId ? "entity" : "name", id: actorId, name },
      oracleSeeds: seeds, sceneId: campaignState?.currentSceneId ?? null, sessionId: campaignState?.currentSessionId ?? null,
      createdFrom: { narrationId, moveId: null, trigger },
    }, { narrationId });
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: ${name}'s agenda was not planned:`, err?.message ?? err);
    return null;
  }
}

/**
 * File a plan a narration was asked to decide but never wrote — its vow scene
 * was off or failed — with its rolls alone, for the next narration it is in
 * play for to decide. A plan already filed for its subject (the narration
 * did file it) is left. Canonical GM. Never throws.
 *
 * @param {Object} request — a plan request (normalisePlanRequests' shape)
 * @param {{ campaignState?: Object|null }} [ctx]
 * @returns {Promise<Object|null>}
 */
export async function fileRequestedPlan(request, { campaignState = null } = {}) {
  if (!skeletonsEnabled() || !isCanonicalGM()) return null;
  const [req] = normalisePlanRequests([request]);
  if (!req) return null;
  const name = req.subject?.name ?? req.label;
  if (listSkeletons({ includeInactive: true }).some(r => r.kind === req.kind
    && ((req.subject?.id && r.subject.id === req.subject.id) || planIsAbout(r, name)))) return null;
  return createSkeleton({
    kind: req.kind, subject: req.subject ?? { type: "name", id: null, name }, oracleSeeds: req.oracleSeeds,
    sceneId: campaignState?.currentSceneId ?? null, sessionId: campaignState?.currentSessionId ?? null,
    createdFrom: { narrationId: null, moveId: null, trigger: req.trigger || null },
  });
}

/**
 * One re-roll for a plan awaiting its decision: an Action + Theme, the
 * oracle Starforged asks "what does it mean?" of. '' when the roll fails.
 */
export async function rollReroll() {
  try {
    const { rollPaired } = await import("../oracles/roller.js");
    const pair = rollPaired("action", "theme")?.combined;
    return pair ? `Action + Theme: ${pair}` : "";
  } catch {
    return "";
  }
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
    // By any name the subject goes by (issue #354 P2-30): a variant of the
    // threat's name is the same threat's plan.
    const byName = all.find(r => r.status === "active" && BEING_KINDS.includes(r.kind) && planIsAbout(r, name));
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
