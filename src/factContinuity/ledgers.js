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
 */

import { buildNameIndex } from '../context/relevanceResolver.js';

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
 * @param {Array} [ctx.entities] — [{ entityId, entityType, name }] for subject resolution
 * @returns {{ truthIds: string[], stateUpdates: Array<{ key: string, attribute: string }> }}
 */
export function applySidecar(sidecar, ctx) {
  const campaignState = ctx?.campaignState;
  if (!campaignState || !sidecar || typeof sidecar !== 'object') {
    return { truthIds: [], stateUpdates: [] };
  }

  ensureLedgerShape(campaignState);

  const sessionId = ctx.sessionId ?? campaignState.currentSessionId ?? null;
  const sceneId   = ctx.sceneId   ?? campaignState.currentSceneId   ?? null;
  const moveId    = ctx.moveId    ?? null;
  const asserter  = ctx.asserter  ?? 'narrator';
  const source    = ctx.source    ?? 'narrator_sidecar';
  const entities  = Array.isArray(ctx.entities) ? ctx.entities : [];
  const now       = Date.now();

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
    const idx     = list.findIndex(e => e.attribute === attribute);
    const entry   = { attribute, value, updatedAt: now };
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    stateUpdates.push({ key, attribute });
  }

  return { truthIds, stateUpdates };
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
 * @returns {boolean} true when the frame was applied
 */
export function applySceneFrame(frame, campaignState) {
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
  };
  return true;
}

/**
 * Resolve a free-text subject reference into a structured subject object.
 *
 *   "scene.lighting"  → { kind: "scene",  sceneId }   (attribute kept in fact text)
 *   "Vance"           → { kind: "entity", entityId, entityType }  if entity matched
 *   "Covenant officer"→ { kind: "text",   text }      fallback
 *
 * @param {string} subjectRef
 * @param {Object} campaignState
 * @param {Array}  [entities] — [{ entityId, entityType, name }]
 * @returns {Object}
 */
export function resolveSubject(subjectRef, campaignState, entities = []) {
  const ref = typeof subjectRef === 'string' ? subjectRef.trim() : '';
  if (!ref) return { kind: 'text', text: '' };

  // Scene-scoped: "scene" or "scene.<attribute>"
  if (ref === 'scene' || /^scene\./i.test(ref)) {
    return { kind: 'scene', sceneId: campaignState?.currentSceneId ?? null };
  }

  // Entity match — reuse the relevance resolver's name index machinery so the
  // matching rules (full-name, first-word, last-word, case-insensitive) stay
  // consistent across the module.
  if (Array.isArray(entities) && entities.length) {
    const index = buildNameIndex(
      entities.map(e => ({
        _id:        e.entityId,
        journalId:  e.entityId,
        name:       e.name,
        entityType: e.entityType,
      })),
      campaignState?.dismissedEntities ?? [],
    );
    const hit = index.get(ref.toLowerCase()) ?? index.get(firstWord(ref));
    if (hit) {
      return {
        kind:       'entity',
        entityId:   hit.journalId ?? hit._id,
        entityType: hit.entityType,
      };
    }
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
  const newKey = entityRef.entityId;
  if (oldKey !== newKey && campaignState.sceneState.bySubject[oldKey]) {
    const merged = campaignState.sceneState.bySubject[newKey] ?? [];
    for (const e of campaignState.sceneState.bySubject[oldKey]) {
      const idx = merged.findIndex(m => m.attribute === e.attribute);
      if (idx >= 0) merged[idx] = e; else merged.push(e);
    }
    campaignState.sceneState.bySubject[newKey] = merged;
    delete campaignState.sceneState.bySubject[oldKey];
  }

  return rewritten;
}

/**
 * Stable string key for a resolved subject. Used as the lookup key in
 * campaignState.sceneState.bySubject and as the dedupe key for state updates.
 *
 *   entity → entityId
 *   scene  → "scene"
 *   text   → lowercased text
 *
 * @param {Object} subject
 * @returns {string}
 */
export function subjectKey(subject) {
  if (!subject || typeof subject !== 'object') return '';
  switch (subject.kind) {
    case 'entity': return String(subject.entityId ?? '');
    case 'scene':  return 'scene';
    case 'text':   return String(subject.text ?? '').trim().toLowerCase();
    default:       return '';
  }
}

// ---------------------------------------------------------------------------
// Corrections — fact-continuity scope §10
// ---------------------------------------------------------------------------

/**
 * Mark a truth retracted in place. Does not remove the entry — strike-through
 * is recorded for audit (scope §4.1).
 *
 * Returns the matched entry on success, null when no entry has the given ID
 * or the actor lacks permission. Permission is enforced via canCorrectTruth.
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
  if (!entry) return null;
  if (!canCorrectTruth(entry, ctx)) return null;
  entry.retracted   = true;
  entry.retractedBy = ctx.actor ?? 'gm';
  entry.retractedAt = Date.now();
  return entry;
}

/**
 * Replace a truth (strike the old, append a new one with `correctedTo`
 * link). Returns { struck, replacement } on success, null on permission /
 * lookup failure.
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
  if (!entry) return null;
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

  const entry = {
    id:          newTruthId(),
    subject:     subjectRef,
    fact:        cleanFact,
    sessionId:   ctx.sessionId ?? campaignState.currentSessionId ?? null,
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
  };
  campaignState.sceneTruths.push(entry);
  return entry;
}

/**
 * Remove a single attribute from the state ledger for a subject. Returns
 * true if an entry was struck, false if nothing matched.
 *
 * @param {string} key — subjectKey (entityId, "scene", or lowercased text)
 * @param {string} attribute
 * @param {Object} campaignState
 * @returns {boolean}
 */
export function strikeStateValue(key, attribute, campaignState) {
  if (!campaignState || !key || !attribute) return false;
  ensureLedgerShape(campaignState);
  const list = campaignState.sceneState.bySubject[key];
  if (!Array.isArray(list) || !list.length) return false;
  const idx = list.findIndex(e => e.attribute === attribute);
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
  const idx   = list.findIndex(e => e.attribute === attribute);
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
 * struck fact blocks narrator re-assertion (see applySidecar). Exported for
 * unit testing.
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
    t && subjectKey(t.subject) === key && normaliseFactText(t.fact) === norm,
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
 * if no match / ambiguous match.
 */
function findTruthByIdOrPrefix(truths, needle) {
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

function firstWord(s) {
  return s.split(/\s+/)[0]?.toLowerCase() ?? '';
}

function entryRefType(ref) {
  return typeof ref?.entityType === 'string' ? ref.entityType : null;
}
