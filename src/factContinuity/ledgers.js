/**
 * STARFORGED COMPANION
 * src/factContinuity/ledgers.js
 *
 * In-memory truth and state ledgers for active-scene fact continuity.
 * See issue #227 (Fact Continuity) §4–5, §8.
 *
 * Pure module: every function mutates the campaignState object passed in but
 * performs no I/O. Persistence to game.settings is the caller's responsibility
 * (see src/narration/narrator.js wire-up).
 *
 * Exports:
 *   - applySidecar         Apply a parsed narrator sidecar to the two ledgers.
 *   - resolveSubject       Map a free-text subject ref to { kind, ... }.
 *   - promoteTextSubject   Rewrite text-subject ledger entries to entity-subject.
 *   - subjectKey           Stable key for indexing state-ledger entries.
 *   - subjectFromStateKey  The subject a state-ledger key stands for.
 *   - retractNarrations    Retract what X-carded (or superseded) narrations' sidecars wrote.
 */

import { resolveEntityName } from '../context/relevanceResolver.js';

/**
 * Apply a parsed sidecar to the active-scene ledgers. Mutates campaignState
 * in place.
 *
 * @param {Object} sidecar
 * @param {Array}  [sidecar.newTruths]    — [{ subject, fact }]
 * @param {Array}  [sidecar.stateChanges] — [{ subject, attribute, value }]
 * @param {Object} ctx
 * @param {Object} ctx.campaignState
 * @param {string|null} [ctx.sessionId]
 * @param {string|null} [ctx.sceneId]
 * @param {string|null} [ctx.moveId]
 * @param {"narrator"|"gm"|"player"} [ctx.asserter="narrator"]
 * @param {"narrator_sidecar"|"manual_truth_cmd"|"promoted_state"} [ctx.source="narrator_sidecar"]
 * @param {Array} [ctx.entities] — the entity roster (collectAllEntities:
 *   [{ _id, journalId, name, entityType }]) for subject resolution
 * @param {string|null} [ctx.narrationId] — the narration this sidecar came
 *   with (its narrator card carries the same id); stamped on every truth and
 *   state value written, so an X-Card can retract them (retractNarrations)
 * @param {Object|null} [ctx.storedLedger] — the store's scene ledgers as they
 *   stand now (`{ currentSessionId, currentSceneId, sceneTruths,
 *   sessionRetractions }` — narrator.js liveSceneLedger), which the
 *   re-assertion checks read beside the caller's object: that may be the move
 *   pipeline's working copy from before its confirm dialog, which never saw an
 *   X-Card played (and resumed) or a strike made while the move waited
 *   (issue #345 AA04). Its truths are read only while it is on this scene.
 * @returns {{ truthIds: string[], stateUpdates: Array<{ key: string, attribute: string }> }}
 */
export function applySidecar(sidecar, ctx) {
  const campaignState = ctx?.campaignState;
  if (!campaignState || !sidecar || typeof sidecar !== 'object') {
    return { truthIds: [], stateUpdates: [] };
  }

  ensureLedgerShape(campaignState);

  const sessionId = ctx.sessionId ?? campaignState.currentSessionId ?? null;
  const sessionNum = sessionNumberOf(campaignState);
  const sceneId   = ctx.sceneId   ?? campaignState.currentSceneId   ?? null;
  const moveId    = ctx.moveId    ?? null;
  const asserter  = ctx.asserter  ?? 'narrator';
  const source    = ctx.source    ?? 'narrator_sidecar';
  const entities  = Array.isArray(ctx.entities) ? ctx.entities : [];
  const stamp     = narrationStamp(ctx.narrationId);
  const now       = Date.now();
  // Where the scene stands as these truths are asserted — the narration's own
  // frame, else the frame in place (issue #326 D2).
  const sceneLocation = assertedLocation(campaignState, sidecar.sceneFrame);
  // The store's ledgers, for the re-assertion checks (issue #345 AA04): a
  // truth the X-Card or the table retracted, and a session block or strike,
  // that landed after the caller's copy was read stop a restatement too.
  const stored = (ctx.storedLedger && typeof ctx.storedLedger === 'object') ? ctx.storedLedger : null;
  const storedTruths = (stored && (stored.currentSceneId ?? null) === sceneId && Array.isArray(stored.sceneTruths))
    ? stored.sceneTruths : [];

  // Sync the state ledger's sanity tag to the active scene.
  campaignState.sceneState.sceneId = sceneId;

  const truthIds = [];
  for (const t of sidecar.newTruths ?? []) {
    if (!t || typeof t !== 'object') continue;
    const fact = typeof t.fact === 'string' ? t.fact.trim() : '';
    if (!fact) continue;
    const subjectRef = typeof t.subject === 'string' ? t.subject.trim() : '';
    if (!subjectRef) continue;

    const subject = resolveSubject(subjectRef, campaignState, entities);

    // Dedup (narrator-context audit 2026-07, NARR-TRUTH-DUP): the sidecar
    // instruction REQUIRES identity-anchor emissions, so a model that
    // re-anchors each turn would accrete duplicate truths — and truths are
    // exempt from the ledger token cap, growing marathon-scene prompts
    // unboundedly. Skip a newTruth whose subject + normalised fact already
    // exists. A RETRACTED match also blocks the append: a struck fact the
    // narrator re-asserts must not silently re-enter the ledger — the GM's
    // correction stands (manual `!truth set` bypasses this, GM authority).
    // The store's truths too: the copy may predate them (issue #345 AA04).
    const dupe = findEquivalentTruth(campaignState.sceneTruths, subject, fact)
      ?? findEquivalentTruth(storedTruths, subject, fact);
    if (dupe) {
      if (dupe.retracted) {
        console.debug?.(
          'starforged-companion | factContinuity: narrator re-asserted a retracted truth; append blocked:',
          fact,
        );
      }
      continue;
    }
    // A strike an earlier scene of this session kept blocks it too: the
    // session's CORRECTED still names it "do NOT re-assert", and the ring
    // still carries the prose that stated it (issue #342 Z42 — recorded live
    // beside CORRECTED, then archived as canon at the next scene end). So
    // does an earlier scene's X-Card retraction, kept unnamed
    // (XCARD-RETRACTION-SCENE-SCOPED) — the log names neither. Read from the
    // store as well: an X-Card on a narration whose scene has ended moves its
    // truths to the blocks there alone (issue #345 AA04). A scene fact is
    // checked where it is asserted: a strike at another place does not
    // stand here (issue #345 AA28).
    const names = subjectNames(subject, subjectRef, entities);
    const lookup = { blocked: true, place: sceneLocation };
    if (findSessionStrike(campaignState, subject, fact, names, lookup)
      || (stored && findSessionStrike(stored, subject, fact, names, lookup))) {
      console.debug?.('starforged-companion | factContinuity: narrator re-asserted a fact retracted earlier this session; append blocked.');
      continue;
    }

    const id = newTruthId();
    campaignState.sceneTruths.push({
      id,
      subject,
      fact,
      sessionId,
      sessionNum,
      sceneId,
      moveId,
      source,
      asserter,
      createdAt:   now,
      retracted:   false,
      retractedBy: null,
      retractedAt: null,
      correctedTo: null,
      migratedTo:  null,
      sceneLocation,
      ...stamp,
    });
    truthIds.push(id);
  }

  const stateUpdates = [];
  for (const c of sidecar.stateChanges ?? []) {
    if (!c || typeof c !== 'object') continue;
    const attribute = typeof c.attribute === 'string' ? c.attribute.trim() : '';
    if (!attribute) continue;
    const subjectRef = typeof c.subject === 'string' ? c.subject.trim() : '';
    if (!subjectRef) continue;
    const value = typeof c.value === 'string' ? c.value.trim() : c.value;

    const subject = resolveSubject(subjectRef, campaignState, entities);
    const key     = subjectKey(subject);
    const list    = (campaignState.sceneState.bySubject[key] ??= []);
    const idx     = list.findIndex(e => sameStateAttribute(e.attribute, attribute));
    // The value this one supersedes rides on it, so an X-Card on this
    // narration restores it (issue #326 W41: retracting narration B's
    // location left the dockmaster none, though narration A — kept — had
    // put him in the cargo bay).
    const previous = idx >= 0 ? supersededEntry(list[idx]) : null;
    const entry   = { attribute, value, updatedAt: now, ...stamp, ...(previous ? { previous } : {}) };
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    stateUpdates.push({ key, attribute });
  }

  return { truthIds, stateUpdates };
}

/**
 * A fresh id for one narration. Its narrator card carries it as
 * `narrationId`, and its sidecar stamps it on every ledger entry it writes
 * (applySidecar, applySceneFrame), so an X-Card played on that narration can
 * retract them (retractNarrations — issue #321 U07). The narrator makes one
 * per narration; a caller that posts a narration's card itself (the session
 * and clock vignettes, the inciting incident) makes one and passes it to both
 * the narration and its card.
 *
 * @returns {string}
 */
export function newNarrationId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `nar-${uuid ? uuid.replace(/-/g, '').slice(0, 16) : Math.random().toString(36).slice(2, 14)}`;
}

/** `{ narrationId }` for a usable narration id, else `{}` (nothing stamped). */
function narrationStamp(narrationId) {
  return (typeof narrationId === 'string' && narrationId.trim()) ? { narrationId: narrationId.trim() } : {};
}

/**
 * Where the scene stands for a truth asserted now: the asserting narration's
 * own frame location (its sidecar's sceneFrame), else the frame in place,
 * else null. Stamped on the truth as `sceneLocation`, so scene end files a
 * scene truth on the place it was asserted at — a scene spans travel, and
 * "the bar is called the Rusty Lantern", recorded at Bleakhold, used to land
 * on the card of wherever the scene ended (issue #326 D2).
 *
 * @param {Object} campaignState
 * @param {Object|null} [frame] — the asserting narration's sceneFrame
 * @returns {string|null}
 */
function assertedLocation(campaignState, frame = null) {
  const own = typeof frame?.location === 'string' ? frame.location.trim() : '';
  if (own) return own;
  const current = typeof campaignState?.sceneFrame?.location === 'string' ? campaignState.sceneFrame.location.trim() : '';
  return current || null;
}

/** `retractedBy` of a truth the X-Card removed (retractNarrations). */
export const XCARD_RETRACTED_BY = 'xcard';

/**
 * `retractedBy` of a truth a superseded narration wrote — Burn Momentum or
 * Improve Result replaced the outcome it narrated, or rewound the clock whose
 * trigger it narrated (retractNarrations `{ by }`, issue #338 D8). Like the
 * X-Card's, it renders nowhere and is never named under CORRECTED; unlike
 * it, it is no bar to a later narration stating the same fact — the
 * re-narration of the upgraded outcome, or the clock's next trigger.
 */
export const SUPERSEDED_RETRACTED_BY = 'superseded';

/**
 * Two state attributes name the same fact when they match case-blind and
 * trimmed: "Location" superseded nothing of "location", so CURRENT STATE
 * showed two contradictory lines for one fact (issue #326 W61 — subjects
 * already compared case-blind).
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function sameStateAttribute(a, b) {
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
}

/**
 * How many superseded values a state entry keeps (`previous`, newest first) —
 * and a scene frame the frames it superseded (issue #345 D3). An X-Card
 * removes the latest beat's narrations, so a short chain covers it; the bound
 * keeps a long scene's repeated updates from growing the setting.
 */
const STATE_PREVIOUS_DEPTH = 4;

/**
 * A state entry as the `previous` of the entry replacing it — its own chain
 * trimmed so the new entry keeps at most STATE_PREVIOUS_DEPTH values.
 *
 * @param {Object} entry
 * @returns {Object|null}
 */
function supersededEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const chain = [];
  for (let cur = entry; cur && chain.length < STATE_PREVIOUS_DEPTH; cur = cur.previous ?? null) chain.push(cur);
  return relinkStateChain(chain);
}

/**
 * Rebuild a state entry from its chain (newest first): each link's
 * `previous` is the next one, the last link has none.
 *
 * @param {Object[]} chain
 * @returns {Object|null}
 */
function relinkStateChain(chain) {
  let next = null;
  for (let i = chain.length - 1; i >= 0; i--) {
    const rest = { ...chain[i] };
    delete rest.previous;
    next = next ? { ...rest, previous: next } : rest;
  }
  return next;
}

/**
 * A state entry without the values the given narrations set: the newest value
 * left (the one a removed narration superseded, when the entry is its), with
 * the removed values gone from its `previous` chain too. null when every
 * value in the chain was theirs. A scene frame's chain the same way (issue
 * #345 D3).
 *
 * @param {Object} entry
 * @param {Set<string>} ids — the removed narrations
 * @returns {Object|null}
 */
function stateEntryWithout(entry, ids) {
  const chain = [];
  for (let cur = entry; cur; cur = cur.previous ?? null) {
    if (!ids.has(cur.narrationId)) chain.push(cur);
  }
  return relinkStateChain(chain);
}

/**
 * Retract what the given narrations' sidecars wrote to the active-scene
 * ledgers — the X-Card (issue #321 U07). Each truth they recorded is
 * retracted with `retractedBy: "xcard"`: it renders nowhere (not even under
 * CORRECTED — sessionRetractedFacts leaves it out), is never migrated at
 * scene end, and still blocks the narrator re-asserting it (applySidecar's
 * equivalence check). Each state value they set is removed — the value it
 * superseded, when it kept one (`previous`), is restored — and so is a scene
 * frame they wrote: the frame it replaced stands again, as its `previous`
 * link kept it (issue #345 D3 — the maintainer's option A, W41's shape; it
 * used to be cleared, and the redirect narration was built with no frame).
 *
 * The X-Card also takes over the table's strike of a truth they recorded
 * (XCARD-AFTER-STRIKE-STILL-NAMED): a bare strike — the GM's or a player's,
 * no replacement — is relabelled `retractedBy: "xcard"` (its `retractedAt`
 * kept), and the strike a scene end kept for the session
 * (`sessionRetractions.facts`, with its truth's `narrationId`) moves to the
 * session's unnamed X-Card blocks (`sessionRetractions.blocked`), which go on
 * blocking a re-assertion (XCARD-RETRACTION-SCENE-SCOPED). Left as the
 * table's, the CORRECTED block and the summary's leave-out list named the
 * removed content for the rest of the session (U07), and `!truth set` could
 * lift it (an X-Card's retraction is never lifted — issue #331 X31). A
 * superseded narration's (`by` SUPERSEDED_RETRACTED_BY) leaves the table's
 * strike as it is: the correction stands over the re-narration.
 *
 * A narration whose scene has ended left no truth in the ledger — the scene
 * end migrated them, and kept them on `sessionRetractions.narrated` (unnamed,
 * retractions.js rememberNarratedTruths): the X-Card moves its narrations'
 * there to the session's blocks too (XCARD-ENDED-SCENE-TRUTHS-UNBLOCKED).
 *
 * Replaces `sceneTruths`, `sceneState`, `sceneFrame` and (for the X-Card)
 * `sessionRetractions` on `campaignState` with new objects and never changes
 * the ones it was given, so the caller may pass a shallow copy of the stored
 * (cached) value. Pure, no I/O.
 *
 * `by`: the truths' `retractedBy` — the X-Card's by default; a Burn Momentum
 * or Improve Result that superseded the narrations passes
 * SUPERSEDED_RETRACTED_BY (issue #338 D8), which a later narration may
 * state again.
 *
 * @param {Object}   campaignState — the copy to update
 * @param {string[]} narrationIds  — the removed narrations (their cards' `narrationId`)
 * @param {{ by?: string }} [opts]
 * @returns {Object[]} the truths it retracted (the new entries; a strike it
 *   relabelled was retracted, and its copies reached, by the strike)
 */
export function retractNarrations(campaignState, narrationIds, { by = XCARD_RETRACTED_BY } = {}) {
  const ids = new Set((Array.isArray(narrationIds) ? narrationIds : []).filter(id => typeof id === 'string' && id));
  if (!campaignState || !ids.size) return [];
  const now = Date.now();
  const retracted = [];
  const xCard = by === XCARD_RETRACTED_BY;

  if (Array.isArray(campaignState.sceneTruths)) {
    campaignState.sceneTruths = campaignState.sceneTruths.map((t) => {
      if (!t || !ids.has(t.narrationId)) return t;
      // A superseded narration's truth the X-Card takes — the beat's struck
      // narration, removed with its re-narration (issue #347 D2): blocked
      // from now on, as the X-Card's own (a superseded truth is no bar to a
      // later narration restating it), and carried to what copied it.
      if (t.retracted && xCard && t.retractedBy === SUPERSEDED_RETRACTED_BY) {
        const next = { ...t, retractedBy: XCARD_RETRACTED_BY };
        retracted.push(next);
        return next;
      }
      if (t.retracted) return (xCard && isBareTableStrike(t)) ? { ...t, retractedBy: XCARD_RETRACTED_BY } : t;
      const next = { ...t, retracted: true, retractedBy: by, retractedAt: now };
      retracted.push(next);
      return next;
    });
  }

  // The session's kept strikes and closed narration truths of these
  // narrations: blocked from now on, named nowhere — anywhere, as the
  // X-Card's own blocks are: a strike's kept place is left behind (issue
  // #345 AA28).
  const kept = campaignState.sessionRetractions;
  const theirs = (list) => (Array.isArray(list) ? list : []).filter(f => ids.has(f?.narrationId));
  const struck = xCard ? theirs(kept?.facts) : [];
  const closed = xCard ? theirs(kept?.narrated) : [];
  if (struck.length || closed.length) {
    campaignState.sessionRetractions = {
      ...kept,
      ...(struck.length ? { facts: kept.facts.filter(f => !ids.has(f?.narrationId)) } : {}),
      ...(closed.length ? { narrated: kept.narrated.filter(f => !ids.has(f?.narrationId)) } : {}),
      blocked: withXCardBlocks(kept.blocked, [...struck, ...closed].map(f => ({ ...f, place: null }))),
    };
  }

  const bySubject = campaignState.sceneState?.bySubject;
  if (bySubject && typeof bySubject === 'object') {
    const kept = {};
    for (const [key, list] of Object.entries(bySubject)) {
      if (!Array.isArray(list)) { kept[key] = list; continue; }
      // A value a removed narration set gives way to the one it superseded
      // (issue #326 W41), and no kept value can later fall back to one of
      // theirs.
      const rest = list.map(e => (e && typeof e === 'object' ? stateEntryWithout(e, ids) : e)).filter(Boolean);
      if (rest.length) kept[key] = rest;
    }
    campaignState.sceneState = { ...campaignState.sceneState, bySubject: kept };
  }

  // A frame they wrote gives way to the one it replaced — the newest in its
  // `previous` chain no removed narration wrote — and no kept frame can later
  // fall back to one of theirs (issue #345 D3).
  const frame = campaignState.sceneFrame;
  if (frame && typeof frame === 'object') {
    let theirs = false;
    for (let cur = frame; cur && typeof cur === 'object'; cur = cur.previous ?? null) {
      if (ids.has(cur.narrationId)) { theirs = true; break; }
    }
    if (theirs) campaignState.sceneFrame = stateEntryWithout(frame, ids);
  }
  return retracted;
}

/**
 * A retracted truth the table struck with no replacement — not the X-Card's,
 * not a superseded narration's, not a Replace's original (findBareStrike's
 * test, for a truth known to be retracted).
 *
 * @param {Object} t
 * @returns {boolean}
 */
function isBareTableStrike(t) {
  return !t.correctedTo && t.retractedBy !== XCARD_RETRACTED_BY && t.retractedBy !== SUPERSEDED_RETRACTED_BY;
}

/**
 * A Replace's struck original: a truth the table retracted with a correction
 * (`correctedTo`) that says something else — the replacement. A strike a
 * `!truth set` lifted is linked the same way (setTruth), to a truth restating
 * it: the fact stands again, so it is not one. Like the X-Card's, it is never
 * named — the replacement stands — never lifted, and a scene end keeps it on
 * the session's unnamed blocks (retractions.js rememberSessionRetractions —
 * issue #345 AA05).
 *
 * @param {Object} t
 * @param {Map<string, Object>} byId — the scene's truths by id
 * @returns {boolean}
 */
export function isReplacedOriginal(t, byId) {
  if (!t?.retracted || !t.correctedTo || t.retractedBy === XCARD_RETRACTED_BY
    || t.retractedBy === SUPERSEDED_RETRACTED_BY || !String(t.fact ?? '').trim()) return false;
  const correction = byId?.get?.(t.correctedTo);
  return !(correction && findEquivalentTruth([correction], t.subject, t.fact));
}

/**
 * Apply a normalised scene-frame snapshot (Cluster A4 — see
 * docs/narrator/narrator-memory-architecture.md) to the campaign state.
 * The frame is a full replacement snapshot, not a delta: the narrator emits
 * the current scene's location / present subjects / one-line situation on
 * every response, and the latest emission wins. The frame it replaces — this
 * scene's — rides on it as `previous` (a bounded chain, newest first), so an
 * X-Card on this narration puts that frame back (retractNarrations — issue
 * #345 D3, W41's shape for state values); nothing renders the chain. Mutates
 * campaignState in place; persistence is the caller's responsibility (same
 * contract as applySidecar).
 *
 * @param {Object|null} frame — { location, present[], situation } or null
 * @param {Object} campaignState
 * @param {Object} [opts]
 * @param {string|null} [opts.narrationId] — the narration that wrote it,
 *   stamped so an X-Card can clear it (retractNarrations)
 * @returns {boolean} true when the frame was applied
 */
export function applySceneFrame(frame, campaignState, { narrationId = null } = {}) {
  if (!campaignState || !frame || typeof frame !== 'object') return false;
  const location  = typeof frame.location  === 'string' ? frame.location.trim()  : '';
  const situation = typeof frame.situation === 'string' ? frame.situation.trim() : '';
  const present   = Array.isArray(frame.present)
    ? frame.present.filter(p => typeof p === 'string' && p.trim()).map(p => p.trim())
    : [];
  if (!location && !situation && !present.length) return false;

  const sceneId = campaignState.currentSceneId ?? null;
  const prior   = campaignState.sceneFrame;
  const previous = (prior && typeof prior === 'object' && (prior.sceneId ?? null) === sceneId)
    ? supersededEntry(prior) : null;
  campaignState.sceneFrame = {
    location,
    present,
    situation,
    sceneId,
    updatedAt: Date.now(),
    ...narrationStamp(narrationId),
    ...(previous ? { previous } : {}),
  };
  // A truth this narration asserted before any frame stood is where its frame
  // now says (issue #326 D2) — a caller may apply the sidecar's truths before
  // its frame.
  if (location && Array.isArray(campaignState.sceneTruths)) {
    const nid = narrationStamp(narrationId).narrationId ?? null;
    for (const t of campaignState.sceneTruths) {
      if (t && t.sceneLocation === null && !t.retracted && (t.narrationId ?? null) === nid) t.sceneLocation = location;
    }
  }
  return true;
}

/**
 * Resolve a free-text subject reference into a structured subject object.
 *
 *   "scene.lighting"  → { kind: "scene",  sceneId }   (attribute kept in fact text)
 *   "Vance"           → { kind: "entity", entityId, entityType }  if entity matched
 *   "Covenant officer"→ { kind: "text",   text }      fallback
 *
 * Entity matching is resolveEntityName's bounded ladder (full name → title-
 * stripped full name → unique capitalised first / last name). `entityId` is
 * the host document id, the id relevance matches and scene-end migration use.
 *
 * @param {string} subjectRef
 * @param {Object} campaignState
 * @param {Array}  [entities] — the roster (collectAllEntities)
 * @returns {Object}
 */
export function resolveSubject(subjectRef, campaignState, entities = []) {
  const ref = typeof subjectRef === 'string' ? subjectRef.trim() : '';
  if (!ref) return { kind: 'text', text: '' };

  // Scene-scoped: "scene" or "scene.<attribute>"
  if (/^scene(\.|$)/i.test(ref)) {
    return { kind: 'scene', sceneId: campaignState?.currentSceneId ?? null };
  }

  const hit = resolveEntityName(ref, entities, campaignState?.dismissedEntities ?? []);
  const entityId = hit?.journalId ?? hit?._id;
  if (entityId) {
    return { kind: 'entity', entityId, entityType: hit.entityType ?? null };
  }

  return { kind: 'text', text: ref };
}

/**
 * Rewrite every ledger entry whose subject is a text match for textValue to
 * an entity subject pointing at entityId. Mutates campaignState in place and
 * returns the count of entries rewritten.
 *
 * Used by the entity panel "promote to entity" affordance after a free-text
 * subject has been backed by a real entity record.
 *
 * @param {string} textValue
 * @param {Object} entityRef — { entityId, entityType }
 * @param {Object} campaignState
 * @returns {number}
 */
export function promoteTextSubject(textValue, entityRef, campaignState) {
  const text = typeof textValue === 'string' ? textValue.trim() : '';
  if (!text || !entityRef?.entityId || !campaignState) return 0;
  ensureLedgerShape(campaignState);

  const targetKey = text.toLowerCase();
  let rewritten = 0;
  for (const entry of campaignState.sceneTruths) {
    if (entry?.subject?.kind === 'text' &&
        typeof entry.subject.text === 'string' &&
        entry.subject.text.toLowerCase() === targetKey) {
      entry.subject = {
        kind:       'entity',
        entityId:   entityRef.entityId,
        entityType: entryRefType(entityRef),
      };
      rewritten += 1;
    }
  }

  // Reindex sceneState entries keyed by the old text subject.
  const oldKey = subjectKey({ kind: 'text', text });
  const newKey = subjectKey({ kind: 'entity', entityId: entityRef.entityId });
  if (oldKey !== newKey && campaignState.sceneState.bySubject[oldKey]) {
    const merged = campaignState.sceneState.bySubject[newKey] ?? [];
    for (const e of campaignState.sceneState.bySubject[oldKey]) {
      const idx = merged.findIndex(m => sameStateAttribute(m.attribute, e.attribute));
      if (idx >= 0) merged[idx] = e; else merged.push(e);
    }
    campaignState.sceneState.bySubject[newKey] = merged;
    delete campaignState.sceneState.bySubject[oldKey];
  }

  return rewritten;
}

/**
 * promoteTextSubject's inverse, for an entity whose card is gone: every
 * ledger entry about it goes back to a text subject under its name. The
 * X-Card's removal of a connection its narration created deletes the card
 * (connection.retractNarrationConnections, issue #338 D6(ii)), and the facts
 * a kept narration had recorded about the name — promoted to the card when
 * it was made — stood keyed to an id no card answers: out of every prompt
 * (an entity subject is in scope only when matched) and lost at scene end
 * (MAKE-CONNECTION-PENDING-CONFIRM-UNSTAMPED). A later card of that name
 * promotes them again.
 *
 * Replaces `sceneTruths` and `sceneState` on `campaignState` with new objects
 * and never changes the ones it was given, so the caller may pass a shallow
 * copy of the stored (cached) value. Pure, no I/O.
 *
 * @param {string} entityId — the gone card's host id
 * @param {string} name     — its name
 * @param {Object} campaignState — the copy to update
 * @returns {number} truths rewritten, plus one for a state subject moved
 */
export function demoteEntitySubject(entityId, name, campaignState) {
  const text = typeof name === 'string' ? name.trim() : '';
  if (!entityId || !text || !campaignState) return 0;
  const isGone = (s) => s?.kind === 'entity' && s.entityId === entityId;
  let rewritten = 0;
  if (Array.isArray(campaignState.sceneTruths) && campaignState.sceneTruths.some(t => isGone(t?.subject))) {
    campaignState.sceneTruths = campaignState.sceneTruths.map((t) => {
      if (!isGone(t?.subject)) return t;
      rewritten += 1;
      return { ...t, subject: { kind: 'text', text } };
    });
  }
  const bySubject = campaignState.sceneState?.bySubject;
  const oldKey = subjectKey({ kind: 'entity', entityId });
  if (bySubject && typeof bySubject === 'object' && Array.isArray(bySubject[oldKey])) {
    const newKey = subjectKey({ kind: 'text', text });
    const merged = [...(Array.isArray(bySubject[newKey]) ? bySubject[newKey] : [])];
    for (const e of bySubject[oldKey]) {
      const idx = merged.findIndex(m => sameStateAttribute(m?.attribute, e?.attribute));
      if (idx >= 0) merged[idx] = e; else merged.push(e);
    }
    const next = { ...bySubject, [newKey]: merged };
    delete next[oldKey];
    campaignState.sceneState = { ...campaignState.sceneState, bySubject: next };
    rewritten += 1;
  }
  return rewritten;
}

/**
 * State attributes that say where a character is and what shape they are in —
 * the stateChanges the sidecar instruction REQUIRES. The ledger block keeps
 * them longest under its token cap (A6), and scene end keeps a recorded
 * entity's on its card as its last known whereabouts (C1) — issue #286.
 */
export const WHEREABOUTS_ATTRIBUTES = Object.freeze([
  'location', 'vessel', 'aboard', 'whereabouts', 'condition', 'health', 'injuries', 'wounds',
]);

/** Prefix that marks a state-ledger key as an entity's (see subjectKey). */
const ENTITY_KEY_PREFIX = 'entity:';

/**
 * Stable string key for a resolved subject. Used as the lookup key in
 * campaignState.sceneState.bySubject and as the dedupe key for state updates.
 *
 *   entity → "entity:<entityId>"
 *   scene  → "scene"
 *   text   → lowercased text
 *
 * The entity prefix makes a key say what it is (issue #286): bare ids were told
 * apart from text by a mixed-case heuristic, which filed an all-lowercase id as
 * text. An entity subject with no id has no key.
 *
 * @param {Object} subject
 * @returns {string}
 */
export function subjectKey(subject) {
  if (!subject || typeof subject !== 'object') return '';
  switch (subject.kind) {
    case 'entity': return subject.entityId ? `${ENTITY_KEY_PREFIX}${subject.entityId}` : '';
    case 'scene':  return 'scene';
    case 'text':   return String(subject.text ?? '').trim().toLowerCase();
    default:       return '';
  }
}

/**
 * The subject a state-ledger key stands for — the inverse of subjectKey, for
 * the ledger block, the correction dialog and the scene-end state rollup.
 *
 * @param {string} key
 * @returns {{ kind: "scene" } | { kind: "entity", entityId: string } | { kind: "text", text: string }}
 */
export function subjectFromStateKey(key) {
  const k = String(key ?? '');
  if (k === 'scene') return { kind: 'scene' };
  if (k.startsWith(ENTITY_KEY_PREFIX) && k.length > ENTITY_KEY_PREFIX.length) {
    return { kind: 'entity', entityId: k.slice(ENTITY_KEY_PREFIX.length) };
  }
  return { kind: 'text', text: k };
}

// ---------------------------------------------------------------------------
// Corrections — fact-continuity scope §10
// ---------------------------------------------------------------------------

/**
 * Mark a truth retracted in place. Does not remove the entry — strike-through
 * is recorded for audit (scope §4.1).
 *
 * Returns the matched entry on success, null when no entry has the given ID,
 * the entry is already retracted, or the actor lacks permission. Permission
 * is enforced via canCorrectTruth. An entry already retracted — a strike, a
 * Replace's original, the X-Card's — is left as it is: relabelling the
 * X-Card's retraction a GM's made it a strike `!truth set` could lift (issue
 * #336 Y30; U07: an X-Card retraction is never lifted).
 *
 * @param {string} truthId — full id or 6-char prefix
 * @param {Object} campaignState
 * @param {Object} [ctx]
 * @param {boolean} [ctx.isGM=true]
 * @param {"gm"|"player"} [ctx.actor="gm"]
 * @returns {Object|null}
 */
export function strikeTruth(truthId, campaignState, ctx = {}) {
  if (!campaignState || !truthId) return null;
  ensureLedgerShape(campaignState);
  const entry = findTruthByIdOrPrefix(campaignState.sceneTruths, truthId);
  if (!entry || entry.retracted) return null;
  if (!canCorrectTruth(entry, ctx)) return null;
  entry.retracted   = true;
  entry.retractedBy = ctx.actor ?? 'gm';
  entry.retractedAt = Date.now();
  return entry;
}

/**
 * Replace a truth (strike the old, append a new one with `correctedTo`
 * link). Returns { struck, replacement } on success, null on permission /
 * lookup failure — or when the entry is already retracted: a Replace saved
 * after the X-Card removed its fact (the prompt was open meanwhile)
 * overwrote the X-Card's mark and filed the removed fact again, live, under
 * the GM's wording (issue #336 Y30; U07).
 *
 * @param {string} truthId
 * @param {Object} replacement — { subject, fact, sessionId, sceneId, moveId }
 * @param {Object} campaignState
 * @param {Object} [ctx]
 * @returns {{ struck: Object, replacement: Object }|null}
 */
export function replaceTruth(truthId, replacement, campaignState, ctx = {}) {
  if (!campaignState || !truthId || !replacement) return null;
  ensureLedgerShape(campaignState);
  const entry = findTruthByIdOrPrefix(campaignState.sceneTruths, truthId);
  if (!entry || entry.retracted) return null;
  if (!canCorrectTruth(entry, ctx)) return null;

  const newId = newTruthId();
  const now   = Date.now();
  const fact  = String(replacement.fact ?? '').trim();
  if (!fact) return null;

  const newEntry = {
    id:          newId,
    subject:     replacement.subject ?? entry.subject,
    fact,
    sessionId:   replacement.sessionId ?? entry.sessionId,
    sessionNum:  replacement.sessionNum ?? entry.sessionNum ?? sessionNumberOf(campaignState),
    sceneId:     replacement.sceneId   ?? entry.sceneId,
    moveId:      replacement.moveId    ?? entry.moveId,
    source:      'manual_truth_cmd',
    asserter:    ctx.actor ?? 'gm',
    createdAt:   now,
    retracted:   false,
    retractedBy: null,
    retractedAt: null,
    correctedTo: null,
    migratedTo:  null,
    // A corrected wording stays where the fact was established (issue #326 D2).
    sceneLocation: entry.sceneLocation !== undefined ? entry.sceneLocation : assertedLocation(campaignState),
  };

  entry.retracted   = true;
  entry.retractedBy = ctx.actor ?? 'gm';
  entry.retractedAt = now;
  entry.correctedTo = newId;
  campaignState.sceneTruths.push(newEntry);

  return { struck: entry, replacement: newEntry };
}

/**
 * Assert a new truth without going through the narrator. Use for manual
 * GM-driven corrections via the dialog or !truth set commands.
 *
 * @param {Object} subjectRef — resolved subject ({kind, ...})
 * @param {string} fact
 * @param {Object} campaignState
 * @param {Object} [ctx] — `names`: the names the subject goes by
 *   (subjectNames), to find a strike an earlier scene of this session kept
 * @returns {Object|null} the new truth entry
 */
export function setTruth(subjectRef, fact, campaignState, ctx = {}) {
  if (!campaignState || !subjectRef) return null;
  const cleanFact = String(fact ?? '').trim();
  if (!cleanFact) return null;
  ensureLedgerShape(campaignState);

  // Re-establishing a struck fact lifts the strike, as a Replace does: the
  // prompt carried the fact as binding and under CORRECTED ("do NOT
  // re-assert") together for the rest of the session. A player may not
  // overturn a GM's strike — they may not strike a GM truth either (issue
  // #326 W60). A strike an earlier scene of this session kept is lifted the
  // same way — dropped from `sessionRetractions` on this copy; the caller
  // writes the drop onto the store (dropSessionStrike — issue #342 Z42) —
  // where it stands: a scene fact struck at another place is that place's,
  // and this set is this place's own (findSessionStrike, issue #345 AA28).
  const strike = findBareStrike(campaignState.sceneTruths, subjectRef, cleanFact);
  const kept   = strike ? null : findSessionStrike(campaignState, subjectRef, cleanFact, ctx.names ?? []);
  const lifted = strike ?? kept;
  const isGM = ctx.isGM ?? true;
  if (lifted && !isGM && (lifted.retractedBy === 'gm' || lifted.asserter === 'gm')) return null;
  // Nor what the X-Card removed or a Replace corrected — this scene's, or one
  // a scene end kept unnamed: those are never lifted, and a player's set made
  // the removed fact binding again (issue #345 D4, the maintainer's option A).
  // A GM's own set is still recorded.
  if (!isGM && findSessionBlock(campaignState, subjectRef, cleanFact, ctx.names ?? [])) return null;

  const entry = {
    id:          newTruthId(),
    subject:     subjectRef,
    fact:        cleanFact,
    sessionId:   ctx.sessionId ?? campaignState.currentSessionId ?? null,
    sessionNum:  sessionNumberOf(campaignState),
    sceneId:     ctx.sceneId   ?? campaignState.currentSceneId   ?? null,
    moveId:      ctx.moveId    ?? null,
    source:      ctx.source    ?? 'manual_truth_cmd',
    asserter:    ctx.actor     ?? 'gm',
    createdAt:   Date.now(),
    retracted:   false,
    retractedBy: null,
    retractedAt: null,
    correctedTo: null,
    migratedTo:  null,
    sceneLocation: assertedLocation(campaignState),   // issue #326 D2
  };
  campaignState.sceneTruths.push(entry);
  if (strike) strike.correctedTo = entry.id;
  if (kept) dropSessionStrike(campaignState, kept);
  return entry;
}

/**
 * The names a resolved subject goes by, for matching a strike a scene kept
 * (sessionRetractions keeps its subject's name — retractions.js
 * rememberSessionRetractions): the reference it was resolved from and, for a
 * recorded entity, the roster's name for it.
 *
 * @param {Object} subject — resolveSubject's result
 * @param {string} subjectRef — what it was resolved from
 * @param {Array} [entities] — the roster (collectAllEntities)
 * @returns {string[]}
 */
export function subjectNames(subject, subjectRef, entities = []) {
  const names = [String(subjectRef ?? '').trim()];
  if (subject?.kind === 'entity') {
    const hit = (Array.isArray(entities) ? entities : []).find(e => (e?.journalId ?? e?._id) === subject.entityId);
    if (typeof hit?.name === 'string') names.push(hit.name.trim());
  }
  return names.filter(Boolean);
}

/**
 * A strike an earlier scene of this session kept (`sessionRetractions`,
 * issue #286 B6) of this subject and fact, or null. The session's CORRECTED
 * names it until the session ends, so it blocks a narrator's re-assertion
 * (applySidecar) and a GM's `!truth set` lifts it (setTruth), as the active
 * scene's strike does (issue #342 Z42 — the strike outlived its scene as
 * text only). A kept strike is its subject and its fact (issue #321 U39):
 * the subject by its key when the strike kept one, else by the name it was
 * kept under; the fact compared as findEquivalentTruth compares.
 *
 * `blocked`: the write half's lookup (applySidecar) — the session's X-Card
 * retractions kept past their scene (`sessionRetractions.blocked`) match
 * too, matched the same way. They block a re-assertion as a strike does but
 * are named nowhere and never lifted (XCARD-RETRACTION-SCENE-SCOPED), so the
 * lift (setTruth, `!truth set`) leaves them out.
 *
 * `place`: where the fact is asserted now (default: the scene frame's
 * location). A scene fact is a fact about its place (issue #326 D2), so a
 * kept strike of one — or a Replace's original — stands only at the place it
 * was asserted at (its kept `place`, keptStrikeStandsAt): the strike at
 * Bleakhold blocked the same words as Vantage Station's own scene fact for the
 * rest of the session, and a `!truth set` there lifted it (issue #345 AA28).
 * The X-Card's blocks keep no place — a removed scene fact stays blocked
 * anywhere.
 *
 * @param {Object} campaignState
 * @param {Object} subject — resolved subject ({kind, ...})
 * @param {string} fact
 * @param {string[]} [names] — the names the subject goes by (subjectNames)
 * @param {{ blocked?: boolean, place?: string|null }} [opts]
 * @returns {Object|null} the kept entry
 */
export function findSessionStrike(campaignState, subject, fact, names = [], { blocked = false, place } = {}) {
  const kept = sessionKept(campaignState);
  if (!kept) return null;
  const list = [
    ...(Array.isArray(kept.facts) ? kept.facts : []),
    ...(blocked && Array.isArray(kept.blocked) ? kept.blocked : []),
  ];
  const here = place !== undefined ? place : assertedLocation(campaignState);
  return findKeptEntry(list, subject, fact, names, here);
}

/** This session's `sessionRetractions`, or null when they are another session's. */
function sessionKept(campaignState) {
  const sessionId = campaignState?.currentSessionId ?? null;
  const kept = campaignState?.sessionRetractions;
  return (sessionId && kept?.sessionId === sessionId) ? kept : null;
}

/**
 * A kept entry (`{ label, fact, subjectKey, place? }`) of this subject and
 * fact that stands at `here`: the subject by its key when the entry kept one,
 * else by name; the fact compared as findEquivalentTruth compares; the place
 * as keptStrikeStandsAt decides.
 */
function findKeptEntry(list, subject, fact, names, here) {
  const norm = normaliseFactText(fact);
  if (!norm || !Array.isArray(list) || !list.length) return null;
  const key = subjectKey(subject);
  const labels = new Set([...(Array.isArray(names) ? names : []), ...(subject?.kind === 'scene' ? ['scene'] : [])]
    .map(n => String(n ?? '').trim().toLowerCase()).filter(Boolean));
  return list.find(f => f && normaliseFactText(f.fact) === norm
    && ((!!f.subjectKey && f.subjectKey === key) || labels.has(String(f.label ?? '').trim().toLowerCase()))
    && keptStrikeStandsAt(f.place, here)) ?? null;
}

/**
 * What a player's `!truth set` of this subject and fact may not re-establish
 * (issue #345 D4, the maintainer's option A): a retraction the table cannot
 * lift — the active scene's X-Card retraction or Replace original
 * (isReplacedOriginal), or one an earlier scene of the session kept on the
 * unnamed blocks (`sessionRetractions.blocked`, where it stands — a
 * Replace's scene fact at its place, the X-Card's anywhere). A player's set
 * of the fact the X-Card removed was recorded as binding — in its scene
 * (findBareStrike passes over the X-Card's) and in a later one (the lift
 * reads no block) — while a set over a GM's mere strike was refused (W60). A
 * GM's set is the GM's authority, and is recorded (setTruth). Null when
 * nothing blocks it.
 *
 * @param {Object} campaignState
 * @param {Object} subject — resolved subject ({kind, ...})
 * @param {string} fact
 * @param {string[]} [names] — the names the subject goes by (subjectNames)
 * @returns {Object|null} the active scene's truth, or the kept block
 */
export function findSessionBlock(campaignState, subject, fact, names = []) {
  const truths = Array.isArray(campaignState?.sceneTruths) ? campaignState.sceneTruths : [];
  const byId = new Map(truths.filter(t => t?.id).map(t => [t.id, t]));
  const removed = truths.filter(t => t?.retracted
    && (t.retractedBy === XCARD_RETRACTED_BY || isReplacedOriginal(t, byId)));
  const active = findEquivalentTruth(removed, subject, fact);
  if (active) return active;
  const kept = sessionKept(campaignState);
  return kept ? findKeptEntry(kept.blocked, subject, fact, names, assertedLocation(campaignState)) : null;
}

/** Articles a place's wording drops before two are compared ("the docks" ~ "docks"). */
const PLACE_ARTICLES = new Set(['a', 'an', 'the']);

/** A place's words, lowercased, punctuation and articles dropped. */
function placeWords(place) {
  return String(place ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter(w => w && !PLACE_ARTICLES.has(w)).join(' ');
}

/**
 * Whether a strike of a scene fact the session kept — asserted at `kept`
 * (the struck truth's `sceneLocation`) — stands at `here` (issue #345 AA28):
 * when either place is unknown (a truth asserted before any frame stood, a
 * scene with no frame), or one's words name the other ("Bleakhold" ~ "the
 * Bleakhold docks" — a frame's location is the narrator's wording, so one
 * place reads several ways). The write block (findSessionStrike), the lift
 * and the CORRECTED block (retractions.js sessionRetractedFacts) all ask it,
 * so a fact is never binding and under CORRECTED at once (W60). Pure.
 *
 * @param {string|null|undefined} kept
 * @param {string|null|undefined} here
 * @returns {boolean}
 */
export function keptStrikeStandsAt(kept, here) {
  const k = placeWords(kept);
  const h = placeWords(here);
  if (!k || !h) return true;
  return ` ${h} `.includes(` ${k} `) || ` ${k} `.includes(` ${h} `);
}

/** How many X-Card retractions a session keeps blocking past their scene (as `xCardedNarrationIds` keeps). */
const SESSION_XCARD_BLOCK_CAP = 50;

/**
 * The session's unnamed X-Card blocks with `adds` (kept strikes or retracted
 * truths, as `{ label, fact, subjectKey, narrationId, truthId, place? }`):
 * each once — by subject and fact, and place — the newest kept up to the cap
 * (XCARD-RETRACTION-SCENE-SCOPED). A block is what findSessionStrike's write
 * half matches, and nothing renders it. `place` is a Replace's original's
 * scene fact's (issue #345 AA28 — it stands only there); the X-Card's own
 * blocks carry none. A new array; pure.
 *
 * @param {Array<Object>|undefined} blocked — the session's blocks so far
 * @param {Array<Object>} adds
 * @returns {Array<Object>}
 */
export function withXCardBlocks(blocked, adds) {
  const out = (Array.isArray(blocked) ? blocked : []).filter(Boolean);
  const label = (b) => String(b?.label ?? '').trim().toLowerCase();
  for (const a of Array.isArray(adds) ? adds : []) {
    const fact = String(a?.fact ?? '').trim();
    if (!fact) continue;
    const place = typeof a.place === 'string' && a.place.trim() ? a.place.trim() : null;
    const entry = {
      label:       String(a.label ?? '').trim(),
      fact,
      subjectKey:  typeof a.subjectKey === 'string' && a.subjectKey ? a.subjectKey : null,
      narrationId: typeof a.narrationId === 'string' && a.narrationId ? a.narrationId : null,
      truthId:     typeof a.truthId === 'string' && a.truthId ? a.truthId : null,
      ...(place ? { place } : {}),
    };
    if (out.some(b => normaliseFactText(b.fact) === normaliseFactText(fact)
      && ((entry.subjectKey && b.subjectKey === entry.subjectKey) || label(b) === label(entry))
      && placeWords(b.place) === placeWords(place))) continue;
    out.push(entry);
  }
  return out.slice(-SESSION_XCARD_BLOCK_CAP);
}

/**
 * Drop a kept strike (findSessionStrike's entry) from `sessionRetractions` —
 * a lift: CORRECTED and the summary's leave-out list stop naming it. Matched
 * by the struck truth's id when the entry kept one, else by its label and
 * fact. The object is replaced, never changed. Mutates campaignState.
 *
 * @param {Object} campaignState
 * @param {Object} strike — the kept entry
 * @returns {boolean} true when an entry was dropped
 */
export function dropSessionStrike(campaignState, strike) {
  const kept = campaignState?.sessionRetractions;
  if (!strike || !Array.isArray(kept?.facts)) return false;
  const same = (f) => (strike.truthId
    ? f?.truthId === strike.truthId
    : String(f?.label ?? '').trim().toLowerCase() === String(strike.label ?? '').trim().toLowerCase()
      && normaliseFactText(f?.fact) === normaliseFactText(strike.fact));
  const facts = kept.facts.filter(f => !same(f));
  if (facts.length === kept.facts.length) return false;
  campaignState.sessionRetractions = { ...kept, facts };
  return true;
}

/**
 * The active scene's bare strike of this subject + fact — retracted by the
 * table (not the X-Card, not a superseded narration's — issue #338 D8 — not a
 * Replace's struck original), the fact compared as findEquivalentTruth and
 * findSessionStrike compare it (normaliseFactText: case, spacing and a
 * trailing full stop aside — issue #345 AA26: "Vance Is dead." missed the
 * strike, so a player's set over the GM's was recorded and a GM's lifted
 * nothing) — or null. setTruth lifts it; the `!truth set` card names a
 * player's set refused over a GM's strike.
 *
 * @param {Object[]} truths
 * @param {Object} subjectRef
 * @param {string} fact
 * @returns {Object|null}
 */
export function findBareStrike(truths, subjectRef, fact) {
  const key = subjectKey(subjectRef);
  const norm = normaliseFactText(fact);
  if (!norm) return null;
  return (Array.isArray(truths) ? truths : []).find(t =>
    t?.retracted && isBareTableStrike(t)
    && subjectKey(t.subject) === key
    && normaliseFactText(t.fact) === norm) ?? null;
}

/**
 * Remove a single attribute from the state ledger for a subject. Returns
 * true if an entry was struck, false if nothing matched.
 *
 * @param {string} key — subjectKey ("entity:<id>", "scene", or lowercased text)
 * @param {string} attribute
 * @param {Object} campaignState
 * @returns {boolean}
 */
export function strikeStateValue(key, attribute, campaignState) {
  if (!campaignState || !key || !attribute) return false;
  ensureLedgerShape(campaignState);
  const list = campaignState.sceneState.bySubject[key];
  if (!Array.isArray(list) || !list.length) return false;
  const idx = list.findIndex(e => sameStateAttribute(e.attribute, attribute));
  if (idx < 0) return false;
  list.splice(idx, 1);
  if (!list.length) delete campaignState.sceneState.bySubject[key];
  return true;
}

/**
 * Set or replace a state value for a subject + attribute. Same semantics as
 * the sidecar state-change apply, but exposed for the dialog and the
 * !state set command.
 *
 * @param {string} key
 * @param {string} attribute
 * @param {*} value
 * @param {Object} campaignState
 * @returns {{ key: string, attribute: string }|null}
 */
export function setStateValue(key, attribute, value, campaignState) {
  if (!campaignState || !key || !attribute) return null;
  if (value === undefined || value === null || value === '') return null;
  ensureLedgerShape(campaignState);
  const list  = (campaignState.sceneState.bySubject[key] ??= []);
  const entry = { attribute, value, updatedAt: Date.now() };
  const idx   = list.findIndex(e => sameStateAttribute(e.attribute, attribute));
  if (idx >= 0) list[idx] = entry; else list.push(entry);
  return { key, attribute };
}

/**
 * Permission gate for truth corrections (scope §10.1). The GM may correct
 * anything. A player may correct any truth EXCEPT one originally asserted
 * by the GM.
 *
 * @param {Object} truth
 * @param {Object} [ctx]
 * @param {boolean} [ctx.isGM=true]
 * @returns {boolean}
 */
export function canCorrectTruth(truth, ctx = {}) {
  if (!truth) return false;
  const isGM = ctx.isGM ?? true;
  if (isGM) return true;
  return truth.asserter !== 'gm';
}

/**
 * Find an existing truth equivalent to (subject, fact) — same subjectKey and
 * the same fact text after normalisation. Includes retracted entries so a
 * struck fact blocks narrator re-assertion (see applySidecar) — but not one
 * a superseded narration wrote (SUPERSEDED_RETRACTED_BY, issue #338 D8): the
 * narration of the upgraded outcome may state it again. Exported for unit
 * testing.
 *
 * @param {Array} truths
 * @param {Object} subject — resolved subject ({kind, ...})
 * @param {string} fact
 * @returns {Object|null}
 */
export function findEquivalentTruth(truths, subject, fact) {
  if (!Array.isArray(truths) || !truths.length) return null;
  const key  = subjectKey(subject);
  const norm = normaliseFactText(fact);
  if (!norm) return null;
  return truths.find(t =>
    t && t.retractedBy !== SUPERSEDED_RETRACTED_BY
    && subjectKey(t.subject) === key && normaliseFactText(t.fact) === norm,
  ) ?? null;
}

/**
 * Normalise fact text for equivalence checks: lowercase, collapse internal
 * whitespace, strip trailing sentence punctuation.
 */
function normaliseFactText(fact) {
  return String(fact ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.!?\s]+$/u, '')
    .trim();
}

/**
 * Locate a truth by full ID or 6+ char prefix. Returns the entry or null
 * if no match / ambiguous match. `!truth strike` uses it to say a truth it
 * could not strike is already retracted (issue #336 Y30).
 */
export function findTruthByIdOrPrefix(truths, needle) {
  if (!Array.isArray(truths)) return null;
  const exact = truths.find(t => t?.id === needle);
  if (exact) return exact;
  if (typeof needle !== 'string' || needle.length < 4) return null;
  const matches = truths.filter(t => typeof t?.id === 'string' && t.id.startsWith(needle));
  return matches.length === 1 ? matches[0] : null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ensureLedgerShape(campaignState) {
  if (!Array.isArray(campaignState.sceneTruths)) {
    campaignState.sceneTruths = [];
  }
  if (!campaignState.sceneState || typeof campaignState.sceneState !== 'object') {
    campaignState.sceneState = { bySubject: {}, sceneId: null };
  }
  if (!campaignState.sceneState.bySubject ||
      typeof campaignState.sceneState.bySubject !== 'object') {
    campaignState.sceneState.bySubject = {};
  }
}

function newTruthId() {
  const cryptoRef =
    typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID
      ? globalThis.crypto
      : null;
  if (cryptoRef) return `tr-${cryptoRef.randomUUID().slice(0, 8)}`;
  return `tr-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The campaign's session number, stamped on every truth so a migrated truth
 * reads "Session N:" on the entity card and the World Journal (issue #286 A7:
 * truths never carried one).
 */
function sessionNumberOf(campaignState) {
  const n = Number(campaignState?.sessionNumber);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function entryRefType(ref) {
  return typeof ref?.entityType === 'string' ? ref.entityType : null;
}
