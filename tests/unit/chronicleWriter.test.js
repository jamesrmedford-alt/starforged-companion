// tests/unit/chronicleWriter.test.js
// Coverage for src/character/chronicleWriter.js. The Haiku call is mocked
// at the apiPost boundary; the chronicle write target is mocked at the
// addChronicleEntry export so we can verify the per-actor write without
// dragging in JournalEntry mechanics.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(),
}));

vi.mock('../../src/character/chronicle.js', () => ({
  addChronicleEntry: vi.fn(async () => {}),
}));

import { apiPost } from '../../src/api-proxy.js';
import { addChronicleEntry } from '../../src/character/chronicle.js';
import {
  writeChronicleEntry,
  scheduleChronicleEntry,
} from '../../src/character/chronicleWriter.js';

const MODULE_ID = 'starforged-companion';

function makeApiResponse(parsed) {
  return { content: [{ type: 'text', text: JSON.stringify(parsed) }] };
}

const BASE_STATE = {
  currentSessionId: 'session-1',
  sessionNumber:    1,
  characterIds:     ['actor-1'],
};

beforeEach(() => {
  apiPost.mockReset();
  addChronicleEntry.mockReset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, true);
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`,       'sk-ant-test');
  game.user.isGM = true;
  game.actors._reset();
});

afterEach(() => {
  game.user.isGM = true;
  game.actors._reset();
});


// ---------------------------------------------------------------------------
// writeChronicleEntry — synchronous path used by tests + future awaiters
// ---------------------------------------------------------------------------

describe('writeChronicleEntry()', () => {
  it('writes the parsed entry to the first PC in characterIds', async () => {
    apiPost.mockResolvedValue(makeApiResponse({
      type: 'revelation',
      text: 'Chen named Officer Markus Venn — Internal Affairs has been watching.',
    }));

    const entry = await writeChronicleEntry({
      narrationText: 'Chen finally answered. "Officer Markus Venn from Internal Affairs."',
      campaignState: BASE_STATE,
      moveId:        'gather_information',
      outcome:       'strong_hit',
      kind:          'move',
    });

    expect(entry).toEqual({
      type:      'revelation',
      text:      'Chen named Officer Markus Venn — Internal Affairs has been watching.',
      moveId:    'gather_information',
      sessionId: 'session-1',
      automated: true,
    });
    expect(addChronicleEntry).toHaveBeenCalledTimes(1);
    expect(addChronicleEntry.mock.calls[0][0]).toBe('actor-1');
  });

  it('returns null and skips API call when chronicleAutoEntry is disabled', async () => {
    game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, false);

    const entry = await writeChronicleEntry({
      narrationText: 'some prose',
      campaignState: BASE_STATE,
      kind:          'paced',
    });

    expect(entry).toBeNull();
    expect(apiPost).not.toHaveBeenCalled();
    expect(addChronicleEntry).not.toHaveBeenCalled();
  });

  it('returns null when the current client is not the GM', async () => {
    game.user.isGM = false;

    const entry = await writeChronicleEntry({
      narrationText: 'some prose',
      campaignState: BASE_STATE,
      kind:          'paced',
    });

    expect(entry).toBeNull();
    expect(apiPost).not.toHaveBeenCalled();
    expect(addChronicleEntry).not.toHaveBeenCalled();
  });

  it('returns null when there are no PCs in characterIds and no player Actors exist', async () => {
    const entry = await writeChronicleEntry({
      narrationText: 'some prose',
      campaignState: { ...BASE_STATE, characterIds: [] },
      kind:          'paced',
    });

    expect(entry).toBeNull();
    expect(apiPost).not.toHaveBeenCalled();
  });

  // Regression for v1.2.10 → v1.2.12: campaignState.characterIds is never
  // populated by the module, so the writer must fall back to actorBridge to
  // pick a PC. Without this fallback, chronicle auto-entry never fires and
  // !recap never has anything to summarise.
  it('falls back to the first player-owned character Actor when characterIds is empty', async () => {
    const pc = makeTestActor({ id: 'pc-fallback-1', name: 'Kira' });
    pc.hasPlayerOwner = true;
    game.actors._set(pc.id, pc);

    apiPost.mockResolvedValue(makeApiResponse({
      type: 'discovery',
      text: 'Kira found the wreck.',
    }));

    const entry = await writeChronicleEntry({
      narrationText: 'You crest the ridge and see the wreck.',
      campaignState: { ...BASE_STATE, characterIds: [] },
      moveId:        'undertake_an_expedition',
      outcome:       'strong_hit',
      kind:          'move',
    });

    expect(entry).not.toBeNull();
    expect(addChronicleEntry).toHaveBeenCalledTimes(1);
    expect(addChronicleEntry.mock.calls[0][0]).toBe('pc-fallback-1');
  });

  it('ignores non-character Actors when falling back', async () => {
    // No character-type actor exists; only an NPC and a starship. Even with
    // the solo-GM fallback in getPlayerActors(), the writer must NOT pick
    // these up — the chronicle is a PC-only construct.
    const npc      = makeTestActor({ id: 'npc-1',  type: 'npc',      name: 'Vex' });
    const starship = makeTestActor({ id: 'ship-1', type: 'starship', name: 'Resolute' });
    game.actors._set(npc.id, npc);
    game.actors._set(starship.id, starship);

    const entry = await writeChronicleEntry({
      narrationText: 'prose',
      campaignState: { ...BASE_STATE, characterIds: [] },
      kind:          'paced',
    });

    expect(entry).toBeNull();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('returns null when no API key is configured', async () => {
    game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);

    const entry = await writeChronicleEntry({
      narrationText: 'some prose',
      campaignState: BASE_STATE,
      kind:          'paced',
    });

    expect(entry).toBeNull();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('returns null when the narration text is empty', async () => {
    const entry = await writeChronicleEntry({
      narrationText: '   ',
      campaignState: BASE_STATE,
      kind:          'move',
    });

    expect(entry).toBeNull();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('falls back to "moment" when the model returns an unknown type', async () => {
    apiPost.mockResolvedValue(makeApiResponse({
      type: 'gibberish',
      text: 'Something shifted in the bay.',
    }));

    const entry = await writeChronicleEntry({
      narrationText: 'prose',
      campaignState: BASE_STATE,
      kind:          'paced',
    });

    expect(entry?.type).toBe('moment');
    expect(entry?.text).toBe('Something shifted in the bay.');
  });

  it('returns null when the model returns unparseable text', async () => {
    apiPost.mockResolvedValue({
      content: [{ type: 'text', text: 'not json at all' }],
    });

    const entry = await writeChronicleEntry({
      narrationText: 'prose',
      campaignState: BASE_STATE,
      kind:          'move',
    });

    expect(entry).toBeNull();
    expect(addChronicleEntry).not.toHaveBeenCalled();
  });

  it('strips JSON markdown fences from the model response', async () => {
    apiPost.mockResolvedValue({
      content: [{ type: 'text', text: '```json\n{"type":"moment","text":"Beat."}\n```' }],
    });

    const entry = await writeChronicleEntry({
      narrationText: 'prose',
      campaignState: BASE_STATE,
      kind:          'paced',
    });

    expect(entry?.text).toBe('Beat.');
  });

  it('passes the move context block when kind is "move"', async () => {
    apiPost.mockResolvedValue(makeApiResponse({
      type: 'scar', text: 'Took a hit threading the debris field.',
    }));

    await writeChronicleEntry({
      narrationText: 'prose',
      campaignState: BASE_STATE,
      moveId:        'face_danger',
      outcome:       'miss',
      kind:          'move',
    });

    const body = apiPost.mock.calls[0][2];
    const userMessage = body.messages[0].content;
    expect(userMessage).toContain('Move: face_danger');
    expect(userMessage).toContain('Outcome: miss');
  });

  it('passes the paced-narration context block when kind is "paced"', async () => {
    apiPost.mockResolvedValue(makeApiResponse({
      type: 'moment', text: 'Chen folded the napkin in half.',
    }));

    await writeChronicleEntry({
      narrationText: 'prose',
      campaignState: BASE_STATE,
      kind:          'paced',
    });

    const body = apiPost.mock.calls[0][2];
    const userMessage = body.messages[0].content;
    expect(userMessage).toContain('paced narration — no move was rolled');
    expect(userMessage).not.toContain('Move:');
  });

  it('marks the entry as automated and stamps the sessionId + moveId', async () => {
    apiPost.mockResolvedValue(makeApiResponse({
      type: 'discovery', text: 'A signal in the dark — origin unclear.',
    }));

    await writeChronicleEntry({
      narrationText: 'prose',
      campaignState: BASE_STATE,
      moveId:        'gather_information',
      outcome:       'weak_hit',
      kind:          'move',
    });

    const entry = addChronicleEntry.mock.calls[0][1];
    expect(entry.automated).toBe(true);
    expect(entry.sessionId).toBe('session-1');
    expect(entry.moveId).toBe('gather_information');
  });
});


// ---------------------------------------------------------------------------
// scheduleChronicleEntry — fire-and-forget wrapper
// ---------------------------------------------------------------------------

describe('scheduleChronicleEntry()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call the API synchronously', () => {
    apiPost.mockResolvedValue(makeApiResponse({
      type: 'moment', text: 'Beat.',
    }));

    scheduleChronicleEntry({
      narrationText: 'prose',
      campaignState: BASE_STATE,
      kind:          'paced',
    });

    expect(apiPost).not.toHaveBeenCalled();
  });

  it('schedules the API call after the async delay', async () => {
    apiPost.mockResolvedValue(makeApiResponse({
      type: 'moment', text: 'Beat.',
    }));

    scheduleChronicleEntry({
      narrationText: 'prose',
      campaignState: BASE_STATE,
      kind:          'paced',
    });

    await vi.runAllTimersAsync();
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(addChronicleEntry).toHaveBeenCalledTimes(1);
  });

  it('skips the scheduled work when chronicleAutoEntry is disabled', async () => {
    game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, false);

    scheduleChronicleEntry({
      narrationText: 'prose',
      campaignState: BASE_STATE,
      kind:          'paced',
    });

    await vi.runAllTimersAsync();
    expect(apiPost).not.toHaveBeenCalled();
  });
});
