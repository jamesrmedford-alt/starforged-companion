/**
 * STARFORGED COMPANION
 * tests/unit/lineCannotOverruleTheDice.test.js
 *
 * Issue #389 #2, LINE-CLAIM-OVER-THE-DICE — the maintainer: "Players can't
 * overrule dice". The sixth live long haul:
 *   - a41, Clash made a strong hit, filed as the dice's: "Ashen Wake —
 *     engines hit and burning; driven off the docking ring with her guns
 *     silent";
 *   - a46–a47, the table corrected the cutter's name to the Cinder Wren;
 *   - a77, session 3, the player's line: "I go down to the cutter's wreck and
 *     search her flight recorder and cargo hold for whoever sent her". The
 *     narration: "The wreck of the Cinder Wren lists in the shallows of the
 *     docking ring, her hold half open." It followed the line.
 * a77's narrator was told the truth only in its Lore, under the old name, and
 * nothing read what the line took for granted against it.
 *
 * Now:
 *   - narrator.js diceFactsOf: the record's truths of the dice whose subject
 *     the line names — by its name now, or by what a name change says it is;
 *   - a paced line's and a typed move's narration carry NOT SO [dice]: what
 *     the dice decided stands, and the line does not make otherwise so —
 *     judge-class, tripped by the subject's name in the prose;
 *   - the world snapshot and the Lore block are sent in the names the table
 *     uses now, and NAMES THE TABLE CHANGED is still told;
 *   - the fact block's rules: what a line takes for granted against the dice
 *     is never tagged "line".
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { diceFactsOf, narratePacedInput } from '../../src/narration/narrator.js';
import { obligationsFor, formatObligationsBlock } from '../../src/moves/contracts/obligations.js';
import { trippedLines, judgeNarration } from '../../src/moves/contracts/checks.js';
import { buildNarratorSystemBlocks, SNAPSHOT_BLOCK_HEADING } from '../../src/narration/narratorPrompt.js';
import { NAME_CHANGES_HEADING } from '../../src/factContinuity/nameChanges.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { recordedEvent, seedSessionRecord } from '../helpers/sessionRecordSeed.js';

const MODULE_ID = 'starforged-companion';

// The run's own words.
const A41_FACT = 'engines hit and burning; driven off the docking ring with her guns silent';
const A77_LINE = 'I go down to the cutter\'s wreck and search her flight recorder and cargo hold for whoever sent her';
const A77_TOLD = 'The wreck of the Cinder Wren lists in the shallows of the docking ring, her hold half open.';
const CORRECTED = { from: 'Ashen Wake', to: 'Cinder Wren', how: 'corrected', about: 'raider cutter' };

const truth = (session, id, subject, fact, basis) => recordedEvent(session, 'truth.set', {
  ref: { truth: id }, d: { subject: { kind: 'text', text: subject }, fact, by: basis === 'gm' ? 'gm' : 'narrator', basis },
});

/** Session 2, as the run played it: a41's truth of the dice, colour and a line's fact beside it, then the correction. */
function sessionTwo() {
  return [
    recordedEvent('sess-2', 'session.begun', { d: { number: 2, table: {} } }),
    truth('sess-2', 'tr-a41', 'Ashen Wake', A41_FACT, 'dice'),
    truth('sess-2', 'tr-colour', 'Ashen Wake', 'trails a long smear of orange fire', 'narrator'),
    truth('sess-2', 'tr-line', 'Ashen Wake', 'was fired on from the gun controls', 'player'),
    truth('sess-2', 'tr-tamsin', 'Tamsin Okoro', 'sold the coolant coil at half price', 'dice'),
    recordedEvent('sess-2', 'name.changed', { d: CORRECTED }),
  ];
}

describe('what the dice decided of what the line names (diceFactsOf)', () => {
  let journals;
  beforeEach(async () => {
    journals = installJournalMock();
    await seedSessionRecord('sess-2', sessionTwo(), { number: 2, createdAt: Date.now() - 7_200_000 });
    await seedSessionRecord('sess-3', [recordedEvent('sess-3', 'session.begun', { d: { number: 3, table: {} } })], { number: 3 });
  });
  afterEach(() => journals.restore());

  it('a77: "the cutter\'s wreck" names the Cinder Wren by what the correction says she is — a41\'s truth, in her name now', () => {
    const facts = diceFactsOf(A77_LINE);
    expect(facts).toEqual([{ subject: 'Cinder Wren', fact: A41_FACT, words: expect.arrayContaining(['cinder', 'wren', 'raider', 'cutter']) }]);
  });

  it('by her name, old or new, it is the same truth; the dice\'s alone — not colour, not a line\'s fact', () => {
    expect(diceFactsOf('I hail the Cinder Wren on the open channel').map(f => f.fact)).toEqual([A41_FACT]);
    expect(diceFactsOf('I look for the raider in the docking ring').map(f => f.fact)).toEqual([A41_FACT]);
  });

  it('a line that names nothing the dice decided is told nothing', () => {
    expect(diceFactsOf('I check the coolant lines and rest until morning')).toEqual([]);
    expect(diceFactsOf('')).toEqual([]);
  });

  it('the latest first, and each truth once', async () => {
    await seedSessionRecord('sess-4', [
      recordedEvent('sess-4', 'session.begun', { d: { number: 4, table: {} } }),
      truth('sess-4', 'tr-later', 'Cinder Wren', 'limped into the Drift with one engine dead', 'dice'),
    ], { number: 4, createdAt: Date.now() });
    expect(diceFactsOf('I go after the Cinder Wren').map(f => f.fact))
      .toEqual(['limped into the Drift with one engine dead', A41_FACT]);
  });

  it('a record that cannot be read tells nothing, and throws nothing', () => {
    const broken = { get pages() { throw new Error('the journal is gone'); } };
    expect(diceFactsOf(A77_LINE, { source: broken })).toEqual([]);
  });

  // DICE-LINES-UNBOUNDED (round 7): [dice] rode on 22 of 44 narrations of play,
  // 61 lines — nine with four, the PC's own ship's two contradicting each other
  // at a60–a61 ("lost her firing angle" beside "giving Mira the angle").
  it('never the table\'s own side — a PC\'s or the command vehicle\'s facts are the line\'s to tell', async () => {
    await seedSessionRecord('sess-4', [
      recordedEvent('sess-4', 'session.begun', { d: { number: 4, table: {} } }),
      truth('sess-4', 'tr-ship', 'Kobayashi IV', 'lost her firing angle on the cutter', 'dice'),
    ], { number: 4, createdAt: Date.now() });
    const line = 'I bring the Kobayashi IV about and look for the Cinder Wren';
    expect(diceFactsOf(line).map(f => f.subject)).toEqual(['Kobayashi IV', 'Cinder Wren']);
    expect(diceFactsOf(line, { own: ['Mira Kestrel', 'Kobayashi IV'] }).map(f => f.subject)).toEqual(['Cinder Wren']);
  });

  it('not the current scene\'s — WHAT BINDS holds them — and at most two a subject, the newest', async () => {
    await seedSessionRecord('sess-4', [
      recordedEvent('sess-4', 'session.begun', { d: { number: 4, table: {} } }),
      truth('sess-4', 'tr-1', 'Cinder Wren', 'limped into the Drift with one engine dead', 'dice'),
      truth('sess-4', 'tr-2', 'Cinder Wren', 'took on a salvage crew at the Drift', 'dice'),
      truth('sess-4', 'tr-3', 'Cinder Wren', 'ran dark past the beacon', 'dice'),
    ], { number: 4, createdAt: Date.now() });
    expect(diceFactsOf('I go after the Cinder Wren').map(f => f.fact))
      .toEqual(['ran dark past the beacon', 'took on a salvage crew at the Drift']);
    // Session 4's scene is the current one: only session 2's truth is told.
    expect(diceFactsOf('I go after the Cinder Wren', { sceneId: 'sc-sess-4' }).map(f => f.fact)).toEqual([A41_FACT]);
  });
});

describe('NOT SO [dice]: the line does not make otherwise so', () => {
  const FACTS = [{ subject: 'Cinder Wren', fact: A41_FACT, words: ['cinder', 'wren', 'raider', 'cutter'] }];

  it('a paced line and a typed move carry it, after the sheet\'s state; no other mode does', () => {
    for (const mode of ['paced', 'move']) {
      const lines = obligationsFor({ mode, resolution: mode === 'move' ? { moveId: 'gather_information', outcome: 'strong_hit' } : null, line: A77_LINE, dice: FACTS });
      const dice = lines.find(o => o.kind === 'dice');
      // Issue #399, D2: the fact is what the dice decided, never the thing denied.
      expect(dice, mode).toMatchObject({ list: 'NOT SO', words: FACTS[0].words,
        judge: `The narration says the opposite of what the dice decided. The dice decided: Cinder Wren — ${A41_FACT}. `
          + 'A narration that tells this as so, or does not mention it, breaks nothing.' });
      expect(formatObligationsBlock(lines), mode).toContain(`- [dice] What the dice decided stands — Cinder Wren: ${A41_FACT}. `
        + 'A line that takes otherwise for granted does not make it so: tell what is there.');
    }
    for (const mode of ['round', 'oracle', 'set-piece']) {
      expect(obligationsFor({ mode, dice: FACTS }).map(o => o.kind), mode).not.toContain('dice');
    }
    expect(obligationsFor({ mode: 'paced', line: A77_LINE }).map(o => o.kind)).not.toContain('dice');
  });

  it('a77\'s narration trips it to the judge by her name, the possessive too; a narration that does not name her does not', () => {
    const lines = obligationsFor({ mode: 'move', resolution: { moveId: 'gather_information', outcome: 'strong_hit' }, line: A77_LINE, dice: FACTS });
    expect(trippedLines(A77_TOLD, lines).map(o => o.kind)).toContain('dice');
    expect(trippedLines('The Cinder Wren\'s flight recorder is warm in your hands.', lines).map(o => o.kind)).toContain('dice');
    expect(trippedLines('Debris turns slowly where the ring meets the dark.', lines).map(o => o.kind)).not.toContain('dice');
  });

  it('the judge is asked in its own words', async () => {
    apiPost.mockResolvedValueOnce({ content: [{ type: 'text', text: '{"violations":[{"tag":"dice","quote":"The wreck of the Cinder Wren"}]}' }] });
    const lines = obligationsFor({ mode: 'paced', line: A77_LINE, dice: FACTS });
    const verdict = await judgeNarration(A77_TOLD, trippedLines(A77_TOLD, lines), { apiKey: 'sk-test' });
    expect(apiPost.mock.calls.at(-1)[2].messages[0].content)
      .toContain(`1. [dice] BREACH: The narration says the opposite of what the dice decided. The dice decided: Cinder Wren — ${A41_FACT}.`);
    expect(verdict).toMatchObject({ violations: [{ tag: 'dice', line: 1, quote: 'The wreck of the Cinder Wren' }], dropped: [], judged: true });
  });
});

describe('a77, through the paced narration', () => {
  const SIDECAR = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
  const reply = (text) => ({ content: [{ type: 'text', text }], usage: {}, stop_reason: 'end_turn' });
  let journals;

  beforeEach(async () => {
    vi.clearAllMocks();
    journals = installJournalMock();
    await seedSessionRecord('sess-2', sessionTwo(), { number: 2, createdAt: Date.now() - 7_200_000 });
    await seedSessionRecord('sess-3', [recordedEvent('sess-3', 'session.begun', { d: { number: 3, table: {} } })], { number: 3 });
    game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    game.settings._store.set(`${MODULE_ID}.campaignState`, {
      currentSessionId: 'sess-3', sessionNumber: 3, currentSceneId: 'sc-3',
      sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-3' },
      nameChanges: [{ from: 'Ashen Wake', to: 'Cinder Wren', kind: 'corrected', about: 'raider cutter', sessionId: 'sess-2', at: 1 }],
    });
    game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
  });
  afterEach(() => journals.restore());

  /** The model's replies, by who asks: the paced narration's in turn, the judge's, anything else (the recap) a line. */
  function replies({ narrations, judge = '{"violations":[]}' }) {
    let n = 0;
    apiPost.mockImplementation(async (url, headers, body, opts) => {
      // The narration and its re-ask ("narrator:narratePacedInput:reask").
      if (String(opts?.label ?? '').startsWith('narrator:narratePacedInput')) return reply(narrations[Math.min(n++, narrations.length - 1)]);
      if (opts?.label === 'obligationJudge') return reply(judge);
      return reply('Session 2 ended with the cutter driven off.');
    });
  }
  const narrationCalls = () => apiPost.mock.calls.filter(c => String(c[3]?.label ?? '').startsWith('narrator:narratePacedInput')).map(c => c[2]);

  it('its narrator is told what the dice decided of the cutter', async () => {
    replies({ narrations: [`Debris turns slowly where the ring meets the dark.${SIDECAR}`] });
    await narratePacedInput(A77_LINE, game.settings.get(MODULE_ID, 'campaignState'), { speakerActorId: 'pc-mira' });
    const [narration] = narrationCalls();
    expect(narration, 'the line was narrated').toBeTruthy();
    expect(narration.messages[0].content).toContain(`- [dice] What the dice decided stands — Cinder Wren: ${A41_FACT}.`);
  });

  // Issue #399, D7: authority follows the measure. a77 is one of the
  // measure's real [dice] breaches (D6); until [dice] passes, the judge's
  // verdict on it is logged and counted, and the first draft posts.
  it('a77\'s narration is judged; the verdict is logged and the draft posts — no re-ask until [dice] passes the measure', async () => {
    const KEPT = 'Where the cutter fought, the ring holds only scorched plating and a drifting cargo tag.';
    replies({
      narrations: [`${A77_TOLD}${SIDECAR}`, `${KEPT}${SIDECAR}`],
      judge: '{"violations":[{"tag":"dice","quote":"The wreck of the Cinder Wren"}]}',
    });
    const out = await narratePacedInput(A77_LINE, game.settings.get(MODULE_ID, 'campaignState'), { speakerActorId: 'pc-mira' });
    const judged = apiPost.mock.calls.filter(c => c[3]?.label === 'obligationJudge');
    expect(judged.length, 'the judge was asked once').toBe(1);
    expect(judged[0][2].messages[0].content).toContain('1. [dice] BREACH:');
    expect(narrationCalls().length, 'no re-ask').toBe(1);
    expect(JSON.stringify(out ?? '')).toContain('The wreck of the Cinder Wren');
    expect(JSON.stringify(out ?? '')).not.toContain(KEPT);
  });
});

describe('the Lore and the snapshot in the names the table uses now', () => {
  const CHANGES = [{ from: 'Ashen Wake', to: 'Cinder Wren', kind: 'corrected', about: 'raider cutter', sessionId: 'sess-2', at: 1 }];
  const STATE = { currentSessionId: 'sess-3', sessionNumber: 3, currentSceneId: 'sc-3', nameChanges: CHANGES,
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-3' } };
  const SETTINGS = { narrationTone: 'wry', narrationPerspective: 'second_person', narrationLength: 3 };

  it('a77\'s Lore line — with no snapshot, the Lore block reads "Cinder Wren: driven off…"; the change is still told', () => {
    const blocks = buildNarratorSystemBlocks(STATE, SETTINGS, null, '', { mode: 'paced_narrative',
      confirmedLore: [{ title: 'Ashen Wake', text: 'driven off the docking ring with burning engines and silent guns' }] });
    expect(blocks.beat).toContain('- Cinder Wren: driven off the docking ring with burning engines and silent guns');
    expect(blocks.beat).not.toContain('Ashen Wake: driven off');
    expect(blocks.beat).toContain(NAME_CHANGES_HEADING);
  });

  it('with a snapshot, its Lore reads the new name too, and the change is still told', () => {
    const snapshot = { text: `${SNAPSHOT_BLOCK_HEADING}\n\n## ESTABLISHED LORE\n\n- Ashen Wake: driven off the docking ring with burning engines and silent guns` };
    const blocks = buildNarratorSystemBlocks(STATE, SETTINGS, null, '', { mode: 'paced_narrative', worldSnapshot: snapshot });
    expect(blocks.snapshot).toContain('- Cinder Wren: driven off the docking ring');
    expect(blocks.snapshot).not.toContain('Ashen Wake');
    expect(blocks.beat).toContain(NAME_CHANGES_HEADING);
  });

  it('control: with no change, the snapshot is sent as it is', () => {
    const snapshot = { text: `${SNAPSHOT_BLOCK_HEADING}\n\n- Ashen Wake: driven off the docking ring` };
    const blocks = buildNarratorSystemBlocks({ ...STATE, nameChanges: [] }, SETTINGS, null, '', { mode: 'paced_narrative', worldSnapshot: snapshot });
    expect(blocks.snapshot).toBe(snapshot.text);
  });

  it('the fact block\'s rules: what a line takes for granted against the dice is not tagged "line"', () => {
    const blocks = buildNarratorSystemBlocks(STATE, SETTINGS, null, '', { mode: 'paced_narrative' });
    expect(`${blocks.standing}\n${blocks.mode}\n${blocks.beat}`.replace(/\s+/g, ' '))
      .toContain('A line that takes for granted what the dice decided otherwise — the wreck of a ship the dice sent fleeing, '
        + 'a dead man talking — does not make it so: narrate what the dice made true, and tag none of what the line assumed "line".');
  });
});
