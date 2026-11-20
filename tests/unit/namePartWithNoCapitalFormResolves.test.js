/**
 * STARFORGED COMPANION
 * tests/unit/namePartWithNoCapitalFormResolves.test.js
 *
 * Issue #364 NAME-PART-NO-CAPITAL-FORM-UNRESOLVED (found while fixing issue
 * #364 ONE-WORD-NAME-NO-CAPITAL-FORM — the same rule, in the same module).
 *
 * resolveEntityName's last rung takes one first or last name a single entity
 * has — "Kael" for Kael Dros — and asked it for a capital letter, so that a
 * lowercase word ("the station") never matches a name part. A part with no
 * capital to write — the "734" of Unit 734, a name in a script without case —
 * is no lowercase word, but it failed the same test: a sidecar truth about
 * "734", a `!truth 734: …`, or 734 in the scene frame's present list stayed
 * text, never filed under her card (ledgers.resolveSubject → kind "text").
 *
 * Such a part now matches as written. A lowercase cased word still never
 * does, and a part two entities share is still nobody's.
 */

import { describe, it, expect } from 'vitest';
import { resolveEntityName } from '../../src/context/relevanceResolver.js';
import { resolveSubject } from '../../src/factContinuity/ledgers.js';

const ent = (name, journalId, entityType = 'connection') => ({ _id: `rec-${journalId}`, journalId, name, entityType });
const roster = [ent('Unit 734', 'npc-734'), ent('ミナ サトウ', 'npc-mina'), ent('Kael Dros', 'npc-kael'), ent('Bleakhold Station', 'set-bleak', 'settlement')];
const idOf = (name, entities = roster) => resolveEntityName(name, entities)?.journalId ?? null;

describe('issue #364 NAME-PART-NO-CAPITAL-FORM-UNRESOLVED — resolveEntityName: a name part with no capital to write', () => {
  it('a part that starts with a digit resolves to the one entity that has it', () => {
    expect(idOf('734')).toBe('npc-734');
    expect(idOf("734's")).toBe('npc-734');
    expect(idOf('the 734')).toBe('npc-734');
  });

  it('a part in a script without letter case resolves too', () => {
    expect(idOf('サトウ')).toBe('npc-mina');
    expect(idOf('ミナ')).toBe('npc-mina');
  });

  it('control: a lowercase cased word never matches a name part; capitalised, it does', () => {
    expect(idOf('station')).toBeNull();
    expect(idOf('the station')).toBeNull();
    expect(idOf('unit')).toBeNull();
    expect(idOf('Kael')).toBe('npc-kael');
    expect(idOf('Station')).toBe('set-bleak');
  });

  it('control: a part two entities share is nobody\'s — no guessing', () => {
    const shared = [...roster, ent('Bay 734', 'loc-bay', 'location')];
    expect(idOf('734', shared)).toBeNull();
    expect(idOf('Unit 734', shared)).toBe('npc-734');
  });

  it('control: a number no entity is called by resolves to nothing', () => {
    expect(idOf('12')).toBeNull();
  });
});

describe('issue #364 NAME-PART-NO-CAPITAL-FORM-UNRESOLVED — a fact about her is filed under her card', () => {
  const cs = { currentSceneId: 'sc-1', dismissedEntities: [] };

  it('a sidecar subject "734" is the entity Unit 734, not text', () => {
    expect(resolveSubject('734', cs, roster)).toEqual({ kind: 'entity', entityId: 'npc-734', entityType: 'connection' });
    expect(resolveSubject('サトウ', cs, roster)).toEqual({ kind: 'entity', entityId: 'npc-mina', entityType: 'connection' });
  });

  it('control: a subject that names no entity stays text', () => {
    expect(resolveSubject('the station', cs, roster)).toEqual({ kind: 'text', text: 'the station' });
    expect(resolveSubject('12', cs, roster)).toEqual({ kind: 'text', text: '12' });
  });
});
