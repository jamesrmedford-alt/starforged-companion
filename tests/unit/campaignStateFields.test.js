/**
 * STARFORGED COMPANION
 * tests/unit/campaignStateFields.test.js
 *
 * Every campaignState field has a writer AND a reader (issue #282 item 5).
 *
 * The 2026-10 audit found, with a one-off grep, fields only one side touched:
 * `progressTrackIds` and `activeCharacterId` were read but never written (the
 * readers always saw a default), `pendingClarification`, `loreRecapSessionId`
 * and the End-Session foci were written but never read. Unit tests hand-set
 * such fields, so they pass; this scan of src/ (minus Quench) is the check.
 *
 * How the scan works (tests/helpers/sourceScan.js campaignStateFields — shared
 * with campaignStateKeyClassification.test.js):
 *   - Fields: the keys of CampaignStateSchema, plus every field written or
 *     read on a name that only ever holds campaignState — `campaignState`,
 *     `cs`, … and any variable bound from game.settings.get(…, "campaignState")
 *     in that file.
 *   - Writes and reads are counted on those names and on the conventional
 *     looser ones (`state`, `latest`, `working`, …). A write is an assignment
 *     (nested ones too — `cs.safety.privateLines = …` writes `safety`), a
 *     compound assignment, `delete`, or a mutating array call. Everything else
 *     is a read. The schema literal itself is neither: a default is not a
 *     producer.
 *   - The merge policies that copy fields between the stored and the working
 *     copy (persistResolution, the scene lifecycle, End a Session, the
 *     narrator sidecar) may only name live fields.
 *
 * Blind spots: a field touched only through an unconventional alias or a
 * computed key (`cs[key]`) is invisible. A false failure here means "add the
 * alias", not "allowlist the field".
 */

import { describe, it, expect } from 'vitest';
import { campaignStateFields, listedNames } from '../helpers/sourceScan.js';
import { CampaignStateSchema } from '../../src/schemas.js';

/**
 * Fields only one side touches, on purpose. Each needs a reason; an entry
 * whose field gains its missing side fails the stale-entry test below.
 */
const ONE_SIDED = {
  characterIds: 'read, never written — kept for older stored records; every reader falls back to the speaker or the owned PC (schemas.js)',
  api: 'read, never written — the move interpreter\'s model settings stay at the schema default; the interpreter falls back to its own constants',
  canonicalTruthSlugs: 'read, never written — UNWIRED: nothing selects canonical truth slugs yet (known-issues.md → CAMPAIGN-TRUTHS-UNWIRED)',
  previousSessionSummary: 'read, never written — a world\'s LAST SESSION from before the summary was a view of the session record, copied once onto its Session Log page at world load (worldJournal.js keepPreRecordSummaries, issue #382 section 9)',
  sessionSummary: 'read, never written — the summary of a session under way from before the record, copied once onto its Session Log page at world load (worldJournal.js keepPreRecordSummaries, issue #382 section 9)',
};

/** The merge policies: every name they list must be a live field. */
const FIELD_LISTS = [
  ['src/moves/persistResolution.js',          'STORE_OWNED_FIELDS'],
  ['src/entities/registry.js',                'ENTITY_ID_LISTS'],
  ['src/factContinuity/sceneLifecycle.js',    'SCENE_FIELDS'],
  ['src/safety/sessionLifecycleDialogs.js',   'END_SESSION_FIELDS'],
  ['src/narration/narrator.js',               'SIDECAR_FIELDS'],
];

const fields = campaignStateFields();
const isLive = (name) => fields.get(name)?.writes.length > 0 && fields.get(name)?.reads.length > 0;

describe('campaignState fields — a writer and a reader for each', () => {
  it('finds the fields (schema keys and fields seen on campaignState)', () => {
    expect(fields.size).toBeGreaterThan(Object.keys(CampaignStateSchema).length);
    for (const known of ['xCardActive', 'nextMoveAdd', 'recentOracles', 'questFocus', 'sceneTruths']) {
      expect(isLive(known), known).toBe(true);
    }
  });

  it('every field is both written and read in production code', () => {
    const problems = [];
    for (const [name, f] of [...fields].sort(([a], [b]) => a.localeCompare(b))) {
      if (ONE_SIDED[name]) continue;
      if (!f.writes.length && !f.reads.length) {
        problems.push(`${name}: in CampaignStateSchema, but nothing in src/ reads or writes it — delete it from the schema`);
      } else if (!f.writes.length) {
        problems.push(`${name}: read (${f.reads[0]}), never written — wire a producer, or retire the read`);
      } else if (!f.reads.length) {
        problems.push(`${name}: written (${f.writes[0]}), never read — wire a consumer, or retire the write`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('each one-sided exception is still one-sided (a stale entry hides the next regression)', () => {
    for (const name of Object.keys(ONE_SIDED)) {
      expect(fields.has(name), `${name} is no longer touched at all — remove it from ONE_SIDED`).toBe(true);
      expect(isLive(name), `${name} now has a writer and a reader — remove it from ONE_SIDED`).toBe(false);
    }
  });

  it.each(FIELD_LISTS)('%s %s names only live fields', (file, constName) => {
    const names = listedNames(file, constName);
    expect(names.length).toBeGreaterThan(0);
    const dead = names.filter(n => !isLive(n) && !ONE_SIDED[n]);
    expect(dead, `${constName} lists fields nothing both writes and reads: ${dead.join(', ')}`).toEqual([]);
  });
});
