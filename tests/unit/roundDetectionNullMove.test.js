/* global makeTestActor, structuredClone -- tests/setup.js and Node globals, as in tests/unit */
/**
 * ROUND-DETECTION-NULL-MOVE (found while fixing issue #342; pre-existing) — a
 * Batch Mode round's detection prompt says what was rolled, and for a round
 * in which nothing was, says so as paced narration's does.
 *
 * A round's capture is one detection call (runRoundNarrationPasses), which
 * names one lead move: the first Make a Connection hit, else the first rolled
 * move, else the first captured entry. A round of actions with no roll — or
 * of moves the roll stage refused, narrated as actions with no roll — led
 * with an entry that has no rolled move, and its prompt read "Move: null."
 * and "Outcome: null." (or a refused move's id, with "Outcome: null."). It
 * now takes the paced path's sentinel — "(paced narration — no move was
 * rolled)", no Outcome line — the line every narration with no roll gets.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});
vi.mock('../../src/multiplayer/gmGate.js', async (importOriginal) => ({
  ...(await importOriginal()), isCanonicalGM: vi.fn(() => true),
}));
// The real detection pass builds its prompt and calls Claude (apiPost); only
// what its results are routed to is stubbed.
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routeWorldJournalResults:    vi.fn(async () => {}),
  routeEntityDrafts:           vi.fn(async () => ({ created: [], queued: [] })),
  applyEntityRenames:          vi.fn(async () => {}),
  appendGenerativeTierUpdates: vi.fn(async () => []),
}));

import { apiPost } from '../../src/api-proxy.js';
import { narrateRound, runPacedDetection } from '../../src/narration/narrator.js';
import { invalidateActorCache } from '../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';
const DETECTION_SYSTEM = 'Return only the JSON object — no prose.';
const PROSE = 'Kira slips through the hatch while Ren keeps the corridor covered.';
const DETECTION = '{"entities":[],"renames":[],"worldJournal":{"lore":[],"threats":[],"factionUpdates":[],"locationUpdates":[],"stateTransitions":[]}}';
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });
const CS = { currentSessionId: 's1', sessionNumber: 1, currentSceneId: 'sc-1' };

const narrative = () => ({ kind: 'narrative' });
const refusedFaceDanger = () => ({ kind: 'refused', moveId: 'face_danger', moveName: 'Face Danger', reason: 'The track it named was deleted or finished before the roll.' });
const compelWeak = () => ({
  kind: 'move', moveId: 'compel', moveName: 'Compel', statUsed: 'heart', outcome: 'weak_hit', outcomeLabel: 'Weak Hit',
  relevance: { resolvedClass: 'interaction', entityIds: [], entityTypes: [] }, resolutionId: 'res-k',
});

function roundOf(kira, ren) {
  return {
    id: 'round-5', number: 5, phase: 'narrating', acting: ['pl-1', 'pl-2'],
    entries: {
      'pl-1': { userId: 'pl-1', actorId: 'pc-kira', actorName: 'Kira', text: 'I slip through the hatch.', rolled: { narrationInput: kira } },
      'pl-2': { userId: 'pl-2', actorId: 'pc-ren',  actorName: 'Ren',  text: 'I keep the corridor covered.', rolled: { narrationInput: ren } },
    },
  };
}

function installPc(id, name) {
  game.actors._set(id, makeTestActor({ id, type: 'character', name, hasPlayerOwner: true }));
  invalidateActorCache(id);
}

const detectionPrompts = () => apiPost.mock.calls
  .filter(([, , body]) => body?.system?.[0]?.text === DETECTION_SYSTEM)
  .map(([, , body]) => String(body.messages?.[0]?.content ?? ''));
// The prompt's move/outcome framing: the lines between its first line and its first blank one.
const framing = (prompt) => prompt.split('\n\n')[0].split('\n').slice(1);

async function narrate(round) {
  const res = await narrateRound({ round, campaignState: structuredClone(CS) });
  await vi.advanceTimersByTimeAsync(3000);   // the round's detection runs ~2 s after its card
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  apiPost.mockImplementation(async (_url, _headers, body) => reply(
    body?.system?.[0]?.text === DETECTION_SYSTEM ? DETECTION : `${PROSE}\n\`\`\`json\n{"newTruths":[],"stateChanges":[]}\n\`\`\``,
  ));
  game.actors._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, false);
  game.settings._store.set(`${MODULE_ID}.campaignState`, structuredClone(CS));
  global.game.messages = { contents: [], get: () => null };
  ChatMessage._reset();
  installPc('pc-kira', 'Kira');
  installPc('pc-ren', 'Ren');
});
afterEach(() => { vi.useRealTimers(); });

describe('ROUND-DETECTION-NULL-MOVE — the detection prompt of a round with no roll', () => {
  it('two actions with no roll: the prompt says no move was rolled, as paced narration\'s does — not "Move: null."', async () => {
    const res = await narrate(roundOf(narrative(), narrative()));
    expect(res.posted).toBe('card');
    const [prompt] = detectionPrompts();
    expect(prompt).toBeTruthy();                                       // control: the round's capture ran
    expect(prompt).not.toContain('Move: null.');                       // was: "Move: null."
    expect(prompt).not.toMatch(/^Outcome:/m);                          // was: "Outcome: null."
    expect(framing(prompt)).toEqual(['Move: (paced narration — no move was rolled).']);

    // The same line the paced path's detection prompt has for a line with no move.
    apiPost.mockClear();
    await runPacedDetection(PROSE, structuredClone(CS));
    expect(framing(detectionPrompts()[0])).toEqual(framing(prompt));
  });

  it('a move the roll stage refused beside an action with no roll: nothing was rolled, so neither its id nor an outcome is named', async () => {
    await narrate(roundOf(refusedFaceDanger(), narrative()));
    const [prompt] = detectionPrompts();
    expect(prompt).not.toContain('Move: face_danger.');                 // was: the refused move's id…
    expect(prompt).not.toMatch(/^Outcome:/m);                          // …with "Outcome: null."
    expect(framing(prompt)).toEqual(['Move: (paced narration — no move was rolled).']);
  });

  it('control: a round with a rolled move names it and its outcome, whatever the confirm order', async () => {
    await narrate(roundOf(narrative(), compelWeak()));
    const [prompt] = detectionPrompts();
    expect(framing(prompt)).toEqual(['Move: compel.', 'Outcome: weak_hit.']);
  });
});
