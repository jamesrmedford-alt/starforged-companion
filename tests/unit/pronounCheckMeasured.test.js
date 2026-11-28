/**
 * STARFORGED COMPANION
 * tests/unit/pronounCheckMeasured.test.js
 *
 * Issue #402, change 2: "A code check for a narration that uses another
 * pronoun for a person with one on record is written and measured on the
 * kept runs before it may ask again (round 9's survivor, "it" then "he", is
 * its second case)." The check is factContinuity/pronouns.js pronounBreaks,
 * logged only (narrator.js notePronounBreaks).
 *
 * The kept runs were played before a fact block could give a pronoun, so
 * what a person has on record is read here as the first set the prose gives
 * them — in a sentence that names them alone, read as the check reads a break
 * — and each later narration whose frame holds them is checked against it.
 * Every flag over the eleven kept long hauls is pinned and labelled: eleven,
 * all right — round 6's customs officer ("she" at a41 and a48, "he" from a60)
 * and round 10's customs clerk ("she" from a26, "he" from a53). Round 9's
 * survivor is not among them: its "it" was written of "the figure" and of
 * "the survivor's" eyes, never in a sentence the reading takes a set from; on
 * the record its fact block would now give, a85's "he" is flagged.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pronounBreaks } from '../../src/factContinuity/pronouns.js';
import { extractSidecar } from '../../src/factContinuity/sidecarParser.js';

const DIR = fileURLToPath(new URL('../../test/ci/playwright/explorations/', import.meta.url));
const NARR = /(narrateResolution|narratePacedInput|narrateOracleFollowup|narrateSessionVignette|narrateRound|interrogateScene|narrateClockVignette|narrateVowSwearing|narrateIncitingIncident)$/;
const textOf = (e) => (typeof e?.response === 'object' ? e.response?.content?.[0]?.text : e?.response) ?? '';
const PCS = ['Mira Kestrel', 'Kira'];

// The record a fact block would have given, read from the prose: the first set
// a narration gives a person, in a sentence that names them alone — the
// check's own rules (factContinuity/pronouns.js), mirrored here. Measurement
// only: the module takes a person's set from the fact block, never the prose.
function callWords(name) {
  const words = String(name ?? '').split(/\s+/).map(w => w.replace(/[^\p{L}\p{N}'’-]/gu, '')).filter(Boolean);
  if (!words.length) return [];
  if (/^\p{Lu}/u.test(words[0])) return words.filter(w => w.length >= 3);
  const last = words[words.length - 1].toLowerCase();
  if (['man','woman','figure','person','one','voice','boy','girl','kid','stranger'].includes(last)) return words.length > 1 ? [words.slice(-2).join(' ')] : [];
  return last.length >= 3 ? [last] : [];
}
const mentions = (s, ws) => ws.some(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}\\b`, 'i').test(s));
const OTHER = /\b(?:man|men|woman|women|boy|girl|kid|child|guard|guards|officer|clerk|dockhand|stranger|figure|crew|crewman|pilot|captain|merchant|trader|broker|foreman|dockmaster|courier|watcher|someone|anyone|everyone|nobody|ship|cutter|hauler|freighter|vessel|shuttle|craft|frigate|corvette|tug|barge|station)s?\b/gi;
const unquoted = (s) => s.replace(/["“][^"”]*["”]/g, ' ').replace(/["“][^"”]*$/, ' ').replace(/\s+/g, ' ').trim();
function namesAnother(sentence, own) {
  const words = sentence.split(/\s+/).map(w => w.replace(/^[^\p{L}]+|[^\p{L}'’]+$/gu, ''));
  return words.some((w, i) => { const bare = w.replace(/['’]s$/, ''); if (!/^\p{Lu}\p{Ll}/u.test(bare) || own.has(bare.toLowerCase())) return false; return i > 0 || bare !== w; });
}
function namedAsOwner(sentence, ws) {
  let named = 0;
  for (const w of ws) { const re = new RegExp(`\\b${w.replace(/ /g, '\\s+')}\\b(['’]s)?`, 'gi');
    for (let m = re.exec(sentence); m; m = re.exec(sentence)) { if (!m[1]) return false; named += 1; } }
  return named > 0;
}
function narrationOf(sentences) {
  let open = false;
  return sentences.map(s => { let text = s; if (open) { const c = text.search(/["”]/); if (c < 0) return ''; text = text.slice(c + 1); }
    open = (text.match(/["“”]/g) ?? []).length % 2 === 1; return unquoted(text); });
}
function at(s, ws) { let a = -1; for (const w of ws) { const m = new RegExp(`\\b${w.replace(/ /g, '\\s+')}\\b`, 'i').exec(s); if (m && (a < 0 || m.index < a)) a = m.index; } return a; }
// What the prose first gives a person, read as the check reads a break.
const GIVE = [[/\b(?:she|her|herself)\b/i, 'she/her'], [/\b(?:he|his|himself)\b/i, 'he/him'],
  [/\bit (?:says|asks|steps|waits|watches|turns|looks|knows|holds|lowers|stops|moves|speaks|answers|hauls|raises|rubs|tastes)\b/i, 'it/its']];
function givenIn(prose, name, rivals) {
  const sentences = prose.replace(/<[^>]+>/g, ' ').replace(/\*[^*]*\*/g, ' ').split(/(?<=[.!?…]["”’)]?)\s+(?=["“‘(]?\p{Lu})/u);
  const ws = callWords(name); const own = new Set(ws.flatMap(w => w.toLowerCase().split(/\s+/))); const rs = rivals.map(callWords).filter(w => w.length);
  const elsewhere = (s) => { const re = new RegExp(OTHER.source, 'gi'); for (let m = re.exec(s); m; m = re.exec(s)) if (!own.has(m[0].toLowerCase().replace(/s$/, ''))) return true; return false; };
  const clear = (s) => !rs.some(r => mentions(s, r)) && !elsewhere(s) && !namesAnother(s, own);
  const told = narrationOf(sentences);
  for (let i = 0; i < sentences.length; i++) {
    const here = told[i]; const a = at(here, ws);
    if (a < 0 || !clear(here)) continue;
    const span = [here.slice(a)];
    const next = told[i + 1] ?? '';
    if (next && clear(next) && !namedAsOwner(here, ws)) span.push(next);
    for (const s of span) {
      const found = GIVE.map(([re, set]) => [re.exec(s)?.index ?? Infinity, set]).sort((x, y) => x[0] - y[0])[0];
      if (found[0] !== Infinity) return found[1];
    }
  }
  return '';
}

/** Every flag the check gives over the kept long hauls, against the record the prose gives. */
function measure() {
  const out = [];
  for (const run of readdirSync(DIR).filter(d => d.startsWith('long-haul-live-')).sort()) {
    const f = join(DIR, run, 'replay.json');
    if (!existsSync(f)) continue;
    const exchanges = JSON.parse(readFileSync(f, 'utf8')).recording?.exchanges ?? [];
    const onRecord = new Map();
    for (const e of exchanges) {
      if (!NARR.test(e.kind)) continue;
      const text = textOf(e);
      if (!text) continue;
      const { prose, sidecar } = extractSidecar(text);
      const frame = sidecar?.sceneFrame ?? null;
      const people = [...(frame?.present ?? []), ...(frame?.remote ?? [])].filter(n => !PCS.some(p => p.toLowerCase() === n.toLowerCase()));
      const recorded = people.map(n => onRecord.get(n.toLowerCase())).filter(Boolean);
      if (recorded.length) {
        const others = [...people.filter(n => !onRecord.has(n.toLowerCase())), ...PCS];
        for (const b of pronounBreaks(prose ?? text, recorded, { others })) out.push(`${run.slice(15)} ${e.step} ${b.name}: ${b.pronouns} → ${b.found}`);
      }
      for (const n of people) {
        if (onRecord.has(n.toLowerCase())) continue;
        const set = givenIn(prose ?? text, n, [...people.filter(x => x !== n), ...PCS]);
        if (set) onRecord.set(n.toLowerCase(), { name: n, pronouns: set });
      }
    }
  }
  return out;
}

describe('the pronoun-change check, measured on the kept runs (issue #402, change 2)', () => {
  it('flags twelve times over the twelve kept long hauls: eleven real changes, and round 11\'s a90, which is not', () => {
    expect(measure()).toEqual([
      // Round 6: the customs officer, "she" at a41 and a48 — right.
      '20261125-232143 a60 customs officer: she/her → he',
      '20261125-232143 a61 customs officer: she/her → him',
      '20261125-232143 a61 customs officer: she/her → his',
      '20261125-232143 a62 customs officer: she/her → he',
      '20261125-232143 a62 customs officer: she/her → his',
      // Round 10: the customs clerk, "her" from a26 to a43 — right (finding 8).
      '20261127-202557 a53 customs clerk: she/her → he',
      '20261127-202557 a55 customs clerk: she/her → his',
      '20261127-202557 a57 customs clerk: she/her → he',
      '20261127-202557 a60 customs clerk: she/her → his',
      '20261127-202557 a64 customs clerk: she/her → his',
      '20261127-202557 a66 customs clerk: she/her → his',
      // Round 11: wrong. "At the hatch, the clerk shifts his weight but stays quiet. 'When you come,
      // bring the meal plain,' she adds" — the "she" is Tamsin's, on the comm; the check reads on into
      // the next sentence (PRONOUN-CHECK-READS-INTO-THE-NEXT-SPEAKER). The clerk was he/him all run.
      '20261128-052235 a90 Clerk: he/him → she',
    ]);
  });

  it('round 9\'s survivor, on the record its fact block would now give ("it"), is flagged at a85', () => {
    const run = JSON.parse(readFileSync(join(DIR, 'long-haul-live-20261127-041734', 'replay.json'), 'utf8')).recording.exchanges;
    const a85 = extractSidecar(textOf(run.find(e => e.step === 'a85' && NARR.test(e.kind)))).prose;
    const breaks = pronounBreaks(a85, [{ name: 'Cutter Survivor', pronouns: 'it/its' }], { others: ['Mira Kestrel', 'Tamsin Okoro'] });
    expect(breaks.map(b => [b.found, b.quote])).toEqual([['he', '"Ask the one who wrote it down twice," he says, voice thin.']]);
  });
});
