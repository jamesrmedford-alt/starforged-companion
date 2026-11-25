/**
 * STARFORGED COMPANION
 * src/factContinuity/earlierScenes.js — the truths an earlier scene of this session established: listed, and struck
 *
 * TRUTH-OF-AN-EARLIER-SCENE-UNCORRECTABLE (the long haul's free rehearsal at
 * 19fa9e37, beat 16). Since scenes turn in code (overhaul 2 D1), a session
 * holds many scenes, and each scene's end clears its ledger: its truths that
 * bind are filed on the cards and in the Lore (sceneLifecycle.js
 * migrateSceneTruth), its strikes kept for the session (`sessionRetractions`).
 * `!truth list` and `!truth strike` read the active scene's ledger alone, so a
 * table that found a mistake two scenes back could neither see it nor strike
 * it — "No truths are recorded in this scene" — the strike + set that changes
 * a name never happened (nameChanges.js nameCorrectionOf), and the Session Log
 * kept the old truth standing beside the new one.
 *
 * An ended scene's truths are kept on the session record (record/read.js —
 * the canonical history): each by its own recorded id, with the scene it was
 * established in and what it rests on. Here:
 *
 *   - earlierSceneTruths(campaignState) — the session's earlier scenes' truths
 *     that bind and stand, scene by scene, each scene labelled as the Session
 *     Log labels it (why it began, where), in the names the table uses now;
 *   - findEarlierSceneTruth(campaignState, needle) — one of them by its id, or
 *     a prefix of it (4+ characters) no other truth of the session has, as
 *     `!truth strike` takes one;
 *   - strikeEarlierSceneTruth(truth, campaignState, ctx) — the strike: kept
 *     with the session's strikes (`sessionRetractions` — the store a later
 *     scene's restatement is blocked by and CORRECTED names, written onto the
 *     latest store), then the record's `truth.struck` against the truth's own
 *     recorded id (read.js drops it; nameCorrectionOf reads the strike and a
 *     set as the swap), then the copies its scene's end filed taken back
 *     (retractions.js propagateRetraction: the subject's tier details and the
 *     session's Lore; a scene fact's tier detail on the place it was filed
 *     on). A truth leaves LAST KNOWN never: that is kept from the scene's
 *     state, not its truths.
 *
 * The session record is the GM's (the Session Log journal): its readers here
 * run on a GM — `!truth list` and `!truth strike` on the canonical GM, as the
 * relay handler, and the GM's correction dialog.
 */

import { readRecord, sessionTruthsAsRecorded } from '../record/read.js';
import { recordSource } from '../record/pages.js';
import { recordEvent } from '../record/record.js';
import { canCorrectTruth } from './ledgers.js';
import { propagateRetraction, rememberSessionRetractions } from './retractions.js';
import { nameCorrectionOf, withNameChange, recordNameChanged } from './nameChanges.js';
import { placeNamedBy } from './sceneLifecycle.js';
import { serialiseCampaignStateWrite } from '../multiplayer/campaignStateChain.js';

const MODULE_ID = 'starforged-companion';

/** The entity types a scene fact is filed on at its scene's end (sceneLifecycle.js PLACE_TYPES). */
const PLACE_TYPES = new Set(['settlement', 'planet', 'location', 'ship']);

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * A scene as a list names it: its number in the session, why it began and
 * where — "Scene 2 — a fight has begun: Ashen Wake (Bleakhold Station)".
 */
function sceneLabel(scene, n) {
  const why = clean(scene?.what);
  const at = clean(scene?.where?.location ?? scene?.place?.name);
  const head = n ? `Scene ${n}` : 'An earlier scene';
  return `${head}${why ? ` — ${why}` : ''}${at ? ` (${at})` : ''}`;
}

/**
 * The session's earlier scenes' truths that bind and stand, scene by scene —
 * none of the active scene's (its ledger lists those), none struck or removed
 * (read.js), none of another session's, and no colour (it left with its
 * scene, overhaul 2 §5.6). Each truth carries its words as recorded —
 * `subject` and `fact`, what the stores its scene's end filed it in hold —
 * and as the table names things now (`shown`). Never throws.
 *
 * @param {Object} campaignState
 * @param {{ source?: Object }} [opts] — what to read (default: the stored record — pages.js recordSource)
 * @returns {Array<{ sceneId: string|null, n: number|null, label: string, truths: Object[] }>}
 */
export function earlierSceneTruths(campaignState, { source } = {}) {
  try {
    const sessionId = campaignState?.currentSessionId ?? null;
    if (!sessionId) return [];
    const from = source ?? recordSource();
    const session = readRecord({ session: sessionId }, from).sessions.find(s => s.sessionId === sessionId) ?? null;
    if (!session || session.legacy) return [];
    const current = campaignState.currentSceneId ?? null;
    const inLedger = new Set((Array.isArray(campaignState.sceneTruths) ? campaignState.sceneTruths : []).map(t => t?.id).filter(Boolean));
    const recorded = new Map(sessionTruthsAsRecorded(sessionId, from).map(t => [t.truthId, t]));
    const scenes = Array.isArray(session.scenes) ? session.scenes : [];
    const groups = new Map();
    for (const beat of session.beats ?? []) {
      if (beat.removed || (current && beat.scene === current)) continue;
      for (const t of beat.established ?? []) {
        const was = t.truthId ? recorded.get(t.truthId) : null;
        if (!was || inLedger.has(t.truthId)) continue;
        const sceneId = beat.scene ?? null;
        if (!groups.has(sceneId)) {
          const at = scenes.findIndex(sc => sc.sceneId === sceneId);
          const scene = at >= 0 ? scenes[at] : null;
          groups.set(sceneId, { sceneId, n: at >= 0 ? at + 1 : null, label: sceneLabel(scene, at >= 0 ? at + 1 : null), scene, truths: [] });
        }
        const group = groups.get(sceneId);
        group.truths.push({
          id: t.truthId, subject: was.subject, fact: was.fact,
          shown: { subject: t.subject, fact: t.fact },
          asserter: was.by ?? 'narrator', basis: was.basis, narrationId: was.narrationId ?? null,
          sceneId, sessionId, sceneLocation: was.place ?? null,
          // Where its scene stopped, by the names the table uses now: the place a scene fact was filed on.
          sceneWhere: clean(group.scene?.last?.location ?? group.scene?.where?.location) || null,
          scenePlace: group.scene?.place ?? null,
        });
      }
    }
    const order = (g) => (g.n ?? Number.MAX_SAFE_INTEGER);
    return [...groups.values()].sort((a, b) => order(a) - order(b)).map(({ scene: _scene, ...g }) => g);
  } catch (err) {
    console.warn(`${MODULE_ID} | earlier scenes: the session record could not be read for its truths:`, err?.message ?? err);
    return [];
  }
}

/**
 * One of the session's earlier scenes' truths, by its id or by a prefix of it
 * (4+ characters) that names it alone — among the earlier scenes' truths and
 * the active scene's ledger both, so a prefix two truths share is no one's.
 *
 * @param {Object} campaignState
 * @param {string} needle
 * @param {{ source?: Object }} [opts]
 * @returns {{ truth: Object }|{ ambiguous: true }|null}
 */
export function findEarlierSceneTruth(campaignState, needle, { source } = {}) {
  const want = clean(needle);
  if (!want) return null;
  const truths = earlierSceneTruths(campaignState, { source }).flatMap(g => g.truths);
  const exact = truths.find(t => t.id === want);
  if (exact) return { truth: exact };
  if (want.length < 4) return null;
  const matches = truths.filter(t => t.id.startsWith(want));
  if (!matches.length) return null;
  const inLedger = (Array.isArray(campaignState?.sceneTruths) ? campaignState.sceneTruths : [])
    .some(t => typeof t?.id === 'string' && t.id.startsWith(want));
  return matches.length === 1 && !inLedger ? { truth: matches[0] } : { ambiguous: true };
}

/**
 * The recorded place a scene fact of an earlier scene was filed on at its
 * scene's end (sceneLifecycle.js truthPlace): the place its stamp — where it
 * was asserted — names, else the place its scene stopped at, else the place
 * the scene began at. Null when none is recorded: it was archived as Lore.
 */
function placeFiledOn(truth, campaignState) {
  try {
    for (const where of [truth.sceneLocation, truth.sceneWhere]) {
      const at = clean(where);
      if (!at) continue;
      const place = placeNamedBy(at, campaignState);
      if (place) return place;
    }
    const began = truth.scenePlace;
    return began?.id && PLACE_TYPES.has(began.type) ? { id: began.id, type: began.type } : null;
  } catch (err) {
    console.warn(`${MODULE_ID} | earlier scenes: the place a scene fact was filed on could not be read:`, err?.message ?? err);
    return null;
  }
}

/**
 * Strike one of the session's earlier scenes' truths (findEarlierSceneTruth's)
 * — see the header. A player may strike any but the GM's (canCorrectTruth).
 * The strike is kept with the session's strikes on the latest store, with
 * the name it changes (nameCorrectionOf — a strike against the truths the
 * active scene holds; a set after it reads this strike, kept); once that
 * write lands, the record's `truth.struck` and the name change; then the
 * copies taken back. Nothing is recorded or taken back for a write the world
 * refused, or one a new session overtook. Never throws.
 *
 * @param {Object} truth — one of earlierSceneTruths' truths
 * @param {Object} campaignState — the caller's copy: the active scene's ledger, for the name it changes
 * @param {{ isGM?: boolean, actor?: "gm"|"player" }} [ctx]
 * @param {{ about?: string|null }} [opts] — what the subject is, as the note of a name change says it
 * @returns {Promise<{ struck: Object|null, renamed: Object|null, why: "permission"|"write"|null }>}
 */
export async function strikeEarlierSceneTruth(truth, campaignState, ctx = {}, { about = null } = {}) {
  if (!truth?.id || !campaignState) return { struck: null, renamed: null, why: 'write' };
  if (!canCorrectTruth(truth, { isGM: ctx.isGM ?? true })) return { struck: null, renamed: null, why: 'permission' };
  const sessionId = campaignState.currentSessionId ?? truth.sessionId ?? null;
  const struck = {
    id: truth.id, subject: truth.subject, fact: truth.fact, asserter: truth.asserter ?? 'narrator',
    narrationId: truth.narrationId ?? null, sceneId: truth.sceneId ?? null, sessionId,
    ...(truth.sceneLocation ? { sceneLocation: truth.sceneLocation } : {}),
    retracted: true, retractedBy: ctx.actor ?? 'gm', retractedAt: Date.now(),
  };
  const renamed = nameCorrectionOf(campaignState, { subject: struck.subject, fact: struck.fact, struck: true, truthId: struck.id, about });
  if (!(await keepTheStrike(struck, sessionId, renamed))) return { struck: null, renamed: null, why: 'write' };
  // What its scene's end filed, taken back: the subject's tier details and the
  // session's Lore — and a scene fact's detail on the place it was filed on.
  try {
    await propagateRetraction(struck, campaignState);
    const place = struck.subject?.kind === 'scene' ? placeFiledOn(truth, campaignState) : null;
    if (place) await propagateRetraction({ ...struck, subject: { kind: 'entity', entityId: place.id, entityType: place.type } }, campaignState);
  } catch (err) {
    console.warn(`${MODULE_ID} | earlier scenes: taking back the struck truth's copies failed:`, err?.message ?? err);
  }
  return { struck, renamed, why: null };
}

/**
 * The strike kept with the session's strikes (retractions.js
 * rememberSessionRetractions, as a scene's end keeps its own — endedSceneRetractions),
 * and the name it changes, written onto the latest store on the client's
 * campaignState write chain; once the write lands, both on the session record
 * (issue #382) — the strike against the truth's own recorded id. It is in no
 * ledger now, so no ledger save observes it (record/ledgerDiff.js). False
 * when the world refused the write, or a new session began meanwhile (the
 * strike was the old session's): nothing is recorded. Never throws.
 */
async function keepTheStrike(struck, sessionId, renamed) {
  try {
    if (typeof game === 'undefined' || !game?.settings?.set) return false;
    const landed = await serialiseCampaignStateWrite(async () => {
      const latest = game.settings.get(MODULE_ID, 'campaignState') ?? null;
      if (!latest || !sessionId || (latest.currentSessionId ?? null) !== sessionId) return false;
      const target = { ...latest };
      const kept = { currentSessionId: sessionId, sessionRetractions: latest.sessionRetractions ?? null, sceneTruths: [struck] };
      rememberSessionRetractions(kept);
      target.sessionRetractions = kept.sessionRetractions;
      if (renamed) target.nameChanges = withNameChange(latest.nameChanges, { ...renamed, sessionId });
      await game.settings.set(MODULE_ID, 'campaignState', target);
      return true;
    }, 'strike an earlier scene\'s truth');
    if (!landed) return false;
    recordEvent('truth.struck', { session: sessionId, scene: struck.sceneId, ref: { truth: struck.id }, d: { by: struck.retractedBy } });
    if (renamed) recordNameChanged(renamed);
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | earlier scenes: the strike was not saved:`, err?.message ?? err);
    return false;
  }
}
