/**
 * STARFORGED COMPANION
 * src/record/ledgerDiff.js — what a save of the scene ledger established or struck (issue #382)
 *
 * `truth.set` and `truth.struck` are observed where the scene ledger is saved
 * from a working copy — sceneLifecycle.js `writeSceneLedgerFields` and the
 * move's record (persistResolution.js) — by comparing the ledger the store
 * held with the ledger written, by truth id. Every ledger writer saves through
 * one of the two: the narrator's fact block, `!truth` / `!state`, the
 * correction dialog, the inciting premise, an upgrade's retraction. So no
 * writer reports a truth, and a new one cannot forget to.
 *
 *   - a truth id the store did not hold is `truth.set` (a replacement names
 *     the truth it replaces);
 *   - a truth newly retracted by the table — a strike or a Replace — is
 *     `truth.struck`. One the X-Card or an upgrade retracted is not: that is
 *     `narration.removed`, which takes everything its narration wrote;
 *   - a truth that leaves the ledger without being retracted is not struck: a
 *     scene's end clears the ledger by migrating it.
 *
 * By truth id alone, whichever scene each copy is of: a truth set in the save
 * that opens a scene is still set, and one a stale working copy carries back
 * after it migrated is no new truth to the read (read.js keeps a truth's
 * first `truth.set`).
 *
 * `ledgerEvents` is pure; `recordLedgerChanges` records what it finds.
 */

import { recordEvent } from './record.js';

/** `retractedBy` of a truth a narration's removal retracted, not the table (factContinuity/ledgers.js). */
const NOT_THE_TABLE = new Set(['xcard', 'superseded']);

const truthsOf = (cs) => (Array.isArray(cs?.sceneTruths) ? cs.sceneTruths.filter(t => t && typeof t.id === 'string' && t.id) : []);

/**
 * The events a ledger save amounts to.
 *
 * @param {Object|null} before — the campaignState the store held
 * @param {Object|null} after  — the campaignState written
 * @returns {Array<{ kind: string, payload: Object }>}
 */
export function ledgerEvents(before, after) {
  const events = [];
  const held = new Map(truthsOf(before).map(t => [t.id, t]));
  const written = truthsOf(after);
  // A replacement is linked from the truth it replaces (`correctedTo`).
  const replaces = new Map();
  for (const t of written) {
    if (t.retracted && typeof t.correctedTo === 'string' && t.correctedTo) replaces.set(t.correctedTo, t.id);
  }
  const scene = after?.currentSceneId ?? null;
  const session = after?.currentSessionId ?? null;
  for (const t of written) {
    const was = held.get(t.id) ?? null;
    if (!was && !t.retracted) {
      const subject = t.subject && typeof t.subject === 'object' ? t.subject : null;
      events.push({
        kind: 'truth.set',
        payload: {
          session, scene,
          ref: { truth: t.id, nar: t.narrationId ?? null, entity: subject?.kind === 'entity' ? (subject.entityId ?? null) : null },
          d: {
            subject, fact: String(t.fact ?? ''), by: t.asserter ?? 'narrator',
            ...(t.sceneLocation ? { place: t.sceneLocation } : {}),
            ...(replaces.has(t.id) ? { replaces: replaces.get(t.id) } : {}),
          },
        },
      });
    }
    const newlyStruck = t.retracted === true && was && was.retracted !== true;
    if (newlyStruck && !NOT_THE_TABLE.has(t.retractedBy)) {
      events.push({
        kind: 'truth.struck',
        payload: {
          session, scene,
          ref: { truth: t.id },
          d: { by: t.retractedBy ?? 'gm', ...(t.correctedTo ? { replacedBy: t.correctedTo } : {}) },
        },
      });
    }
  }
  // The scene frame: where, who is present, the situation, the scene's
  // question — a change of it in the same scene is `frame`.
  const frameOf = (cs) => (cs?.sceneFrame && typeof cs.sceneFrame === 'object' ? cs.sceneFrame : null);
  const was = frameOf(before);
  const now = frameOf(after);
  const sameScene = (before?.currentSceneId ?? null) === (after?.currentSceneId ?? null);
  const shape = (f) => JSON.stringify(f ? [f.location ?? null, f.present ?? [], f.situation ?? null, f.question ?? null, f.questionAnswered === true] : null);
  if (now && (!sameScene || shape(was) !== shape(now))) {
    events.push({
      kind: 'frame',
      payload: {
        session, scene,
        ref: { nar: now.narrationId ?? null },
        d: {
          location: now.location ?? null, present: Array.isArray(now.present) ? now.present : [],
          situation: now.situation ?? null, question: now.question ?? null, questionAnswered: now.questionAnswered === true,
        },
      },
    });
  }
  return events;
}

/**
 * Record what a ledger save established or struck. Called after the save
 * landed, by the two places a ledger is saved from a working copy. Never
 * throws.
 *
 * @param {Object|null} before — the campaignState the store held before the save
 * @param {Object|null} after  — the campaignState written
 */
export function recordLedgerChanges(before, after) {
  try {
    for (const { kind, payload } of ledgerEvents(before, after)) recordEvent(kind, payload);
  } catch (err) {
    console.warn(`starforged-companion | session record: a ledger save's truths were not recorded:`, err?.message ?? err);
  }
}
