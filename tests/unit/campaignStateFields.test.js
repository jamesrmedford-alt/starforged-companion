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
 * How the scan works:
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
import { productionSources, lineOf, matchBracket } from '../helpers/sourceScan.js';
import { CampaignStateSchema } from '../../src/schemas.js';

/** Names that never hold anything but campaignState — fields seen on them join the field list. */
const STRICT_NAMES = ['campaignState', 'cs', 'latestState', 'freshState', 'prevState', 'preState'];
/** Conventional names that usually hold campaignState — counted, but never used to discover fields. */
const LOOSE_NAMES = ['state', 'latest', 'fresh', 'stored', 'working'];

const BIND = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;]{0,80}?settings\??\.get\??\.?\(\s*MODULE_ID\s*,\s*["']campaignState["']\s*\)(?!\s*\??\.)/g;

/**
 * Fields only one side touches, on purpose. Each needs a reason; an entry
 * whose field gains its missing side fails the stale-entry test below.
 */
const ONE_SIDED = {
  characterIds: 'read, never written — kept for older stored records; every reader falls back to the speaker or the owned PC (schemas.js)',
  api: 'read, never written — the move interpreter\'s model settings stay at the schema default; the interpreter falls back to its own constants',
  canonicalTruthSlugs: 'read, never written — UNWIRED: nothing selects canonical truth slugs yet (known-issues.md → CAMPAIGN-TRUTHS-UNWIRED)',
};

/** The merge policies: every name they list must be a live field. */
const FIELD_LISTS = [
  ['src/moves/persistResolution.js',          'STORE_OWNED_FIELDS'],
  ['src/moves/persistResolution.js',          'ENTITY_ID_LISTS'],
  ['src/factContinuity/sceneLifecycle.js',    'SCENE_FIELDS'],
  ['src/safety/sessionLifecycleDialogs.js',   'END_SESSION_FIELDS'],
  ['src/narration/narrator.js',               'SIDECAR_FIELDS'],
];

const WRITE_AFTER = [
  /^\s*(?:=(?!=)|\?\?=|\|\|=|&&=|\+=|-=|\+\+|--)/,                          // cs.f = … / cs.f += … / cs.f++
  /^\??\.(?:push|unshift|splice|pop|shift|sort|reverse|fill)\s*\(/,          // cs.f.push(…)
  /^(?:\??\.[A-Za-z_$][\w$]*|\[[^\]\n]*\])+\s*(?:=(?!=)|\?\?=|\|\|=|&&=)/,  // cs.f.g = … / cs.f[k] = …
];

/** End of the block enclosing `index` (the file's end at top level). */
function enclosingBlockEnd(mask, index) {
  let depth = 0;
  for (let k = index; k >= 0; k--) {
    if (mask[k] === '}') depth++;
    else if (mask[k] === '{') {
      if (depth === 0) return matchBracket(mask, k);
      depth--;
    }
  }
  return mask.length;
}

/** Every `<receiver>.<field>` access in one file, on the strict and loose names. */
function accesses(src) {
  // A variable bound from game.settings.get(…, "campaignState") is strict for
  // the rest of its block only — the same name may hold a DOM node elsewhere.
  const bound = [...src.code.matchAll(BIND)].map(m => ({
    name: m[1], from: m.index, to: enclosingBlockEnd(src.mask, m.index),
  }));
  const isStrict = (receiver, at) =>
    STRICT_NAMES.includes(receiver) || bound.some(b => b.name === receiver && at > b.from && at < b.to);
  const names = [...new Set([...STRICT_NAMES, ...LOOSE_NAMES, ...bound.map(b => b.name)])];
  const access = new RegExp(`(\\bdelete\\s+)?(?<![\\w$.])(${names.join('|')})\\??\\.([A-Za-z_$][\\w$]*)\\b(?!\\s*\\()`, 'g');
  const out = [];
  for (const m of src.mask.matchAll(access)) {
    const [whole, del, receiver, name] = m;
    const strict = isStrict(receiver, m.index);
    if (!strict && !LOOSE_NAMES.includes(receiver)) continue;   // a bound name outside its block
    const after = src.mask.slice(m.index + whole.length, m.index + whole.length + 60);
    out.push({
      name,
      strict,
      write: !!del || WRITE_AFTER.some(re => re.test(after)),
      loc:   `${src.file}:${lineOf(src.text, m.index)}`,
    });
  }
  return out;
}

function scanFields() {
  const all = productionSources().flatMap(accesses);
  // Pass 1 — the field list: schema keys, and anything seen on a strict name.
  const fields = new Map();   // name → { writes: [loc], reads: [loc] }
  for (const name of Object.keys(CampaignStateSchema)) fields.set(name, { writes: [], reads: [] });
  for (const a of all) if (a.strict && !fields.has(a.name)) fields.set(a.name, { writes: [], reads: [] });
  // Pass 2 — count every access to a listed field, loose names included.
  for (const a of all) {
    const f = fields.get(a.name);
    if (f) (a.write ? f.writes : f.reads).push(a.loc);
  }
  return fields;
}

function listedNames(file, constName) {
  const src = productionSources().find(s => s.file === file);
  if (!src) throw new Error(`${file} not found`);
  const m = new RegExp(`const\\s+${constName}\\s*=\\s*(?:Object\\.freeze\\(\\s*)?\\[([^\\]]*)\\]`).exec(src.code);
  if (!m) throw new Error(`${constName} not found in ${file}`);
  return [...m[1].matchAll(/["']([^"']+)["']/g)].map(x => x[1]);
}

const fields = scanFields();
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
