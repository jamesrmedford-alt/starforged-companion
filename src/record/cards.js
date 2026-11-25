/**
 * STARFORGED COMPANION
 * src/record/cards.js — each narration, recorded as its card posts (issue #382)
 *
 * `narration` is observed, not reported: one `createChatMessage` hook on the
 * canonical GM takes every card narrator memory would take (the flag-family
 * contract, rules/narrator-memory.md invariant 1 — no fallback card, no
 * whisper, no contradiction or recap card, nothing the X-Card or an upgrade
 * already struck) and maps its flags to the event. The post sites are
 * untouched, and a new narration card is recorded with no code of its own.
 *
 * The event's `text` is a write-once copy of the prose, taken as the card
 * posts: a card's prose is never edited afterwards, only flagged, and a
 * removal reaches the record as an event of its own (`narration.removed`).
 * Prose belongs to its event and is never read as a fact.
 *
 * The same hook takes one roll card: `!bond`'s (moves/bondCommand.js), a
 * move rolled on its author's client outside the move pipeline, whose card
 * carries its dice (`bondRoll`) — the one thing of a miss that reaches the GM.
 */

import { recordEvent } from './record.js';
import { isCanonicalGM } from '../multiplayer/gmGate.js';

const MODULE_ID = 'starforged-companion';

/**
 * How a narration card was told, from its own flags.
 *
 * @param {Object} f — the card's module flags
 * @returns {string}
 */
function narrationMode(f) {
  if (f.roundId) return 'round';
  if (f.oracleNarrationCard) return 'oracle';
  if (f.vowSceneCard) return 'vow';
  if (f.pacedNarrative) return 'paced';
  if (f.sceneResponse) return 'scene_answer';
  if (f.sessionVignetteCard) {
    // Begin's Spotlight Vignette is a cutaway the characters did not see (issue #381 slice 3).
    if (f.vignetteKind === 'spotlight_begin') return 'vignette_spotlight';
    return f.vignetteKind === 'npc_end' ? 'vignette_close' : 'vignette_open';
  }
  if (f.incitingMeta) return 'inciting';
  if (f.clockVignetteCard) return 'clock';
  if (f.publishedReflection) return 'reflection';
  return 'move';
}

const OUTCOMES = new Set(['strong_hit', 'weak_hit', 'miss']);
const die = (v, max) => (Number.isInteger(v) && v >= 1 && v <= max ? v : null);

/**
 * A `!bond` roll — bonded Develop Your Relationship, rolled on its author's
 * client outside the move pipeline (moves/bondCommand.js) — taken from its
 * card as it posts: the card is the one thing of a miss that reaches the GM.
 * The dice are the author's client's, as the card shows them. Returns
 * whether the card was one.
 *
 * @param {Object} message
 * @returns {boolean}
 */
function recordBondRoll(message) {
  const f = message?.flags?.[MODULE_ID];
  const roll = f?.bondCommandCard === true ? f.bondRoll : null;
  if (!roll || typeof roll !== 'object' || !OUTCOMES.has(roll.outcome)) return !!f?.bondCommandCard;
  const challenge = Array.isArray(roll.challengeDice) ? roll.challengeDice.map(v => die(v, 10)) : [];
  recordEvent('move.resolved', {
    session: f.sessionId,
    who: { user: message.author?.id ?? null, actor: typeof roll.actorId === 'string' && roll.actorId ? roll.actorId : null },
    ref: { res: `bond-${message.id}` },
    d: {
      moveId: 'develop_your_relationship', moveName: 'Develop Your Relationship (bonded)', rollKind: 'action',
      statUsed: 'rank', adds: Number(roll.adds) || 0, actionDie: die(roll.actionDie, 6),
      actionDieCancelled: roll.actionDieCancelled === true, challengeDice: challenge,
      actionScore: Number(roll.actionScore) || 0, isMatch: roll.isMatch === true, outcome: roll.outcome,
      target: roll.target && typeof roll.target === 'object'
        ? { name: typeof roll.target.name === 'string' ? roll.target.name : null, id: typeof roll.target.id === 'string' ? roll.target.id : null }
        : null,
    },
  });
  return true;
}

/**
 * Stamp every narrator card with the scene it is told in (overhaul 2 §8 — the
 * flag family's `sceneId`, rules/narrator-memory.md invariant 1): one
 * `preCreateChatMessage` hook, on whichever client creates the card, reads the
 * campaign's open scene and writes it onto the card as it is created
 * (`updateSource`), when the card's module flags carry `narratorCard: true`
 * and no `sceneId` of their own. The post sites are untouched, and a new card
 * type is stamped with no code of its own. Its readers: the colour window and
 * the scene's beats in the ACTIVE SCENE block (narrator.js sceneNarrationsOf).
 * It writes no world state — it sets a flag on the message being created.
 * Once, at load.
 */
export function registerSceneStampHook() {
  if (registerSceneStampHook._installed || typeof Hooks === 'undefined') return;
  registerSceneStampHook._installed = true;
  Hooks.on('preCreateChatMessage', (message, data) => {
    try {
      const flags = data?.flags?.[MODULE_ID] ?? message?.flags?.[MODULE_ID];
      if (flags?.narratorCard !== true || flags.sceneId) return;
      const sceneId = game.settings.get(MODULE_ID, 'campaignState')?.currentSceneId;
      if (typeof sceneId !== 'string' || !sceneId) return;
      message?.updateSource?.({ [`flags.${MODULE_ID}.sceneId`]: sceneId });
    } catch (err) {
      console.debug?.(`${MODULE_ID} | a narrator card was not stamped with its scene:`, err?.message ?? err);
    }
  });
}

/**
 * Register the hook. `inMemory(message)` is narrator memory's own rule for
 * one card of its own session (narrator.js `narratorMemoryCard`), handed in so
 * the rule lives in one place. Once, at `ready`.
 *
 * @param {{ inMemory: (message: Object) => boolean }} host
 */
export function registerRecordCardHook({ inMemory }) {
  if (registerRecordCardHook._installed) return;
  registerRecordCardHook._installed = true;
  Hooks.on('createChatMessage', (message) => {
    try {
      if (!isCanonicalGM()) return;
      if (recordBondRoll(message)) return;
      if (!inMemory(message)) return;
      const f = message.flags?.[MODULE_ID] ?? {};
      const text = typeof f.narrationText === 'string' ? f.narrationText : '';
      if (!text.trim()) return;
      const actorId = typeof f.actorId === 'string' && f.actorId ? f.actorId : null;
      // An @scene question asked of the narrator — its answer is this card
      // (issue #382, slice 2): a beat of its own, not something that happened.
      if (f.sceneResponse === true && typeof f.sceneQuestion === 'string' && f.sceneQuestion.trim()) {
        recordEvent('question', { session: f.sessionId, ref: { nar: f.narrationId ?? null, card: message.id ?? null }, text: f.sceneQuestion });
      }
      recordEvent('narration', {
        session: f.sessionId,
        who: { user: message.author?.id ?? null, actor: actorId },
        ref: {
          nar:   f.narrationId ?? null,
          card:  message.id ?? null,
          res:   f.resolutionId || null,
          round: f.roundId ?? null,
        },
        d: { mode: narrationMode(f), ...(f.upgradeOf ? { upgradeOf: f.upgradeOf } : {}), ...(actorId ? { actorId } : {}) },
        text,
      });
    } catch (err) {
      console.warn(`${MODULE_ID} | session record: a narration card was not recorded:`, err?.message ?? err);
    }
  });
}
