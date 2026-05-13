/**
 * STARFORGED COMPANION
 * src/factContinuity/ledgers.js
 *
 * In-memory truth and state ledgers for active-scene fact continuity.
 * See docs/fact-continuity-scope.md §4–5, §8.
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
