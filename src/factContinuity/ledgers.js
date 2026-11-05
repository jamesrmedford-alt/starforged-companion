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
    const dupe = findEquivalentTruth(campaignState.sceneTruths, subject, fact);
    if (dupe) {
      if (dupe.retracted) {
        console.debug?.(
          'starforged-companion | factContinuity: narrator re-asserted a retracted truth; append blocked:',
          fact,
        );
      }
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
 * How many superseded values a state entry keeps (`previous`, newest first).
 * An X-Card removes the latest beat's narrations, so a short chain covers it;
 * the bound keeps a long scene's repeated updates from growing the setting.
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
 * value in the chain was theirs.
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
 * superseded, when it kept one (`previous`), is restored — and a scene frame
 * they wrote is cleared.
 *
 * The X-Card also takes over the table's strike of a truth they recorded
 * (XCARD-AFTER-STRIKE-STILL-NAMED): a bare strike — the GM's or a player's,
 * no replacement — is relabelled `retractedBy: "xcard"` (its `retractedAt`
 * kept), and the strike a scene end kept for the session
 * (`sessionRetractions`, with its truth's `narrationId`) is dropped. Left as
 * the table's, the CORRECTED block and the summary's leave-out list named the
 * removed content for the rest of the session (U07), and `!truth set` could
 * lift it (an X-Card's retraction is never lifted — issue #331 X31). A
 * superseded narration's (`by` SUPERSEDED_RETRACTED_BY) leaves the table's
 * strike as it is: the correction stands over the re-narration.
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
      if (t.retracted) return (xCard && isBareTableStrike(t)) ? { ...t, retractedBy: XCARD_RETRACTED_BY } : t;
      const next = { ...t, retracted: true, retractedBy: by, retractedAt: now };
      retracted.push(next);
      return next;
    });
  }

  const sessionStrikes = campaignState.sessionRetractions;
  if (xCard && Array.isArray(sessionStrikes?.facts) && sessionStrikes.facts.some(f => ids.has(f?.narrationId))) {
    campaignState.sessionRetractions = { ...sessionStrikes, facts: sessionStrikes.facts.filter(f => !ids.has(f?.narrationId)) };
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

  if (campaignState.sceneFrame && ids.has(campaignState.sceneFrame.narrationId)) {
    campaignState.sceneFrame = null;
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
 * Apply a normalised scene-frame snapshot (Cluster A4 — see
 * docs/narrator/narrator-memory-architecture.md) to the campaign state.
 * The frame is a full replacement snapshot, not a delta: the narrator emits
 * the current scene's location / present subjects / one-line situation on
 * every response, and the latest emission wins. Mutates campaignState in
 * place; persistence is the caller's responsibility (same contract as
 * applySidecar).
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

  campaignState.sceneFrame = {
    location,
    present,
    situation,
    sceneId:   campaignState.currentSceneId ?? null,
    updatedAt: Date.now(),
    ...narrationStamp(narrationId),
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
 * @param {Object} [ctx]
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
  // #326 W60).
  const strike = findBareStrike(campaignState.sceneTruths, subjectRef, cleanFact);
  const isGM = ctx.isGM ?? true;
  if (strike && !isGM && (strike.retractedBy === 'gm' || strike.asserter === 'gm')) return null;

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
  return entry;
}

/**
 * The active scene's bare strike of this subject + fact — retracted by the
 * table (not the X-Card, not a superseded narration's — issue #338 D8 — not a
 * Replace's struck original), compared
 * case-blind — or null. setTruth lifts it; the `!truth set` card names a
 * player's set refused over a GM's strike.
 *
 * @param {Object[]} truths
 * @param {Object} subjectRef
 * @param {string} fact
 * @returns {Object|null}
 */
export function findBareStrike(truths, subjectRef, fact) {
  const key = subjectKey(subjectRef);
  const lower = fact.toLowerCase();
  return (Array.isArray(truths) ? truths : []).find(t =>
    t?.retracted && isBareTableStrike(t)
    && subjectKey(t.subject) === key
    && String(t.fact ?? '').trim().toLowerCase() === lower) ?? null;
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
