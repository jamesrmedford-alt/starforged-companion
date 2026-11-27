/**
 * STARFORGED COMPANION
 * tests/unit/quietThreadsComeBack.test.js
 *
 * The maintainer's call after the long haul's eighth live round (2026-11-26):
 * of the run's four hidden plans only the vow's was revealed — the comm
 * voice's (made at a42) and the wreck's (a24) went nowhere, and the cold read
 * found "almost every thread is dropped". A plan in play that has not come up
 * for a few scenes is named to the narrator as a thread to bring back with
 * one of its clues — a prompt line, no extra call.
 *
 * A plan comes up when a narration shows one of its clues or plays one of its
 * steps, and when it is made (skeletons.js quietestPlan).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { quietestPlan, QUIET_SCENES } from '../../src/world/skeletons.js';
import { formatUnrevealedBlock } from '../../src/narration/narratorPrompt.js';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { resetSkeletonTable, gmOf, narrationCallsOf, narrateMoveOn, moveResolution, onGm, MODULE_ID } from '../helpers/skeletonTable.js';

const T0 = Date.parse('2026-11-26T18:50:00Z');
/** Narrations, one a minute; each scene begins with its first. */
const cards = (scenes) => scenes.flatMap((sceneId, i) => [
  { narrationId: `nar-${i}a`, sceneId, at: T0 + i * 120_000 },
  { narrationId: `nar-${i}b`, sceneId, at: T0 + i * 120_000 + 60_000 },
]);
const plan = (id, over = {}) => ({ id, kind: 'npcAgenda', status: 'active', truthRevealed: false, subject: { type: 'npc', id: `s-${id}`, name: id },
  truth: `What ${id} really wants.`, clues: [{ id: 'c1', text: `${id}'s first clue`, revealed: false }], escalation: [],
  createdAt: new Date(T0 - 1).toISOString(), ...over });

describe('a thread gone quiet', () => {
  it(`a plan made before ${QUIET_SCENES} scenes and never come up is the one to bring back, with its next clue`, () => {
    const q = quietestPlan([plan('the voice on the comm')], { cards: cards(['sc1', 'sc2', 'sc3']) });
    expect(q).toMatchObject({ scenes: 3, clue: 'the voice on the comm\'s first clue' });
    expect(q.plan.id).toBe('the voice on the comm');
  });

  it('a clue shown in the last scene, or a step played in it, is a plan that came up', () => {
    const shown = plan('the wreck', { clues: [{ id: 'c1', text: 'a cut plate', revealed: true, revealedBy: 'nar-2a' }, { id: 'c2', text: 'fresh scoring', revealed: false }] });
    expect(quietestPlan([shown], { cards: cards(['sc1', 'sc2', 'sc3']) })).toBeNull();
    const played = plan('the cutter', { escalation: [{ id: 'e1', text: 'a second hull comes', done: true, playedBy: 'nar-2b' }] });
    expect(quietestPlan([played], { cards: cards(['sc1', 'sc2', 'sc3']) })).toBeNull();
    // Its clue shown three scenes back, it is quiet again.
    const earlier = plan('the wreck', { clues: [{ id: 'c1', text: 'a cut plate', revealed: true, revealedBy: 'nar-0a' }, { id: 'c2', text: 'fresh scoring', revealed: false }] });
    expect(quietestPlan([earlier], { cards: cards(['sc1', 'sc2', 'sc3', 'sc4']) })).toMatchObject({ scenes: 3, clue: 'fresh scoring' });
  });

  it('the quietest of several; none quiet long enough is none; and never one revealed, ended, undecided, or with no clue left', () => {
    const old = plan('old', { createdAt: new Date(T0 - 1).toISOString() });
    const newer = plan('newer', { createdAt: new Date(T0 + 130_000).toISOString() });
    expect(quietestPlan([newer, old], { cards: cards(['sc1', 'sc2', 'sc3', 'sc4']) }).plan.id).toBe('old');
    expect(quietestPlan([plan('young', { createdAt: new Date(T0 + 130_000).toISOString() })], { cards: cards(['sc1', 'sc2', 'sc3']) })).toBeNull();
    for (const over of [{ truthRevealed: true }, { status: 'resolved' }, { truth: '' }, { clues: [{ id: 'c1', text: 'shown', revealed: true }] }]) {
      expect(quietestPlan([plan('x', over)], { cards: cards(['sc1', 'sc2', 'sc3']) }), JSON.stringify(over)).toBeNull();
    }
  });

  it('the plans block names it, with its clue — and only a plan in play, with a fact block to record the reveal', () => {
    const p = plan('the voice on the comm');
    const quiet = { id: p.id, subject: p.subject.name, scenes: 3, clue: 'the voice on the comm\'s first clue' };
    const block = formatUnrevealedBlock([p], { quiet });
    expect(block).toContain('### A THREAD GONE QUIET');
    expect(block).toContain('the voice on the comm (id the voice on the comm) has not come up for 3 scenes. Bring it back in this beat '
      + 'through one of its clues — "the voice on the comm\'s first clue" — shown in the fiction, never explained, and record the reveal in your sidecar.');
    expect(formatUnrevealedBlock([plan('another')], { quiet })).not.toContain('A THREAD GONE QUIET');
    expect(formatUnrevealedBlock([p], { quiet, sidecar: false })).not.toContain('A THREAD GONE QUIET');
  });
});

describe('a move\'s narration brings a quiet thread back', () => {
  let table;
  let restore;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => { restore = await resetSkeletonTable(table); });
  afterEach(() => restore?.());

  async function voicePlanThenScenes(sceneIds) {
    const secrets = await gmOf(table).import('../../src/world/secrets.js');
    await onGm(table, () => secrets.createSkeleton({
      kind: 'npcAgenda', subject: { type: 'npc', id: 'npc-voice', name: 'the voice on the comm' },
      truth: 'A broker of the raids, speaking from the Spire.', wants: 'To keep the lanes his',
      clues: [{ text: 'the voice knows the berth number' }], escalation: [{ text: 'it calls again' }],
      sceneId: 'sc-old', sessionId: 's-1',
    }));
    const now = Date.now();
    for (const [i, sceneId] of sceneIds.entries()) {
      await onGm(table, () => ChatMessage.create({ content: `<p>Narration ${i}.</p>`, timestamp: now + 1000 * (i + 1),
        flags: { [MODULE_ID]: { narrationId: `nar-q${i}`, sceneId } } }));
    }
  }

  it('quiet for three scenes, it is in the narration\'s plans with its clue to show', async () => {
    await voicePlanThenScenes(['sc-a', 'sc-b', 'sc-c']);
    await narrateMoveOn(table, moveResolution());
    const system = narrationCallsOf(table).at(-1)?.system ?? '';
    expect(system).toContain('### A THREAD GONE QUIET');
    expect(system).toContain('the voice on the comm (id ');
    expect(system).toContain('"the voice knows the berth number"');
  }, 40_000);

  it('control: quiet for two, it is left alone', async () => {
    await voicePlanThenScenes(['sc-a', 'sc-b']);
    await narrateMoveOn(table, moveResolution());
    expect(narrationCallsOf(table).at(-1)?.system ?? '').not.toContain('A THREAD GONE QUIET');
  }, 40_000);
});
