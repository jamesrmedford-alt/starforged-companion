import { describe, it, expect, beforeEach } from 'vitest';
import { collectWorldUnits, renderWorldSnapshot } from '../../../src/narration/worldSnapshot.js';
import { mintSession } from '../../../src/session/lifecycle.js';
import { pickBeatShape } from '../../../src/narration/proseVariety.js';

describe('explore2', () => {
  it('session 0', () => {
    // a world opened to prepare: a session nobody began, with a summary, then the mint
    const cs = { currentSessionId: 'prep', sessionNumber: 1, sessionActive: false, sessionStartedId: null, sessionEndedId: null,
      sessionSummary: { sessionId: 'prep', text: 'Kira studied the charts of the Devil\'s Maw.' }, previousSessionSummary: null };
    mintSession(cs);
    console.log(JSON.stringify(cs.previousSessionSummary), cs.sessionNumber);
    const units = collectWorldUnits(cs, {});
    console.log(JSON.stringify(units, null, 1));
    console.log(renderWorldSnapshot(units).text);
    for (let i = 0; i < 12; i++) console.log(i, pickBeatShape({ beatIndex: i, seed: 's-1' }).id);
  });
});
