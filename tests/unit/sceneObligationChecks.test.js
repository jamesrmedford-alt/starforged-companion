/**
 * STARFORGED COMPANION
 * tests/unit/sceneObligationChecks.test.js
 *
 * Overhaul 2 §10.3 (known-issues SCENE-OBLIGATIONS-UNCHECKED): the scene's
 * obligations are checked before the narration posts, in overhaul 4's
 * classes (moves/contracts/checks.js):
 *
 *   NOT SO [place]  told to the narrator on the beat that opens a fight's
 *                   scene while the ship's record has her docked. It was a
 *                   judge tripwire ("docked", "berth", "clamps") until issue
 *                   #399's measure retired it from both judges (D10: the
 *                   pre-post judge read a ship firing from her clamps, where
 *                   the dice had her pinned, as the breach)
 *   NOT SO [letgo]  a floor, logged — the fourth live run's session 3 ended
 *                   beat after beat on "the second amber light" play had let
 *                   go: a stem of the let-go question in the prose's last two
 *                   sentences that the beat's player words do not hold
 *
 * And the narrator hands each beat's check the beat's player words.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const SIDECAR = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const replies = { judge: [], narration: [] };
vi.mock('../../src/api-proxy.js', async (importOriginal) => ({
  ...(await importOriginal()),
  apiPost: vi.fn(async (_url, _headers, _body, opts) => {
    const label = String(opts?.label ?? '');
    let text = '{}';
    if (label === 'obligationJudge') {
      const next = replies.judge.shift();
      if (next instanceof Error) throw next;
      text = next ?? '{"violations":[]}';
    } else if (label.startsWith('narrator:narratePacedInput')) {
      text = replies.narration.shift() ?? `The deck is quiet.${SIDECAR}`;
    }
    return { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
  }),
}));

import { apiPost } from '../../src/api-proxy.js';
import { floorViolations, trippedLines, narrateKeepingObligations, redraftBlock, checkClassOf, judgeMayAct } from '../../src/moves/contracts/checks.js';
import { auditObligationSection } from '../../src/factContinuity/consistencyCheck.js';
import { sceneObligations } from '../../src/factContinuity/sceneTurns.js';
import { letGoEntry } from '../../src/factContinuity/provenance.js';
import { narratePacedInput } from '../../src/narration/narrator.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const DOCKED = 'Kobayashi IV docked at Bleakhold Station';
const userOf = (call) => String(call?.[2]?.messages?.[0]?.content ?? '');

/** The beat that opens a fight's scene while the ship's record has her docked. */
const fightOpens = () => sceneObligations({
  currentSceneId: 'sc-2', sceneTruths: [], sceneFrame: null,
  sceneBegan: { sceneId: 'sc-2', cause: 'fight', what: 'a fight began with the cutter' },
}, { ship: DOCKED });
const placeOf = (list) => list.filter(o => o.kind === 'place');

const LIGHT = 'What is the second amber light above the stall?';
const letGoLines = () => sceneObligations({
  currentSceneId: 'sc-3', sceneTruths: [], sceneBegan: null,
  sceneFrame: { sceneId: 'sc-3', location: "Tamsin's stall", present: ['Tamsin Vey'], letGo: [letGoEntry(LIGHT, { about: ['Mira Kestrel'] })] },
});
const ENDS_ON_IT = 'Mira counts the crates twice. Tamsin marks the ledger. Above the stall, the second amber light blinks on again.';

beforeEach(() => {
  replies.judge.length = 0;
  replies.narration.length = 0;
  apiPost.mockClear();
});

describe('NOT SO [place] — the narrator\'s alone (overhaul 2 §6.2; issue #399 D10)', () => {
  it('the line is told to the narrator; no judge reads it — the measure retired it from both passes', () => {
    const [place] = placeOf(fightOpens());
    expect(place).toMatchObject({ kind: 'place', list: 'NOT SO' });
    expect(place.text).toContain('If this fight is the ship\'s, she is no longer docked: say where she is in your fact block');
    expect(place.judge).toBeUndefined();
    expect(checkClassOf('place')).toBe('logged');
    expect(judgeMayAct('place', 'audit')).toBe(false);
    expect(trippedLines('Still in the clamps at the lock, the Kobayashi IV swings her guns onto the cutter.', [place])).toEqual([]);
    expect(auditObligationSection([place]).lines).toEqual([]);
  });

  it('a ship\'s fight told in the clamps: no judge call, and the draft posts as written', async () => {
    const place = placeOf(fightOpens());
    const DRAFT = `Still in the clamps at the lock, the Kobayashi IV swings her guns onto the cutter.${SIDECAR}`;
    const call = vi.fn(async () => DRAFT);
    const kept = await narrateKeepingObligations(call, place, { apiKey: 'sk-test' });
    expect(apiPost).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledTimes(1);
    expect(kept).toMatchObject({ raw: DRAFT, reasked: false });
    // A re-ask's block names a line in the narrator's words, never a judge's.
    expect(redraftBlock(DRAFT, [{ tag: 'place', quote: 'Still in the clamps at the lock' }], place))
      .toContain('- [place] Kobayashi IV is docked at Bleakhold Station by the ship\'s record.');
  });
});

describe('NOT SO [letgo] — a floor, logged (overhaul 2 §7.3, §10.3)', () => {
  it('the line carries its let-go question; the narration that ends on it is logged — never re-asked', () => {
    const lines = letGoLines();
    expect(lines).toEqual([expect.objectContaining({ kind: 'letgo', list: 'NOT SO', letGo: expect.objectContaining({ text: LIGHT }) })]);
    const v = floorViolations(ENDS_ON_IT, lines, { line: 'I count the crates twice.' });
    expect(v.reask).toEqual([]);
    expect(v.logged).toEqual([{ tag: 'letgo', quote: expect.stringContaining('the second amber light blinks on again') }]);
  });

  it('the player\'s line takes it up: nothing is logged', () => {
    expect(floorViolations(ENDS_ON_IT, letGoLines(), { line: 'I look up at the amber light.' }).logged).toEqual([]);
  });

  it('the light early in the narration, not in its last two sentences: nothing is logged', () => {
    const prose = 'The second amber light blinks once and goes dark. Mira counts the crates twice. Tamsin marks the ledger.';
    expect(floorViolations(prose, letGoLines(), { line: 'I count the crates twice.' }).logged).toEqual([]);
  });

  it('through the check: logged in its verdicts, the draft posted as written — no re-ask and no judge call', async () => {
    const call = vi.fn(async () => `${ENDS_ON_IT}${SIDECAR}`);
    const onVerdict = vi.fn();
    const kept = await narrateKeepingObligations(call, letGoLines(), { apiKey: 'sk-test', ctx: { line: 'I count the crates twice.' }, onVerdict });
    expect(call).toHaveBeenCalledTimes(1);
    expect(apiPost).not.toHaveBeenCalled();
    expect(kept).toMatchObject({ reasked: false });
    expect(onVerdict).toHaveBeenCalledWith(expect.objectContaining({
      verdicts: [expect.objectContaining({ tag: 'letgo', class: 'floor', action: 'logged' })], reasked: false,
    }));
  });
});

describe('the narrator hands the check the beat\'s player words', () => {
  beforeEach(() => {
    game.actors._reset();
    ChatMessage._reset();
    global.game.messages = { contents: [] };
    const store = game.settings._store;
    store.clear();
    store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    store.set(`${MODULE_ID}.chronicleAutoEntry`, false);
    store.set(`${MODULE_ID}.campaignState`, {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 's3', sessionNumber: 3,
      currentSceneId: 'sc-3', sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-3' },
      sceneFrame: { sceneId: 'sc-3', location: "Tamsin's stall", present: ['Tamsin Vey'], situation: '', question: '',
        letGo: [letGoEntry(LIGHT, { about: ['Mira Kestrel'] })] },
    });
  });
  const obligationLogs = (spy) => spy.mock.calls.map(c => String(c[0] ?? '')).filter(m => m.includes('| obligations (paced)'));

  it('a paced line under a let-go question: the narration ending on it is logged; one whose line takes it up is not', async () => {
    silenceConsoleErrors();
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      replies.narration.push(`${ENDS_ON_IT}${SIDECAR}`);
      await narratePacedInput('I count the crates twice.', game.settings.get(MODULE_ID, 'campaignState'), {});
      expect(obligationLogs(info).join('\n')).toMatch(/\[letgo\] floor logged/);

      info.mockClear();
      replies.narration.push(`${ENDS_ON_IT}${SIDECAR}`);
      await narratePacedInput('I look up at the amber light.', game.settings.get(MODULE_ID, 'campaignState'), {});
      expect(obligationLogs(info).join('\n')).not.toMatch(/\[letgo\]/);
    } finally {
      info.mockRestore();
    }
  });
});
