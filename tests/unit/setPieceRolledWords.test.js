/**
 * STARFORGED COMPANION
 * tests/unit/setPieceRolledWords.test.js
 *
 * Issue #388 #11 (ORACLE-WORD-WRITTEN-AS-ROLLED). A set-piece's MATERIAL says
 * "no word of a result is written as it was rolled", and nothing held it to
 * that: the move narrations' certain checks (narrateKeepingObligations) never
 * ran on an opening, a closing or a spotlight. The fifth live long haul wrote
 *
 *   - a96 (rolled "Fortify History"): "Fortify, in the plainest sense: …" —
 *     the oracle's word as a label;
 *   - a94 (rolled "Avenge Dominion"): "who on this ring served the Dominion" —
 *     a faction no record has, which the detection pass then wrote onto
 *     Tamsin's card.
 *
 * Now a set-piece's rolled word written as a label, as a name the records do
 * not hold, or a result's words together is asked again once (fail-open).
 * The word in an ordinary sentence — a94's "flammable gas", a17's "a vial of
 * her blood", a96's "a long history" — is the prose's.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { narrateSessionVignette } from '../../src/narration/narrator.js';
import { rolledWordsOf, formatMaterial } from '../../src/session/sceneSeeds.js';
import { materialViolations, certainViolations } from '../../src/moves/contracts/checks.js';
import { obligationsFor } from '../../src/moves/contracts/obligations.js';

const MODULE_ID = 'starforged-companion';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = JSON.parse(fs.readFileSync(path.join(HERE, '../../test/ci/playwright/explorations/long-haul-live-20261125-164201/replay.json'), 'utf8'));
const replyText = (x) => x.response.content.map(c => c.text ?? '').join('');
const proseOf = (raw) => raw.split('```')[0].trim();

/** A set-piece's seeds, read back from its MATERIAL block as the narrator was given it. */
function seedsOf(user) {
  const at = user.indexOf('MATERIAL —');
  if (at < 0) return [];
  const seeds = [];
  const words = (result) => result.split(' ').map(w => ({ result: w }));
  for (const l of user.slice(at).split('\n')) {
    const m = /^\d+\. (.+?) — (.+?)(?: \(([^)]*)\))?: (.+)$/.exec(l);
    if (m) {
      const [, label, source, , result] = m;
      if (/^(?:Action \+ Theme|Descriptor \+ Focus)$/.test(source)) seeds.push({ label, from: 'oracle', tables: words(result), result });
      else if (/zone \+ area/.test(source)) seeds.push({ label, from: 'oracle', source, tables: [{ result }], result });
      else if (/^Spotlight/.test(source)) seeds.push({ slot: 'spotlight', label, from: 'oracle', tables: [{ result }], result });
      else seeds.push({ label, from: 'state', source, tables: [], result });
      continue;
    }
    const second = /^\s+\(if that cannot be true here: (.+)\)$/.exec(l);
    if (second && seeds.length) {
      const last = seeds.at(-1);
      last.second = { tables: last.tables.length > 1 ? words(second[1]) : [{ result: second[1] }], result: second[1] };
    }
  }
  return seeds;
}

const SET_PIECES = RUN.recording.exchanges.filter(x => x.kind.endsWith('narrateSessionVignette'))
  .map(x => ({ step: x.step, seeds: seedsOf(x.user ?? ''), prose: proseOf(replyText(x)), told: x.user ?? '' }));

describe('a set-piece\'s rolled words, as the fifth live long haul wrote them (issue #388 #11)', () => {
  it('reads each set-piece\'s rolled pairs, and leaves out its places, its records and the spotlight\'s own roll', () => {
    const a94 = SET_PIECES.find(s => s.step === 'a94');
    expect(rolledWordsOf(a94.seeds)).toMatchObject({
      words: ['Avenge', 'Dominion', 'Hide', 'Disease', 'Fiery', 'Gas', 'Expansive', 'Atmosphere'],
      pairs: [['Avenge', 'Dominion'], ['Hide', 'Disease'], ['Fiery', 'Gas'], ['Expansive', 'Atmosphere']],
    });
    const spotlight = SET_PIECES.find(s => s.step === 'a2' && s.seeds.length);
    expect(rolledWordsOf(spotlight.seeds).words).not.toContain('Flashback');
  });

  it('a96\'s "Fortify," and a94\'s "the Dominion" break it; no other set-piece of the run does', () => {
    const broken = SET_PIECES.filter(s => s.seeds.length).map(s => ({
      step: s.step, quotes: materialViolations(s.prose, rolledWordsOf(s.seeds, { told: s.told })).map(v => v.quote),
    })).filter(s => s.quotes.length);
    expect(broken.map(s => s.step)).toEqual(['a94', 'a96']);
    expect(broken[0].quotes).toEqual([expect.stringContaining('served the Dominion')]);
    expect(broken[1].quotes).toEqual([expect.stringContaining('Fortify, in the plainest sense')]);
  });

  it('the word in an ordinary sentence is the prose\'s: "flammable gas", "a vial of her blood", "a long history"', () => {
    const words = { words: ['Fiery', 'Gas', 'Surrender', 'Blood', 'Fortify', 'History'], pairs: [['Fiery', 'Gas']], onRecord: [] };
    expect(materialViolations('A man hauls a pressure canister of flammable gas toward a buyer.', words)).toEqual([]);
    expect(materialViolations('A medic\'s lancet takes a vial of her blood.', words)).toEqual([]);
    expect(materialViolations('It is a long history for something that is a ring of rubber.', words)).toEqual([]);
    expect(materialViolations('Blood ran down the gantry.', words)).toEqual([]);
  });

  it('a label, a quoted word, a name and a pair do', () => {
    const words = { words: ['Fiery', 'Gas', 'Fortify', 'History', 'Dominion'], pairs: [['Fiery', 'Gas']], onRecord: [] };
    expect(materialViolations('History: the seal has a long one.', words)).toHaveLength(1);
    expect(materialViolations('You tape the seal. Fortify — that is the word for it.', words)).toHaveLength(1);
    expect(materialViolations('She calls it *fortify*, and means it.', words)).toHaveLength(1);
    expect(materialViolations('She asks who served the Dominion.', words)).toHaveLength(1);
    expect(materialViolations('A fiery gas leaks from the valve.', words)).toHaveLength(1);
    expect(materialViolations('A fiery-gas canister.', words)).toHaveLength(1);
  });

  it('a name the records hold is written as they have it — the MATERIAL\'s own lines are no record of it', () => {
    const seeds = [{ label: 'What happens', from: 'oracle', tables: [{ result: 'Avenge' }, { result: 'Dominion' }], result: 'Avenge Dominion' }];
    const material = formatMaterial(seeds);
    expect(rolledWordsOf(seeds, { told: `OPENING VIGNETTE\n${material}` }).onRecord).toEqual([]);
    const onRecord = rolledWordsOf(seeds, { told: `FACTIONS: the Dominion holds the Reach.\n${material}` }).onRecord;
    expect(onRecord).toEqual(['Dominion']);
    expect(materialViolations('She asks who served the Dominion.', { words: ['Avenge', 'Dominion'], pairs: [], onRecord })).toEqual([]);
  });

  it('is a certain line of a set-piece\'s obligations, and of no other narration\'s', () => {
    const material = rolledWordsOf([{ from: 'oracle', tables: [{ result: 'Fortify' }, { result: 'History' }], result: 'Fortify History' }]);
    const obligations = obligationsFor({ mode: 'set-piece', material });
    expect(obligations.map(o => [o.kind, o.list])).toEqual([['material', 'NOT SO']]);
    expect(certainViolations('Fortify, in the plainest sense: you press each edge flat.', obligations)).toEqual([
      { tag: 'material', quote: expect.stringContaining('Fortify, in the plainest sense') },
    ]);
    expect(obligationsFor({ mode: 'set-piece', material: rolledWordsOf([]) })).toEqual([]);
    expect(certainViolations('Fortify, in the plainest sense.', obligationsFor({ mode: 'round' }))).toEqual([]);
  });
});

describe('narrateSessionVignette holds its narration to the MATERIAL before it posts', () => {
  const SIDECAR = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
  const reply = (text) => ({ content: [{ type: 'text', text }], usage: {}, stop_reason: 'end_turn' });
  const narrations = () => apiPost.mock.calls.map(c => c[2]).filter(b => String(b.system?.[0]?.text ?? '').startsWith('## NARRATOR ROLE AND VOICE'));
  const SEEDS = [
    { slot: 'moment', label: 'What Mira Kestrel is doing in this lull', from: 'oracle',
      tables: [{ name: 'Action', roll: 49, result: 'Fortify' }, { name: 'Theme', roll: 43, result: 'History' }], result: 'Fortify History', used: null },
  ];
  const USER = `OPENING VIGNETTE — the session begins.\n\n${formatMaterial(SEEDS)}`;
  const BROKEN = 'Fortify, in the plainest sense: you press each edge of the patch flat with your thumb.';
  const KEPT = 'You press each edge of the patch flat with your thumb and recite the seal\'s old repairs.';

  beforeEach(() => {
    vi.clearAllMocks();
    ChatMessage._reset();
    game.settings._store.clear();
    game.actors._reset();
    global.game.messages = { contents: [] };
    global.game.user = { id: 'gm-1', isGM: true };
    global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
    game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 'sess-3', sessionNumber: 3, sceneTruths: [] });
  });

  it('a96\'s label is asked again once, with the draft and the rule it broke, and the second is posted', async () => {
    apiPost.mockResolvedValueOnce(reply(`${BROKEN}${SIDECAR}`)).mockResolvedValue(reply(`${KEPT}${SIDECAR}`));
    const text = await narrateSessionVignette({ userMessage: USER, campaignState: game.settings.get(MODULE_ID, 'campaignState'), seeds: SEEDS });
    expect(text).toBe(KEPT);
    const calls = narrations();
    expect(calls).toHaveLength(2);
    const again = calls[1].messages[0].content;
    expect(again).toContain('## YOUR DRAFT — NOT POSTED');
    expect(again).toContain('- [material] A result\'s words are the oracle\'s, never the prose\'s');
    expect(again).toContain('(it says: "Fortify, in the plainest sense');
  });

  it('a narration that keeps it is one call; one that breaks it again is posted all the same (fail-open)', async () => {
    apiPost.mockResolvedValue(reply(`${KEPT}${SIDECAR}`));
    expect(await narrateSessionVignette({ userMessage: USER, campaignState: game.settings.get(MODULE_ID, 'campaignState'), seeds: SEEDS })).toBe(KEPT);
    expect(narrations()).toHaveLength(1);

    vi.clearAllMocks();
    apiPost.mockResolvedValue(reply(`${BROKEN}${SIDECAR}`));
    expect(await narrateSessionVignette({ userMessage: USER, campaignState: game.settings.get(MODULE_ID, 'campaignState'), seeds: SEEDS })).toBe(BROKEN);
    expect(narrations()).toHaveLength(2);
  });

  it('a set-piece with no rolled pair — the galley\'s, a records-only cutaway — is never asked again', async () => {
    apiPost.mockResolvedValue(reply(`${BROKEN}${SIDECAR}`));
    await narrateSessionVignette({ userMessage: 'OPENING VIGNETTE — the galley.', campaignState: game.settings.get(MODULE_ID, 'campaignState'), seeds: null });
    expect(narrations()).toHaveLength(1);
  });
});
