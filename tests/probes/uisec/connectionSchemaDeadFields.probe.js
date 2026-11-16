// tests/probes/uisec/connectionSchemaDeadFields.probe.js
//
// UISEC-07 · CONNECTION-SCHEMA-DEAD-FIELDS (DEAD / ORPHANED — source scan)
//
// Scenario: CONN-BACKGROUND-UNWRITTEN (v1.8.1 sweep) retired two
// ConnectionSchema fields "no production code ever wrote or read"
// (`background`, `secrets`). Four siblings in the same template are in the
// same state, and every NPC record created since carries them:
//
//   playerVisible   — "false = GM-only record (hidden antagonists, secret
//                     NPCs)". Nothing writes it and nothing reads it: no path
//                     hides an NPC card from players by it.
//   progressTrackId — "Associated ProgressTrack _id". No writer, no reader
//                     (the relationship track is `relationshipTicks`).
//   firstAppearance — written by two creators (swearVow.js, entityExtractor.js);
//                     no reader — an orphaned write.
//   loremasterNotes — "How to voice/play this character — injected into
//                     context". Only ever the schema default ""; its one
//                     reader (narratorPrompt.js, a PC's `narratorNotes ??
//                     loremasterNotes`) reads a value nothing sets.
//
// Correct (rules/reachability.md §1, §2): a schema field has a production
// writer and a production reader, or is retired / marked UNWIRED.
// Today: none of the four has both.
//
// A source-text scan — acceptable evidence for a DEAD / ORPHANED finding only.
// Production corpus: src/ minus src/integration/, comments stripped
// (tests/helpers/sourceScan.js), schemas.js itself left out.

import { describe, it, expect } from 'vitest';
import { productionSources } from '../../helpers/sourceScan.js';
import { ConnectionSchema } from '../../../src/schemas.js';

const sources = productionSources().filter(s => s.file !== 'src/schemas.js');

/** Property reads of `field`: `.field` not followed by an assignment, or a `['field']` / destructure use. */
function reads(field) {
  const out = [];
  const re = new RegExp(`(?:\\?\\.|\\.)${field}\\b(?!\\s*=[^=])`, 'g');
  for (const s of sources) {
    for (const m of s.code.matchAll(re)) out.push(`${s.file}:${s.code.slice(0, m.index).split('\n').length}`);
  }
  return out;
}

/** Writes of `field` with a value that is not an empty schema default: `field: <expr>` or `.field = <expr>`. */
function writes(field) {
  const out = [];
  const key = new RegExp(`\\b${field}\\s*:\\s*([^,\\n}]+)`, 'g');
  const set = new RegExp(`\\.${field}\\s*=[^=]`, 'g');
  for (const s of sources) {
    for (const m of s.code.matchAll(key)) {
      const value = m[1].trim();
      if (value === '""' || value === "''" || value === 'null' || value === 'true' || value === 'false') continue;   // a template default
      out.push(`${s.file}:${s.code.slice(0, m.index).split('\n').length}`);
    }
    for (const m of s.code.matchAll(set)) out.push(`${s.file}:${s.code.slice(0, m.index).split('\n').length}`);
  }
  return out;
}

describe('UISEC-07: every ConnectionSchema field has a production writer and reader', () => {
  it('control: the scan sees a live field — relationshipTicks is written and read', () => {
    expect(Object.keys(ConnectionSchema)).toContain('relationshipTicks');
    expect(writes('relationshipTicks').length).toBeGreaterThan(0);
    expect(reads('relationshipTicks').length).toBeGreaterThan(0);
  });

  it('control: the fields CONN-BACKGROUND-UNWRITTEN retired are gone from the template', () => {
    expect(Object.keys(ConnectionSchema)).not.toContain('background');
    expect(Object.keys(ConnectionSchema)).not.toContain('secrets');
  });

  it('playerVisible — a "GM-only record" flag — is read by something that hides the record (or is not in the template)', () => {
    if (!('playerVisible' in ConnectionSchema)) return;
    expect(reads('playerVisible')).not.toEqual([]);
  });

  it('progressTrackId is written and read (or is not in the template)', () => {
    if (!('progressTrackId' in ConnectionSchema)) return;
    expect(writes('progressTrackId')).not.toEqual([]);
    expect(reads('progressTrackId')).not.toEqual([]);
  });

  it('firstAppearance, which two creators write, has a reader (or is not written)', () => {
    if (!('firstAppearance' in ConnectionSchema) || !writes('firstAppearance').length) return;
    expect(reads('firstAppearance')).not.toEqual([]);
  });

  it('loremasterNotes, which the narrator prompt reads, has a writer (or is not in the template)', () => {
    if (!('loremasterNotes' in ConnectionSchema)) return;
    expect(writes('loremasterNotes')).not.toEqual([]);
  });
});
