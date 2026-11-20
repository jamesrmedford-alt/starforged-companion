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
import { isNarrationXCarded } from "../context/safety.js";
import {
  FLAG_KEYS, findWorldJournal, getOrCreateWorldJournal, writeEntryPage, narrationStamp, recordLoreDiscovery,
  undoNarrationEntries,
} from "./worldJournal.js";
import {
  normaliseSkeleton, normalisePlans, normaliseOpenQuestions, normalisePlanRequests, normaliseReveals,
  normaliseCountdown, applyPlanToSkeleton, applyRevealToSkeleton, sameQuestion, sameSubjectName, nameMentioned,
  normaliseNewThreats, withAlias, BEING_KINDS, planInPlay, isPlanRequestLabel, selectRelevantSkeletons,
  MAX_RELEVANT_SKELETONS, SKELETON_KIND_LABELS, PLAN_REQUESTS_PER_NARRATION,
} from "./skeletons.js";
import { GM_RELAY_SOCKET, hasActiveGM } from "../multiplayer/gmRelay.js";

import { sameSubject, personNameMatch, withoutTitle, isBareTitle } from "../entities/nameMatch.js";
import { reportSnapshotEvent } from "../narration/snapshotEvents.js";

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

/**
 * The Secrets journal's pages — on a GM's client only (issue #362 D1, the
 * maintainer's answer A). Every plan read goes through here (listSkeletons,
 * getSkeleton, plannedSubjects, planForClock …), so a player's client reads
 * no plan whether or not Foundry delivers it an ownership-NONE journal (never
 * checked live; the simulated table shares journals): a player-key
 * narration's UNREVEALED, the Private Channel's story and the Session panel
 * read the plans there, and a Private Channel request carried a plan's truth
 * from a player's browser. What a player-run prompt is decided to read comes
 * from the canonical GM (requestPlansInPlay); what the table may see of the
 * plans, from the view the canonical GM writes (plansShownToTable).
 */
function secretPages() {
  if (globalThis.game?.user?.isGM !== true) return [];
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
// WHAT A PLAYER'S CLIENT IS GIVEN (issue #362 D1)
// ─────────────────────────────────────────────────────────────────────────────
//
// A player's client reads no plan (secretPages). Two of its readers keep what
// they were decided to have, from the canonical GM:
//   - the Private Channel reads the plans in play for the player's message
//     (decided, issue #353): asked of the canonical GM over the module socket,
//     as an oracle question's odds are (oracleConsult.js) — only the decided
//     plans the message and the scene bring into play, never the store;
//   - the Session panel's "What's open" shows the table what it has been
//     shown (issue #353 R4): the canonical GM keeps that view in a world
//     setting of its own, rewritten when it changes.
// Narration on a player's own key gets no plan, as it gets no world snapshot
// (known-issues SNAPSHOT-PLAYER-KEY).

/** The module-socket kinds of a player's ask for the plans in play and the GM's answer (not gmRelay actions: an answer comes back). */
export const PLANS_ASK_KIND    = "plansInPlay.ask";
export const PLANS_ANSWER_KIND = "plansInPlay.answer";

/** How long a player's Private Channel turn waits for the GM's plans; past it, the turn reads none. */
export const PLANS_WAIT_MS = 4_000;

const PLANS_TEXT_MAX = 2_000;
const PLANS_IDS_MAX  = 24;

const _plansWaiting = new Map();   // ask id → resolve
let _plansSocketInstalled = false;

/**
 * The decided plans a beat on a player's client brings into play — what the
 * Private Channel's story shows under UNREVEALED, chosen as the main narrator
 * chooses (selectRelevantSkeletons: this scene's, its frame's, the entities
 * and names the message matches) — on the GM's client, as records holding
 * only what UNREVEALED renders: never their oracle rolls, re-roll, clock or
 * provenance. None with the narrative skeleton off. Never throws.
 *
 * @param {{ text?: string, matchedEntityIds?: string[] }} ctx
 * @returns {Object[]}
 */
function plansInPlayFor({ text = "", matchedEntityIds = [] } = {}) {
  if (!skeletonsEnabled()) return [];
  try {
    const stored = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? null;
    return selectRelevantSkeletons(listSkeletons(), {
      sceneId:          stored?.currentSceneId ?? null,
      frame:            stored?.sceneFrame ?? null,
      matchedEntityIds: (Array.isArray(matchedEntityIds) ? matchedEntityIds : []).filter(id => typeof id === "string").slice(0, PLANS_IDS_MAX),
      text:             typeof text === "string" ? text.slice(0, PLANS_TEXT_MAX) : "",
    }).filter(r => r.truth).map(r => ({
      id: r.id, kind: r.kind, subject: r.subject, aliases: r.aliases, question: r.question, status: r.status,
      truth: r.truth, truthRevealed: r.truthRevealed, wants: r.wants, knows: r.knows,
      // A clue as UNREVEALED renders it: not the narration that showed it.
      escalation: r.escalation, clues: r.clues.map(c => ({ id: c.id, text: c.text, revealed: c.revealed })), resolutions: r.resolutions,
    }));
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: the plans in play could not be read:`, err?.message ?? err);
    return [];
  }
}

/**
 * Install the plans-in-play listener on the module socket (idempotent; every
 * client, at ready — index.js). The canonical GM answers an ask with the
 * plans it brings into play (plansInPlayFor); the client that asked takes the
 * answer carrying its ask's id. The answer is a socket message, which reaches
 * every connected client (Foundry's module socket cannot address one); only
 * the asker takes it. Accepted as console-level exposure, like the shared
 * world data (the maintainer's answer, issue #364 PLANS-RELAY-BROADCAST;
 * decisions.md → "Issue #364").
 */
export function registerPlansInPlaySocket() {
  if (_plansSocketInstalled) return;
  const socket = globalThis.game?.socket ?? null;
  if (!socket?.on) return;
  _plansSocketInstalled = true;
  socket.on(GM_RELAY_SOCKET, (message) => {
    if (message?.kind === PLANS_ANSWER_KIND) {
      const resolve = typeof message.id === "string" ? _plansWaiting.get(message.id) : null;
      if (resolve) resolve(Array.isArray(message.plans) ? message.plans : []);
      return;
    }
    if (message?.kind !== PLANS_ASK_KIND || !isCanonicalGM()) return;
    const id = typeof message.id === "string" && /^[\w-]{1,64}$/.test(message.id) ? message.id : null;
    if (!id) return;
    const plans = plansInPlayFor({ text: message.text, matchedEntityIds: message.matchedEntityIds });
    globalThis.game?.socket?.emit?.(GM_RELAY_SOCKET, { kind: PLANS_ANSWER_KIND, id, plans });
  });
}

/**
 * The decided plans a player's Private Channel turn brings into play, asked of
 * the canonical GM, whose client holds them (issue #362 D1): records as
 * selectRelevantSkeletons gives them, at most MAX_RELEVANT_SKELETONS. None —
 * the turn is narrated without plans — with no GM connected, no answer within
 * `waitMs`, or the narrative skeleton off. Never throws.
 *
 * @param {{ text?: string, matchedEntityIds?: string[] }} ctx — the player's message and the entities it names
 * @param {{ waitMs?: number }} [opts]
 * @returns {Promise<Object[]>}
 */
export async function requestPlansInPlay({ text = "", matchedEntityIds = [] } = {}, { waitMs = PLANS_WAIT_MS } = {}) {
  if (!skeletonsEnabled()) return [];
  const socket = globalThis.game?.socket ?? null;
  if (!socket?.emit || !hasActiveGM()) return [];
  registerPlansInPlaySocket();
  const id = globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2, 14);
  let timer = null;
  try {
    const plans = await new Promise((resolve) => {
      _plansWaiting.set(id, resolve);
      timer = setTimeout(() => resolve([]), Math.max(0, waitMs));
      socket.emit(GM_RELAY_SOCKET, {
        kind: PLANS_ASK_KIND, id,
        text: typeof text === "string" ? text.slice(0, PLANS_TEXT_MAX) : "",
        matchedEntityIds: (Array.isArray(matchedEntityIds) ? matchedEntityIds : []).filter(m => typeof m === "string").slice(0, PLANS_IDS_MAX),
      });
    });
    return plans.map(normaliseSkeleton).filter(r => r && r.truth).slice(0, MAX_RELEVANT_SKELETONS);
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: asking the GM for the plans in play failed — the turn reads none:`, err?.message ?? err);
    return [];
  } finally {
    if (timer) clearTimeout(timer);
    _plansWaiting.delete(id);
  }
}

/** The world setting that holds what the table has been shown of the plans (issue #362 D1; written by the canonical GM). */
export const TABLE_VIEW_SETTING = "narrativeSkeletonsTableView";

/** Register the table's view of the plans. Call from `init` (index.js). */
export function registerPlansTableViewSetting() {
  globalThis.game?.settings?.register?.(MODULE_ID, TABLE_VIEW_SETTING, {
    name:    "Narrative skeleton — what the table has been shown",
    scope:   "world",
    config:  false,
    type:    Object,
    default: { questions: [], demands: [] },
  });
}

/**
 * What the table has been shown of the plans (issue #353 R4, the maintainer's
 * definitions) — the only plan fields any player-facing view reads:
 *   - an unanswered question: an active mystery whose truth is not revealed —
 *     its question alone (the fiction posed it to the characters);
 *   - a standing demand: an active threat or NPC agenda whose truth is
 *     revealed — its subject and what it wants, no longer secret.
 * Never a plan's truth, what it knows, its clues, escalation, endings or
 * oracle rolls, nor its id.
 *
 * @param {Object[]} records — normaliseSkeleton's
 * @returns {{ questions: Array<{ question: string }>, demands: Array<{ name: string, wants: string }> }}
 */
function tableViewOf(records) {
  const out = { questions: [], demands: [] };
  for (const plan of Array.isArray(records) ? records : []) {
    if (plan?.status !== "active") continue;
    if (plan.kind === "mystery" && plan.truthRevealed !== true && plan.question) {
      out.questions.push({ question: plan.question });
    } else if ((plan.kind === "threat" || plan.kind === "npcAgenda") && plan.truthRevealed === true && plan.wants) {
      out.demands.push({ name: plan.subject?.name ?? "", wants: plan.wants });
    }
  }
  return out;
}

/** Only strings, bounded — the setting crosses every client. */
function cleanTableView(view) {
  const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
  return {
    questions: (Array.isArray(view?.questions) ? view.questions : []).map(q => ({ question: str(q?.question, 240) })).filter(q => q.question),
    demands:   (Array.isArray(view?.demands) ? view.demands : []).map(d => ({ name: str(d?.name, 120), wants: str(d?.wants, 600) })).filter(d => d.wants),
  };
}

/**
 * What the table has been shown of the plans, as the canonical GM keeps it —
 * on every client alike, a player's and a GM's (the Session panel's "What's
 * open", decisions.md R4): nothing read from the Secrets journal. Empty with
 * the narrative skeleton off. Fail-open.
 *
 * @returns {{ questions: Array<{ question: string }>, demands: Array<{ name: string, wants: string }> }}
 */
export function plansShownToTable() {
  if (!skeletonsEnabled()) return { questions: [], demands: [] };
  try {
    return cleanTableView(globalThis.game?.settings?.get?.(MODULE_ID, TABLE_VIEW_SETTING));
  } catch {
    return { questions: [], demands: [] };
  }
}

let _tableViewSync = Promise.resolve();

/**
 * Rewrite the table's view of the plans from the store, when it changed — on
 * the canonical GM, its single writer: after its own plan writes, on any
 * change to a Secrets page (a GM's edit in the journal, an X-Card's undo, a
 * page deleted), and once at load. One at a time on this client, each reading
 * the store at its turn. Only a change the table could see writes, so a plan
 * made or decided in secret moves nothing on a player's client. Never throws.
 *
 * @returns {Promise<void>}
 */
function syncPlansTableView() {
  if (!isCanonicalGM()) return _tableViewSync;
  const run = _tableViewSync.then(async () => {
    try {
      const next = cleanTableView(tableViewOf(listSkeletons()));
      const stored = cleanTableView(globalThis.game?.settings?.get?.(MODULE_ID, TABLE_VIEW_SETTING));
      if (JSON.stringify(next) === JSON.stringify(stored)) return;
      await globalThis.game?.settings?.set?.(MODULE_ID, TABLE_VIEW_SETTING, next);
    } catch (err) {
      console.warn(`${MODULE_ID} | secrets: what the table has been shown of the plans was not updated:`, err?.message ?? err);
    }
  });
  _tableViewSync = run;
  return run;
}

/**
 * Keep the table's view of the plans with the store (issue #362 D1): the
 * canonical GM rewrites it on every Secrets page created, changed or deleted
 * (document hooks fire on every client; only the canonical GM writes), and
 * once now. Register once, at ready (index.js).
 */
export function registerPlansTableViewSync() {
  if (registerPlansTableViewSync._installed) return;
  registerPlansTableViewSync._installed = true;
  const onPage = (page) => {
    if (!isCanonicalGM()) return;
    const journal = findWorldJournal("secrets");
    if (!journal || (page?.parent?.id ?? null) !== journal.id) return;
    void syncPlansTableView();
  };
  Hooks.on("createJournalEntryPage", onPage);
  Hooks.on("updateJournalEntryPage", onPage);
  Hooks.on("deleteJournalEntryPage", onPage);
  if (isCanonicalGM()) void syncPlansTableView();
}

/** Test seam: forget the plans-in-play listener and any ask in flight. */
export function _resetPlanRelayForTests() {
  _plansSocketInstalled = false;
  _plansWaiting.clear();
  _tableViewSync = Promise.resolve();
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
 * A plan write for a narration the X-Card removed is not made (issue #362
 * AC35; rules/narrator-memory.md 6b, XCARD-LATE-CAPTURE): each writer asks
 * right before its write — the plan writes run after the narration's card is
 * on screen, several server round trips long — and again after it, since the
 * card may land while the write is on its way: the X-Card's own undo then ran
 * before this write existed, so the write is taken back as that undo takes
 * back the rest (a plan it made deleted, one it changed restored). True when
 * the narration was removed.
 *
 * @param {string|null} narrationId
 * @returns {Promise<boolean>}
 */
async function takenBackForXCard(narrationId) {
  if (!isNarrationXCarded(narrationId)) return false;
  try {
    await undoNarrationEntries([narrationId], { categories: ["secrets"] });
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: a plan write the X-Card overtook could not be taken back:`, err?.message ?? err);
  }
  void syncPlansTableView();
  return true;
}

/**
 * takenBackForXCard for a clock a narration just started: the X-Card's pause
 * write drops the clocks stamped with the narration it removes, so one
 * created after that write is removed here (issue #362 AC35).
 *
 * @param {string|null} narrationId
 * @returns {Promise<boolean>} true when the narration was removed
 */
async function clockTakenBackForXCard(narrationId) {
  if (!isNarrationXCarded(narrationId)) return false;
  try {
    const { removeClocksMadeBy } = await import("../clocks/clocks.js");
    await removeClocksMadeBy([narrationId]);
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: a clock the X-Card overtook could not be removed:`, err?.message ?? err);
  }
  return true;
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
    if (isNarrationXCarded(narrationId)) return null;   // issue #362 AC35
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
      if (await takenBackForXCard(narrationId)) return null;
      // A new plan: the narrator's world snapshot is out of date (issue #357).
      reportSnapshotEvent("plan_made");
      void syncPlansTableView();   // a question posed is the table's to see (issue #362 D1)
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
    // One version a narration (issue #362 AC34): a plan is written several
    // times by one narration — its decision, its clock's link, a write per
    // `reveals` entry, its capture's link to a Threats page — and each write
    // pushed the narration's own last version onto `previous`, which keeps
    // NARRATION_HISTORY. Four writes pushed off the version before the
    // narration, and the X-Card on it then deleted a plan an earlier, kept
    // narration had made. The narration's own versions are never what an
    // undo restores: its next write keeps the history the first one made.
    const again = typeof narrationId === "string" && !!narrationId && stored.narrationId === narrationId;
    const stamp = keepStamp
      ? { narrationId: stored.narrationId ?? null, previous: stored.previous ?? null }
      : again ? { narrationId, previous: stored.previous ?? null } : narrationStamp(narrationId, stored);
    const data = { ...next, ...stamp };
    if (isNarrationXCarded(narrationId)) return null;   // issue #362 AC35
    try {
      await writeEntryPage(page, FLAG_KEYS.secrets, data);
      const name = skeletonPageName(next);
      if (page.name !== name) await page.update?.({ name });
      if (await takenBackForXCard(narrationId)) return null;
      void syncPlansTableView();   // a truth revealed, a question answered (issue #362 D1)
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
 * Whether two people's names can be one person's, as the entity gates compare
 * them (entityExtractor.js normalizeEntityName): each name's leading title is
 * stripped first ("Captain Reyes" is called "Reyes", "Administrator Lyssa
 * Chen" "Lyssa"), and a title alone is nobody's part-name — "the Captain" is
 * the same person only as another "the Captain" (issue #362 AC12: the
 * raider the narration called "the Captain" was laid onto Captain Reyes's
 * agenda, "captain" being the first word of her name).
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function samePersonName(a, b) {
  if (isBareTitle(a) || isBareTitle(b)) return personNameMatch(a, b) === "same";
  return !!personNameMatch(withoutTitle(a), withoutTitle(b));
}

/**
 * Whether a plan is about the subject a name names: one of the plan's names
 * (subjectNames) is that name, a variant of it, or its start or end
 * (nameMatch.js sameSubject) — and, for an NPC's agenda, either name of the
 * person ("Vuldar" for Vuldar Archer), their titles aside (samePersonName). A
 * title alone ("the Captain") is only ever the same title: it is not the end
 * of "Mara the Captain", nor part of "Captain Reyes" (issue #362 AC12).
 *
 * @param {Object} record — normaliseSkeleton's
 * @param {string} name
 * @returns {boolean}
 */
export function planIsAbout(record, name) {
  if (typeof name !== "string" || !name.trim()) return false;
  return subjectNames(record).some(n => ((isBareTitle(n) || isBareTitle(name))
    ? personNameMatch(n, name) === "same"
    : sameSubject(n, name) || (record.kind === "npcAgenda" && samePersonName(n, name))));
}

/**
 * The active plan a new one about `name` would double: one of the same kind —
 * or, for a being, either being kind — that is about that subject
 * (planIsAbout). null when the subject has no plan.
 *
 * @param {string} name
 * @param {string} kind — the plan about to be filed
 * @param {{ except?: string|null }} [opts] — a plan never doubled by itself (the one being decided)
 * @returns {Object|null}
 */
function activePlanAbout(name, kind, { except = null } = {}) {
  const kinds = BEING_KINDS.includes(kind) ? BEING_KINDS : [kind];
  return listSkeletons().find(r => r.id !== except && kinds.includes(r.kind) && planIsAbout(r, name)) ?? null;
}

/**
 * The plan a request about a known subject (an expedition's track, a vow)
 * already has: one of its kind about that subject by its id, or by its name
 * where either was filed by name alone — resolved and retired ones included
 * (their story was told). Null for a request with no subject.
 *
 * @param {Object} req — normalisePlanRequests'
 * @returns {Object|null}
 */
function planOfRequestSubject(req) {
  const subject = req?.subject;
  if (!subject) return null;
  return listSkeletons({ includeInactive: true }).find(r => r.kind === req.kind
    && ((subject.id && r.subject.id === subject.id) || ((!subject.id || !r.subject.id) && planIsAbout(r, subject.name)))) ?? null;
}

/**
 * The plan a decision of a waiting plan joins because it names a subject
 * another active plan of a being already has (issue #362 AC36; P2-30's "a
 * plan that names a subject already planned is merged into that plan", on the
 * by-id path too). A price's new enemy whose narration decided nothing waits
 * as "the new enemy this price reveals"; the next narration, asked to decide
 * it by its id, names it as its prose does — "the escort" — and it became a
 * second decided plan for the escort, with its own truth and clock. Null for
 * a decided plan (a duplicate holding a truth is a GM's to Retire), a
 * decision that names no subject, and a plan not of a being.
 *
 * @param {Object} waiting — the plan the decision's id names
 * @param {Object} plan — normalisePlans'
 * @returns {Object|null}
 */
function joinedByName(waiting, plan) {
  if (!waiting || waiting.truth || !plan?.subject || plan.sameAs || !BEING_KINDS.includes(waiting.kind)) return null;
  return activePlanAbout(plan.subject, waiting.kind, { except: waiting.id });
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
 * carry the narration, so the X-Card on it puts both back. The plan it joins
 * is the one `sameAs` names, or `target` — the plan the decision's subject
 * names (joinedByName, issue #362 AC36). A waiting plan filed under its
 * request's placeholder ("the new enemy this price reveals") gives the plan
 * it joins no alias: that is no name the story used.
 *
 * @param {Object} waiting — the undecided plan (its id is the answer's)
 * @param {Object} plan — normalisePlans', with `sameAs`
 * @param {{ narrationId?: string|null, target?: Object|null }} [opts]
 * @returns {Promise<Object|null>} the plan it joined, as written
 */
async function planAsAnother(waiting, plan, { narrationId = null, target: named = null } = {}) {
  if (waiting.truth) return null;
  const target = named ?? plannedAs(plan.sameAs, waiting.kind);
  if (!target || target.id === waiting.id) return null;
  const waitingName = isPlanRequestLabel(waiting.subject.name) ? "" : waiting.subject.name;
  const merged = await updateSkeleton(target.id, r => {
    let next = withAlias(withAlias(mergePlanInto(r, plan), waitingName), plan.subject);
    for (const alias of waiting.aliases ?? []) next = withAlias(next, alias);
    // A plan known only by name takes the waiting plan's page or card.
    if (next.subject.type === "name" && waiting.subject.id && waiting.subject.type !== "name") {
      next = { ...next, subject: { type: waiting.subject.type, id: waiting.subject.id, name: next.subject.name } };
    }
    return next;
  }, { narrationId });
  if (!merged) return null;
  const retired = await updateSkeleton(waiting.id, r => ({ ...r, status: "retired" }), { narrationId });
  if (retired) await retirePlanClock(retired);   // a countdown it held goes with it (issue #362 AC10)
  await ensureThreatClock(merged, { narrationId });
  return merged;
}

/**
 * A player character's name, or part of one: never an enemy to plan (the
 * acting PC named in a sidecar). Titles aside, as the plans' own matching
 * (samePersonName): "the Captain" is not the PC Captain Ryn (issue #362 AC12).
 */
async function namesPlayerCharacter(name) {
  try {
    const { getPlayerActors } = await import("../character/actorBridge.js");
    return getPlayerActors().some(a => typeof a?.name === "string" && samePersonName(a.name, name));
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
 * The truth is the one this sidecar leaves on the plan: a `plans` entry for
 * the same id — the narration recording the change its prose made, or
 * deciding the plan it reveals — is laid on first (issue #362 AC13). The
 * ledger was read before applyPlanSideData applied that entry, so a truth
 * changed and revealed in one beat put the old, contradicted truth in the
 * scene's facts beside a Lore entry stating the new one, and a plan decided
 * and revealed in one beat got no scene fact at all. An entry answered
 * `sameAs`, or one deciding a waiting plan under another plan's subject
 * (joinedByName), is not laid on: applyPlanSideData joins it to that plan —
 * the waiting plan retired, its reveal with it — or leaves the plan as it is.
 *
 * @param {Object} sidecar — normaliseSidecar's
 * @param {{ endingSubjectIds?: string[] }} [opts] — the tracks and vows the
 *   narration's beat ends: a plan their end resolved is still its to reveal
 *   (skeletons.js planInPlay, issue #362 D4)
 * @returns {Array<{ subject: string, fact: string, revealOf: string }>} `revealOf`: the plan's id — the
 *   reveal files the truth as Lore itself, so the scene's end does not archive it again (issue #362 AC37)
 */
export function revealedTruthsOf(sidecar, { endingSubjectIds = [] } = {}) {
  if (!skeletonsEnabled()) return [];
  const ending = new Set(Array.isArray(endingSubjectIds) ? endingSubjectIds : []);
  const decided = new Map(normalisePlans(sidecar?.plans).map(p => [p.id, p]));
  const out = [];
  for (const reveal of normaliseReveals(sidecar?.reveals)) {
    if (!reveal.revealed.includes("truth")) continue;
    const stored = getSkeleton(reveal.id);
    if (!stored || !planInPlay(stored, ending) || stored.truthRevealed) continue;
    const plan = decided.get(reveal.id);
    const record = plan && !plan.sameAs && !joinedByName(stored, plan) ? applyPlanToSkeleton(stored, plan) : stored;
    if (!record.truth) continue;
    out.push(record.kind === "mystery" && record.question
      ? { subject: record.subject.name, fact: `The answer to "${record.question}": ${record.truth}`, revealOf: record.id }
      : { subject: record.subject.name, fact: record.truth, revealOf: record.id });
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
 *     a request past the PLANS_PER_SIDECAR the narration was shown (a Batch
 *     Mode round's fifth onward, up to PLAN_REQUESTS_PER_NARRATION) has no
 *     answer, and is filed the same way (issue #364 ROUND-PLAN-REQUEST-CAP);
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
 * A plan its subject's end resolved — its expedition's track completed, its
 * vow fulfilled (closePlansAbout) — is still decided and revealed by the
 * narration whose beat ended it (`endingSubjectIds`, issue #362 D4).
 *
 * @param {Object} sidecar — normaliseSidecar's
 * @param {{ campaignState: Object, narrationId?: string|null, moveId?: string|null, planRequests?: Object[],
 *           endingSubjectIds?: string[], relayed?: boolean }} ctx — `relayed`: the side-data crossed the
 *   relay from another client (narrator.js applyRelayedNarratorSidecar, which has already dropped its
 *   `reveals` and the `plans` it may not write — issue #362 D2): its `countdown` names no plan by id
 *   (applyCountdown, issue #364 RELAYED-COUNTDOWN-ABOUT-BY-ID)
 * @returns {Promise<{ filed: number, decided: number, questions: number, revealed: number }>}
 */
export async function applyPlanSideData(sidecar, { campaignState, narrationId = null, moveId = null, planRequests = [], endingSubjectIds = [], relayed = false } = {}) {
  const out = { filed: 0, decided: 0, questions: 0, revealed: 0 };
  if (!skeletonsEnabled() || !isCanonicalGM()) return out;
  const ending = new Set(Array.isArray(endingSubjectIds) ? endingSubjectIds : []);
  try {
    const plans     = normalisePlans(sidecar?.plans);
    const questions = normaliseOpenQuestions(sidecar?.openQuestions);
    // Every request the narration carried, not only the PLANS_PER_SIDECAR it
    // was asked to decide (DECIDE NOW shows no more): the rest have no answer
    // in its sidecar, and are filed below with their rolls alone — a Batch
    // Mode round whose entries brought five or more dropped the fifth onward
    // (issue #364 ROUND-PLAN-REQUEST-CAP). A relay's are bounded where they
    // arrive (narrator.js applyRelayedNarratorSidecar).
    const requests  = normalisePlanRequests(planRequests, { max: PLAN_REQUESTS_PER_NARRATION });
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
          reportSnapshotEvent("plan_decided");
          await ensureThreatClock(merged, { narrationId });
        }
        continue;
      }
      // A request about a subject that has a plan already — a vow sworn a
      // second time (typed, then from its card), an expedition's plan asked
      // for again — files no second one, as the no-scene path
      // (fileRequestedPlan) never did (issue #362 AC14): the decision joins
      // the plan still in play, which takes the subject's id when it was
      // filed by name alone; a plan whose story was told is left.
      const known = planOfRequestSubject(req);
      if (known) {
        const link = req.subject.id && !known.subject.id ? { ...req.subject } : null;
        if (known.status === "active" && (plan || link)) {
          const joined = await updateSkeleton(known.id, r => {
            const next = plan ? mergePlanInto(r, plan) : r;
            return link ? { ...next, subject: link } : next;
          }, { narrationId });
          if (joined && plan) {
            out.decided += 1;
            reportSnapshotEvent("plan_decided");
            await ensureThreatClock(joined, { narrationId });
          }
        }
        continue;
      }
      // A request about a known subject (an expedition's track) keeps it, by
      // id; any other takes the name the narration gave it.
      const subject = req.subject ? { ...req.subject } : { type: "name", id: null, name: plan?.subject || req.label };
      const base = {
        kind: req.kind, subject, oracleSeeds: req.oracleSeeds, sceneId, sessionId,
        ...(req.reroll ? { reroll: req.reroll } : {}),
        // The resolution the request was made for stays with the plan, filed
        // by a narration or — unstamped — by an exit that wrote none: a later
        // narration of the same move finds it by this (issue #364
        // KEPT-PRICE-NEW-ENEMY-PLANNED-TWICE; skeletons.js planFiledFor).
        createdFrom: { narrationId, moveId, trigger: req.trigger || null, resolutionId: req.resolutionId ?? null },
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
      if (!existing || !planInPlay(existing, ending)) continue;
      // A plan waiting to be decided that the narrator says is a subject
      // already planned (issue #354 P2-30) — by its `sameAs`, or by deciding
      // it under that subject's name (issue #362 AC36) — joins that plan, and
      // is retired.
      const named = joinedByName(existing, plan);
      if (plan.sameAs || named) {
        if (await planAsAnother(existing, plan, { narrationId, target: named })) {
          out.decided += 1;
          reportSnapshotEvent("plan_decided");
        }
        continue;
      }
      const decided = await updateSkeleton(plan.id, r => applyPlanToSkeleton(r, plan), { narrationId });
      if (decided) {
        out.decided += 1;
        reportSnapshotEvent("plan_decided");
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
      if (!before || !planInPlay(before, ending)) continue;
      const truthNow = reveal.revealed.includes("truth") && !before.truthRevealed && !!before.truth;
      // The rolls shown with a truth carry the narration too, when it is
      // this reveal that shows them (`rollsShownBy`): its undo puts them
      // back unshown with the truth (issue #364 PLAN-CLUE-TRUTH-NO-MARK).
      const after = await updateSkeleton(reveal.id,
        r => ({ ...applyRevealToSkeleton(r, reveal, { narrationId }),
          ...(truthNow ? { rollsShown: true, ...(r.rollsShown ? {} : { rollsShownBy: narrationId }) } : {}) }), { narrationId });
      if (!after) continue;
      out.revealed += 1;
      // What the narrator's world snapshot makes of it (issue #357): a truth
      // revealed or a story ended is a major event; a clue shown or a step
      // played is not, and rides with the changes since the snapshot.
      reportSnapshotEvent(truthNow ? "plan_revealed" : (after.status === "resolved" ? "plan_resolved" : "plan_progressed"));
      if (truthNow && after.status === "resolved") reportSnapshotEvent("plan_resolved");
      if (truthNow) await onTruthRevealed(after, { campaignState, narrationId, rollsWereShown: before.rollsShown });
      await paceAfterReveal(before, after, narrationId);
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

    // A countdown the prose started becomes a real clock (Phase 3) — a
    // relayed one about what its `about` names, never the plan of that id.
    await applyCountdown(countdown, { campaignState, narrationId, moveId, byId: !relayed });
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
  if (isNarrationXCarded(narrationId)) return;   // issue #362 AC35
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
 * The plan clocks that hold a slot of MAX_PLAN_CLOCKS: running, not full, and
 * an active plan's. A clock whose plan left play — retired, resolved, its page
 * gone — or one that is full turns on no price (issue #362 AC10: four retired
 * plans' clocks held every slot, and no decided threat got a clock again).
 *
 * @returns {Object[]}
 */
function livePlanClocks() {
  const active = new Set(listSkeletons().map(r => r.id));
  return storedClocks().filter(c => c?.planId && c.active !== false && active.has(c.planId) && (c.filled ?? 0) < c.segments);
}

/**
 * A plan that leaves play takes its clock with it (issue #362 AC10): retired
 * — kept on the list for the record, turned by no price — unless an open
 * scene challenge holds it (heldBySceneChallenge: the challenge's, retired
 * with the challenge). A narration's `resolved` reveal retires it in
 * paceAfterReveal; a GM's Retire and a waiting plan retired as another
 * (planAsAnother) left it running. Never throws.
 *
 * @param {Object|null} record — the plan, as written
 */
async function retirePlanClock(record) {
  const clock = planClock(record);
  if (!clock || await heldBySceneChallenge(clock._id)) return;
  try {
    const { retireClock } = await import("../clocks/clocks.js");
    await retireClock(clock._id);
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: the clock of "${record?.subject?.name ?? "a plan"}" was not retired with it:`, err?.message ?? err);
  }
}

/**
 * Plans whose pages are gone from the Secrets journal take their clocks with
 * them (issue #364 PLAN-PAGE-DELETE-LEAVES-CLOCK): a GM who deletes a plan's
 * page in the journal sidebar — not the panel's Retire, which retires the
 * clock (issue #362 AC10) — left the clock running on the list: it turned on
 * every Pay the Price and, full, fired a trigger vignette with no plan behind
 * it. Each clock of such a plan — stamped with it (`planId`), or the one its
 * record links — is retired as Retire retires it: kept on the list, turned by
 * no price, and left to an open scene challenge that holds it
 * (heldBySceneChallenge). A plan another page of the store still holds — a
 * GM's copy of the page deleted, not the plan — keeps its clock; the deleted
 * pages themselves are not counted, whether or not the store still lists
 * them when the hook runs. Canonical GM (registerPlanSubjectHooks). Never
 * throws.
 *
 * @param {Object[]} pages — the JournalEntryPage documents deleted
 */
async function retireClocksOfDeletedPlans(pages) {
  try {
    const gone = (Array.isArray(pages) ? pages : []).filter(Boolean);
    const goneIds = new Set(gone.map(p => p.id).filter(Boolean));
    const kept = new Set(secretPages().filter(p => !gone.includes(p) && !goneIds.has(p.id)).map(p => entryOf(p)?.id).filter(Boolean));
    for (const page of gone) {
      const record = normaliseSkeleton(entryOf(page));
      if (!record || kept.has(record.id)) continue;
      const clocks = storedClocks().filter(c => c && c.active !== false
        && (c.planId === record.id || (c._id === record.clockId && !c.planId)));
      for (const clock of clocks) {
        if (await heldBySceneChallenge(clock._id)) continue;
        const { retireClock } = await import("../clocks/clocks.js");
        await retireClock(clock._id);
      }
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: the clock of a plan whose page was deleted was not retired:`, err?.message ?? err);
  }
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
  if (livePlanClocks().length >= MAX_PLAN_CLOCKS) return null;
  try {
    if (isNarrationXCarded(narrationId)) return null;   // issue #362 AC35
    const { createClock } = await import("../clocks/clocks.js");
    const campaignLevel = record.createdFrom?.trigger === "significant_threat";
    // Named by its subject alone (issue #362 D3): "<subject> — escalation"
    // told every player's screen a hidden plan stood behind the clock.
    const clock = await createClock({
      name: record.subject.name.slice(0, 80),
      type: campaignLevel ? "campaign" : "tension", segments: campaignLevel ? 6 : 4,
      narrationId, planId: record.id,
    });
    if (await clockTakenBackForXCard(narrationId)) return null;
    await updateSkeleton(record.id, r => ({ ...r, clockId: clock._id }), { narrationId });
    if (await clockTakenBackForXCard(narrationId)) return null;   // the card landed during the link
    return clock;
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: "${record.subject.name}"'s escalation clock was not made:`, err?.message ?? err);
    return null;
  }
}

/**
 * Whether an open scene challenge holds the clock as its tension clock — a
 * countdown the GMs began a challenge on (sceneChallengeOffer.js). It is the
 * challenge's then: its filling is the challenge's time running out ("the
 * scene ends when either fills", progressTracks.js), and the challenge's
 * completion or removal retires it. A plan's pacing leaves it alone (issue
 * #362 AC09): rewound "for the step after" on the miss that filled it, the
 * challenge never ran out of time. Fail-open: false.
 *
 * @param {string|null} clockId
 * @returns {Promise<boolean>}
 */
async function heldBySceneChallenge(clockId) {
  if (typeof clockId !== "string" || !clockId) return false;
  try {
    const { listOpenProgressTracks } = await import("../ui/progressTracks.js");
    return (listOpenProgressTracks() ?? []).some(t => t?.type === "scene_challenge" && t.tensionClockId === clockId);
  } catch (err) {
    console.debug?.(`${MODULE_ID} | secrets: the open scene challenges could not be read:`, err?.message ?? err);
    return false;
  }
}

/**
 * After a beat played a step of a plan with a clock, the clock paces the next
 * one: back to empty while a step is left, retired when none is — or when the
 * plan's story ended, or a countdown's mystery came out. A clock an open scene
 * challenge holds is left as it is (heldBySceneChallenge). The pacing carries
 * the narration (`pacedBy`, clocks.js pacePlanClock), so taking it back puts
 * the clock back one short of full with the step. Never throws.
 */
async function paceAfterReveal(before, after, narrationId = null) {
  const clock = planClock(after);
  if (!clock || await heldBySceneChallenge(clock._id)) return;
  const played = after.escalation.some((e, i) => e.done && !before.escalation[i]?.done);
  const over = after.status !== "active"
    || !after.escalation.some(e => !e.done) && (played || (after.kind === "mystery" && after.truthRevealed));
  if (!over && !played) return;
  try {
    // Stamped with the narration that paced it: the X-Card or a supersede
    // that takes the step back re-arms the clock (issue #362 AC33).
    const { pacePlanClock } = await import("../clocks/clocks.js");
    await pacePlanClock(clock._id, { retire: over, pacedBy: narrationId });
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
 *
 * `byId: false` — a countdown from a relayed fact block (issue #364
 * RELAYED-COUNTDOWN-ABOUT-BY-ID): its `about` is read as a name only. A
 * narration on a player's own key is shown no plan, so it names what a
 * countdown concerns as the fiction does; an `about` that is a plan's id is
 * hand-made, and plan ids are public (a clock's `planId`, a rolls card's
 * `skeletonId`) — by id it hung a new clock on a plan that had none (issue
 * #362 D2's rule for a relay's `plans` and `reveals`). Such an `about` is no
 * name: the countdown is about nothing planned, and gets its own mystery.
 */
async function applyCountdown(countdown, { campaignState, narrationId = null, moveId = null, byId = true }) {
  if (!countdown) return null;
  try {
    if (storedClocks().some(c => c?.active !== false && sameSubjectName(c.name, countdown.label))) return null;
    const sceneId = campaignState?.currentSceneId ?? null;
    const active = listSkeletons();
    const about = byId || !getSkeleton(countdown.about) ? countdown.about : "";
    let plan = (byId ? active.find(r => r.id === about) : null)
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
    if (isNarrationXCarded(narrationId)) return null;   // issue #362 AC35
    const { createClock } = await import("../clocks/clocks.js");
    const clock = await createClock({ name: countdown.label, type: "tension", segments: countdown.segments, narrationId, planId: plan.id });
    if (await clockTakenBackForXCard(narrationId)) return null;
    await updateSkeleton(plan.id, r => ({ ...r, clockId: clock._id }), { narrationId });
    // The card landed during the link: the clock goes too, and no challenge
    // is offered for a countdown the table removed.
    if (await clockTakenBackForXCard(narrationId)) return null;
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

/**
 * A plan's clock that filled while its trigger vignette could not be written
 * — the X-Card active, no key, narration off, the call failed, an empty reply
 * — goes back one segment short of full (issue #362 AC08): the step it was to
 * play is still owed, and the next price that fills it plays it. The step is
 * marked and the clock paced only by the vignette's own sidecar apply, so
 * left full it was turned by no price again (advanceTensionClocksForPayThePrice
 * takes only clocks not yet full), its step never played, and it held a
 * plan-clock slot for good. Only while the clock is still full, its plan
 * active with a step to play (or a countdown's answer to come out), and no
 * open scene challenge holds it — a challenge's full clock is its time run
 * out (AC09). A GM's write, on the client that ran the vignette (each post
 * site is the clock's one emitter). Never throws.
 *
 * @param {string|null} clockId
 * @returns {Promise<Object|null>} the clock as re-armed, or null
 */
export async function rearmUnplayedPlanClock(clockId) {
  if (globalThis.game?.user?.isGM !== true || !skeletonsEnabled()) return null;
  try {
    const paced = planForClock(clockId);
    if (!paced || (!paced.step && !paced.revealsTruth)) return null;
    const clock = planClock(paced.plan);
    if (!clock || (clock.filled ?? 0) < clock.segments || await heldBySceneChallenge(clock._id)) return null;
    const { rearmClock } = await import("../clocks/clocks.js");
    return await rearmClock(clock._id);
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: a plan's clock whose trigger was not narrated could not be re-armed:`, err?.message ?? err);
    return null;
  }
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
    createdFrom: { narrationId: null, moveId: null, trigger: req.trigger || null, resolutionId: req.resolutionId ?? null },
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
// A PLAN'S SUBJECT ENDS — the plan leaves play with it (issue #362 D4)
// ─────────────────────────────────────────────────────────────────────────────
//
// Nothing closed a plan but the narrator's own `resolved` or a GM's Retire: a
// finished expedition's, a fulfilled or forsaken vow's and an old scene's
// mystery stayed active when the closing narration omitted it, failed or was
// paused — in every world snapshot, under every player's Unanswered questions,
// and the plan a waypoint's peril picked (AC11). Decided (D4, answer A): the
// code closes them as their subject ends.

/** The plan kinds whose subject of each type, ending, closes them. */
const ENDING_KINDS = Object.freeze({ track: Object.freeze(["expedition"]), vow: Object.freeze(["vow"]) });

/**
 * Close the active plans about a subject that ended (issue #362 D4): resolved
 * when its story ended — an expedition's track completed, a vow fulfilled or
 * forsaken — retired when the subject is gone — the track removed, the vow's
 * last copy deleted. Its clock leaves with it (retirePlanClock). The narration
 * whose beat ended it still has it in play to reveal its end
 * (`endingTrackIds`, skeletons.js planInPlay). The write keeps the plan's
 * narration stamp (`keepStamp`), so an X-Card on the narration that decided it
 * still takes that decision back. Canonical GM. Never throws.
 *
 * @param {{ type: "track"|"vow", id: string }} subject
 * @param {"resolved"|"retired"} status
 * @returns {Promise<Object[]>} the plans closed, as written
 */
export async function closePlansAbout(subject, status) {
  const kinds = ENDING_KINDS[subject?.type];
  const id = typeof subject?.id === "string" && subject.id ? subject.id : null;
  if (!kinds || !id || !["resolved", "retired"].includes(status) || !skeletonsEnabled() || !isCanonicalGM()) return [];
  const closed = [];
  try {
    const about = listSkeletons().filter(r => kinds.includes(r.kind) && r.subject.type === subject.type && r.subject.id === id);
    for (const plan of about) {
      const written = await updateSkeleton(plan.id, r => (r.status === "active" ? { ...r, status } : null), { keepStamp: true });
      if (!written) continue;
      closed.push(written);
      await retirePlanClock(written);
    }
    if (closed.length) reportSnapshotEvent(status === "resolved" ? "plan_resolved" : "plan_retired");
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: the plans of a ${subject.type} that ended were not closed:`, err?.message ?? err);
  }
  return closed;
}

/**
 * A scene ended (issue #362 D4): the mysteries it posed that were never
 * answered — a question, a countdown's "what happens when it runs out?" —
 * leave play with it, retired with their clocks (a clock an open scene
 * challenge holds stays the challenge's). Left active, a countdown kept
 * turning on every later price and its answer "came out" in an unrelated
 * scene, and the same question posed in the next scene filed a second
 * mystery. One whose truth was revealed is left as it is. Canonical GM (the
 * scene lifecycle's emitter). Never throws.
 *
 * @param {string|null} sceneId — the scene that ended
 * @returns {Promise<Object[]>} the mysteries retired, as written
 */
export async function retireSceneMysteries(sceneId) {
  if (typeof sceneId !== "string" || !sceneId || !skeletonsEnabled() || !isCanonicalGM()) return [];
  const retired = [];
  try {
    const unanswered = listSkeletons().filter(r => r.kind === "mystery" && r.subject.type === "scene"
      && r.subject.id === sceneId && !r.truthRevealed);
    for (const plan of unanswered) {
      const written = await updateSkeleton(plan.id,
        r => (r.status === "active" && !r.truthRevealed ? { ...r, status: "retired" } : null), { keepStamp: true });
      if (!written) continue;
      retired.push(written);
      await retirePlanClock(written);
    }
    if (retired.length) reportSnapshotEvent("plan_retired");
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: the ended scene's unanswered mysteries were not retired:`, err?.message ?? err);
  }
  return retired;
}

/**
 * A vow Item completed or deleted closes its vow's plan once no copy of the
 * vow is left open (a shared vow has a copy per PC): completed — fulfilled,
 * forsaken (the pipeline marks every copy completed), or closed on the sheet
 * — resolves it; its last copy deleted retires it (issue #362 D4). Never throws.
 *
 * @param {Object} item — the vow Item (progress, subtype vow)
 * @param {"resolved"|"retired"} status
 */
async function closeVowPlanIfEnded(item, status) {
  try {
    const { getPlayerActors, vowCopyId, isVowCopy } = await import("../character/actorBridge.js");
    const vowId = vowCopyId(item);
    if (!vowId) return;
    const copies = (getPlayerActors() ?? []).flatMap(a => [...(a.items?.contents ?? a.items ?? [])])
      .filter(i => i?.id !== item.id && isVowCopy(i, vowId));
    // A copy still open keeps the vow; any copy left keeps a deleted one's.
    if (status === "resolved" ? copies.some(i => i.system?.completed !== true) : copies.length) return;
    await closePlansAbout({ type: "vow", id: vowId }, status);
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: the plan of a vow that ended was not closed:`, err?.message ?? err);
  }
}

/**
 * Wire the vow Items' ends to their plans (issue #362 D4): a vow completed or
 * deleted — by a move, on the sheet, in the sidebar — closes its plan
 * (closeVowPlanIfEnded). And a plan's own end to its clock: its page deleted
 * from the Secrets journal, or the journal itself deleted, retires the clocks
 * it held (retireClocksOfDeletedPlans, issue #364
 * PLAN-PAGE-DELETE-LEAVES-CLOCK). Document hooks fire on every client: the
 * canonical GM closes it, once. Register once, at ready.
 */
export function registerPlanSubjectHooks() {
  if (registerPlanSubjectHooks._installed) return;
  registerPlanSubjectHooks._installed = true;
  const isVow = (item) => item?.type === "progress" && item.system?.subtype === "vow";
  Hooks.on("updateItem", (item, change) => {
    if (!isCanonicalGM() || !isVow(item) || change?.system?.completed !== true) return;
    void closeVowPlanIfEnded(item, "resolved");
  });
  Hooks.on("deleteItem", (item) => {
    if (!isCanonicalGM() || !isVow(item)) return;
    void closeVowPlanIfEnded(item, "retired");
  });
  Hooks.on("deleteJournalEntryPage", (page) => {
    if (!isCanonicalGM() || !entryOf(page)) return;
    void retireClocksOfDeletedPlans([page]);
  });
  // A journal deleted whole fires no page hook for the pages it held.
  Hooks.on("deleteJournalEntry", (journal) => {
    if (!isCanonicalGM()) return;
    const pages = (journal?.pages?.contents ?? []).filter(p => entryOf(p));
    if (pages.length) void retireClocksOfDeletedPlans(pages);
  });
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
  if (isNarrationXCarded(narrationId)) return null;   // issue #362 AC35
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
  // The GM's own reveal: no narration's to take back (the marks cleared —
  // issue #364 PLAN-CLUE-TRUTH-NO-MARK).
  const revealed = await updateSkeleton(id, r => ({ ...r, truthRevealed: true, rollsShown: true, truthRevealedBy: null, rollsShownBy: null }), { byGm: true });
  if (revealed) reportSnapshotEvent("plan_revealed");
  return revealed;
}

/**
 * The GM's "Retire": the plan leaves play (kept in the journal). Any GM. The
 * narrator's world snapshot holds the plan until a new one is taken, so the
 * next narration takes one (issue #357).
 */
export async function retireSkeleton(id) {
  const retired = await updateSkeleton(id, r => ({ ...r, status: "retired" }), { byGm: true });
  if (retired) {
    await retirePlanClock(retired);   // its clock leaves play with it (issue #362 AC10)
    reportSnapshotEvent("plan_retired");
  }
  return retired;
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
  // An item kept word for word keeps whether it was played or shown — a
  // played step with the narration that played it (`playedBy`), so taking
  // that narration back still un-plays it (issue #364
  // PLAN-STEP-REWRITTEN-BEFORE-BURN), and a shown clue with the narration
  // that showed it (`revealedBy`, issue #364 PLAN-CLUE-TRUTH-NO-MARK).
  const relist = (lines, old, prefix, flag) => lines.map((t, i) => {
    const kept = old.find(o => o.text === t && o[flag] === true) ?? null;
    return { id: `${prefix}${i + 1}`, text: t, [flag]: !!kept, ...(typeof kept?.playedBy === "string" ? { playedBy: kept.playedBy } : {}),
      ...(typeof kept?.revealedBy === "string" ? { revealedBy: kept.revealedBy } : {}) };
  });
  const edited = await updateSkeleton(id, (r) => {
    const next = { ...r, subject: { ...r.subject } };
    if (typeof fields.subject === "string" && fields.subject.trim()) next.subject.name = fields.subject;
    for (const f of ["truth", "wants", "knows"]) if (typeof fields[f] === "string") next[f] = fields[f];
    if (Array.isArray(fields.escalation)) next.escalation = relist(fields.escalation, r.escalation, "e", "done");
    if (Array.isArray(fields.clues)) next.clues = relist(fields.clues, r.clues, "c", "revealed");
    if (Array.isArray(fields.resolutions)) next.resolutions = fields.resolutions;
    return next;
  }, { byGm: true });
  // The narrator's world snapshot states the plan as it was: the next
  // narration takes a new one (issue #357).
  if (edited) reportSnapshotEvent("plan_edited");
  return edited;
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
