/**
 * STARFORGED COMPANION
 * tests/unit/whoVowCulpritFromTheStory.test.js
 *
 * VOW-WON-BY-A-STRANGER (the long haul's eighth live round, 2026-11-26,
 * explorations/long-haul-live-20261126-184225/): the vow "Find who is raiding
 * the Cinder Expanse lanes" was won at a91 by naming "Dalen Voss, of the
 * Spire's own administration" — the plan the oath decided at a3 — whom the
 * player had never met: "Voss's face is not one you have seen". The cold
 * read's first complaint.
 *
 * The maintainer's call: a who-vow's culprit is one of the people the story
 * has met where one fits, and a new one is shown in play before the truth is
 * revealed. DECIDE NOW lists the people met; a decided who-plan whose truth
 * names a stranger is told to show them first.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { strangerNamedIn } from '../../src/world/skeletons.js';
import { formatUnrevealedBlock } from '../../src/narration/narratorPrompt.js';
import { narratePacedInput } from '../../src/narration/narrator.js';
import { createSkeleton } from '../../src/world/secrets.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { seedSessionRecord, recordedEvent } from '../helpers/sessionRecordSeed.js';

const RUN = JSON.parse(fs.readFileSync(path.resolve(__dirname,
  '../../test/ci/playwright/explorations/long-haul-live-20261126-184225/replay.json'), 'utf8'));
const VOW = 'Find who is raiding the Cinder Expanse lanes';
/** a3's plan, as the oath decided it. */
const A3_TRUTH = (() => {
  const reply = RUN.recording.exchanges.find(x => x.step === 'a3' && /callNarratorAPI>call$/.test(x.kind)).response.content.map(c => c.text ?? '').join('');
  return /"truth":\s*"([^"]+)"/.exec(reply)[1];
})();
const PLAN = { id: 'plan-vow-1', kind: 'vow', subject: { type: 'vow', id: 'vow-1', name: VOW }, truth: A3_TRUTH,
  wants: 'To steer the lanes', escalation: [], clues: [{ id: 'c1', text: 'two relay consoles disagree' }], resolutions: [] };

describe('the one behind a who-vow: one met, or a stranger shown first', () => {
  it('a3\'s plan names Dalen Voss, whom the story had not met', () => {
    expect(A3_TRUTH).toContain('Dalen Voss');
    expect(strangerNamedIn(A3_TRUTH, { people: ['Tamsin Okoro'], notNames: ['Hollow Spire', 'Bleakhold Station'] })).toBe('Dalen Voss');
    // Met, he is no stranger; a truth that names one of the story's people names none.
    expect(strangerNamedIn(A3_TRUTH, { people: ['Tamsin Okoro', 'Dalen Voss'] })).toBeNull();
    expect(strangerNamedIn('Tamsin keeps the raiders\' schedules in her ledger.', { people: ['Tamsin Okoro'] })).toBeNull();
    expect(strangerNamedIn('Someone in the Spire\'s administration steers the lanes.', { people: [] })).toBeNull();
  });

  it('DECIDE NOW lists the people met for a who-vow, and prefers them', () => {
    const block = formatUnrevealedBlock([], {
      planRequests: [{ ref: 'plan-nar-1-vow', kind: 'vow', trigger: 'vow', label: `what is really behind the vow "${VOW}"`, oracleSeeds: [] }],
      people: ['Tamsin Okoro', 'Vance Oduya'],
    });
    expect(block).toContain('Its truth names the one behind it — a person, by name: one of the people the story has met if one fits '
      + '(Tamsin Okoro, Vance Oduya), else a new name; a new one is shown in play, by name, before the truth is revealed.');
  });

  it('a decided who-plan that names a stranger is told to show them before the reveal; a met one is not', () => {
    const shown = formatUnrevealedBlock([PLAN], { strangers: { 'plan-vow-1': 'Dalen Voss' } });
    expect(shown).toContain('- Not yet in play: Dalen Voss. Before this truth is revealed, show Dalen Voss in the story — seen, met, or spoken of by name — as one of its clues.');
    expect(formatUnrevealedBlock([PLAN], { strangers: {} })).not.toContain('Not yet in play');
  });

  // Issue #397, Code fix 1: the line was printed only for a plan the world
  // snapshot does not hold — and the snapshot, on by default, held round 8's
  // vow plan in every one of its 67 narrations.
  it('with the world snapshot on, the plan it holds still carries the line', () => {
    const block = formatUnrevealedBlock([PLAN], { coveredIds: ['plan-vow-1'], strangers: { 'plan-vow-1': 'Dalen Voss' } });
    expect(block).toContain('### IN PLAY FOR THIS NARRATION');
    expect(block).toContain('Not yet in play: Dalen Voss. Before this truth is revealed, show Dalen Voss in the story — seen, met, or spoken of by name — as one of its clues.');
    expect(formatUnrevealedBlock([PLAN], { coveredIds: ['plan-vow-1'], strangers: {} })).not.toContain('Not yet in play');
  });

  // Issue #397, Code fix 1: round 8 drafted "The Man From the Berth" at a72,
  // and any shared word of three letters made the person "met" — "the".
  it('a pending draft is matched by its whole name; filler never makes anyone met', () => {
    expect(strangerNamedIn(A3_TRUTH, { people: ['Tamsin Okoro', 'The Man From the Berth'], exact: ['The Man From the Berth'] })).toBe('Dalen Voss');
    expect(strangerNamedIn(A3_TRUTH, { people: ['Man at the water tap'], exact: ['Man at the water tap'] })).toBe('Dalen Voss');
    // A pending "Station Clerk" is not met by a truth that only says "station".
    expect(strangerNamedIn('Dalen Voss steers the station\'s relays.', { people: ['Station Clerk'], exact: ['Station Clerk'] })).toBe('Dalen Voss');
    // A recorded name is still met by a word of it — never by its filler.
    expect(strangerNamedIn(A3_TRUTH, { people: ['Dalen Voss'] })).toBeNull();
    expect(strangerNamedIn('Voss steers the relays, and Dalen Voss hides it.', { people: ['Dalen Voss'] })).toBeNull();
    expect(strangerNamedIn(A3_TRUTH, { people: ['The Broker'] })).toBe('Dalen Voss');
    // A pending draft named in the truth whole is met.
    expect(strangerNamedIn('The man from the berth, Dalen Voss, steers the relays.', { people: ['The Man From the Berth'], exact: ['The Man From the Berth'] })).toBeNull();
  });
});

// Issue #397, Code fix 1: the unit tests above passed while the line was
// never told — the composition test rules/reachability.md asks for. Through
// the real prompt build, with the world snapshot on (the default).
describe('through a paced narration, with the world snapshot on', () => {
  const MODULE_ID = 'starforged-companion';
  const T = 1_800_000_000_000;
  const SIDECAR = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
  const reply = (text) => ({ content: [{ type: 'text', text }], usage: {}, stop_reason: 'end_turn' });
  let journals;

  beforeEach(async () => {
    vi.clearAllMocks();
    journals = installJournalMock();
    const at = (k, scene, when, opts = {}) => ({ ...recordedEvent('sess-3', k, { ...opts, at: when }), scene });
    await seedSessionRecord('sess-3', [
      at('session.begun', null, T, { d: { number: 3, table: {} } }),
      at('scene.started', 'sc-spire', T + 1_000, { d: { sceneId: 'sc-spire', reason: 'first', cause: 'first', what: 'the session begins',
        place: { id: 'act-spire', type: 'settlement', name: 'Hollow Spire' } } }),
    ], { number: 3 });
    game.settings._store.set(`${MODULE_ID}.worldSnapshot`, true);
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    game.actors._reset();
    // A recorded connection, and the PC sworn to the who-vow — the only vow in play, so its plan is the scene's.
    game.actors._set('npc-tamsin', makeTestActor({ id: 'npc-tamsin', name: 'Tamsin Okoro', type: 'character',
      flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-tamsin', name: 'Tamsin Okoro', active: true } } } }));
    const mira = makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' });
    const vow = { id: 'vow-1', name: VOW, type: 'progress', parent: mira, flags: { [MODULE_ID]: { vowId: 'vid-1' } },
      system: { subtype: 'vow', rank: 'dangerous', current: 4, completed: false } };
    mira.items.contents.push(vow);
    game.actors._set('pc-mira', mira);
    game.settings._store.set(`${MODULE_ID}.campaignState`, {
      currentSessionId: 'sess-3', sessionNumber: 3, currentSceneId: 'sc-spire', connectionIds: ['npc-tamsin'],
      sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-spire' },
      sceneFrame: { location: 'Tamsin\'s ledger stall, Hollow Spire docks', present: ['Mira Kestrel', 'Tamsin Okoro'], sceneId: 'sc-spire' },
    });
    // A pending draft whose name holds "the" — round 8's a72.
    game.messages = { contents: [{ id: 'card-a72', timestamp: T + 2_000, flags: { [MODULE_ID]: { draftEntityCard: true, drafts: [
      { index: 0, type: 'connection', name: 'The Man From the Berth', status: 'pending', description: 'A man from the berth hatch.' },
    ] } } }] };
    await createSkeleton({ kind: 'vow', subject: { type: 'vow', id: 'vid-1', name: VOW }, truth: A3_TRUTH,
      clues: ['two relay consoles disagree'], sceneId: 'sc-spire', sessionId: 'sess-3' }, { byGm: true });
    apiPost.mockImplementation(async (url, headers, body, opts) => reply(String(opts?.label ?? '').startsWith('narrator:narratePacedInput')
      ? `You ask, and Tamsin turns a page.${SIDECAR}` : opts?.label === 'obligationJudge' ? '{"violations":[]}' : 'Session 3.'));
  });
  afterEach(() => journals.restore());

  it('the plan the snapshot holds is named in play, with its stranger to show first', async () => {
    await narratePacedInput('I ask Tamsin who has been raiding the lanes.', game.settings.get(MODULE_ID, 'campaignState'), { speakerActorId: 'pc-mira' });
    const narration = apiPost.mock.calls.find(c => c[3]?.label === 'narrator:narratePacedInput')?.[2];
    expect(narration, 'the line was narrated').toBeTruthy();
    const system = narration.system.map(b => b.text).join('\n');
    expect(system, 'the snapshot holds the plan').toContain('### IN PLAY FOR THIS NARRATION');
    expect(system).toContain('Not yet in play: Dalen Voss. Before this truth is revealed, show Dalen Voss in the story');
  });
});
