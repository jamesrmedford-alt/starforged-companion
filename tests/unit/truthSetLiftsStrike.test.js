// tests/unit/truthSetLiftsStrike.test.js
// Re-establishing a struck fact with `!truth set` lifts the strike (issue
// #326 W60). setTruth appended a new truth beside the strike, so the prompt
// carried "TRUTHS: Vance — is dead" and "CORRECTED … do NOT re-assert:
// Vance — is dead" together for the rest of the session; and a player's
// `!truth set` did the same over a GM's strike, though a player may not
// strike a GM truth. A set matching a bare strike now links it (as Replace
// does); a player's set over a GM's strike is refused.

import { describe, it, expect, beforeEach } from 'vitest';
import { applyFactContinuityCommand } from '../../src/factContinuity/chatCommands.js';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings.get(MODULE_ID, 'campaignState');

beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-2', sessionNumber: 2, currentSceneId: 'sc-1',
    sceneTruths: [{
      id: 'tr-dead0001', subject: { kind: 'text', text: 'Vance' }, fact: 'is dead',
      sessionId: 'sess-2', sessionNum: 2, sceneId: 'sc-1', moveId: null, source: 'narrator_sidecar',
      asserter: 'narrator', createdAt: 1,
      retracted: true, retractedBy: 'gm', retractedAt: 2, correctedTo: null, migratedTo: null,
    }],
    sceneState: { bySubject: {}, sceneId: 'sc-1' },
  });
});

describe('`!truth set` of a struck fact (issue #326 W60)', () => {
  it('control: the GM\'s strike is named under CORRECTED', () => {
    expect(buildLedgerBlock(stored(), {}).corrections).toMatch(/Vance — is dead/);
  });

  it('the GM re-establishing it leaves one instruction, not "binding" and "do NOT re-assert" together', async () => {
    await applyFactContinuityCommand({ text: '!truth set Vance is dead' }, { requesterIsGM: true });
    const block = buildLedgerBlock(stored(), {});
    const binding = /Vance — is dead/.test(block.truths);
    const struck  = /Vance — is dead/.test(block.corrections);
    // Both used to be present: { binding: true, struck: true }.
    expect({ binding, struck }).toEqual({ binding: true, struck: false });
    expect(ChatMessage._created.at(-1).content).toMatch(/strike on it is lifted/);
  });

  it("a player's `!truth set` does not overturn the GM's strike", async () => {
    await applyFactContinuityCommand({ text: '!truth set Vance is dead' }, { requesterIsGM: false });
    // It was "Truth recorded" — a new binding truth, asserter "player", beside the GM's strike.
    expect(buildLedgerBlock(stored(), {}).truths).not.toMatch(/Vance — is dead/);
    expect(buildLedgerBlock(stored(), {}).corrections).toMatch(/Vance — is dead/);
    expect(ChatMessage._created.at(-1).content).toMatch(/only a GM can restore it/);
  });
  it("the lifted strike survives the ledger merge onto the stored scene", async () => {
    await applyFactContinuityCommand({ text: '!truth set Vance is dead' }, { requesterIsGM: true });
    const struck = stored().sceneTruths.find(t => t.id === 'tr-dead0001');
    expect(struck.correctedTo).toBeTruthy();
    expect(stored().sceneTruths.find(t => t.id === struck.correctedTo)).toMatchObject({ fact: 'is dead', retracted: false });
  });

  it("a player's set over a player's strike lifts it", async () => {
    const t = stored().sceneTruths[0];
    t.asserter = 'player'; t.retractedBy = 'player';
    await applyFactContinuityCommand({ text: '!truth set Vance is dead' }, { requesterIsGM: false });
    const block = buildLedgerBlock(stored(), {});
    expect(block.truths).toMatch(/Vance — is dead/);
    expect(block.corrections).not.toMatch(/Vance — is dead/);
  });

  it("control: a set of a different fact leaves the strike in place", async () => {
    await applyFactContinuityCommand({ text: '!truth set Vance is wounded' }, { requesterIsGM: true });
    expect(buildLedgerBlock(stored(), {}).corrections).toMatch(/Vance — is dead/);
  });
});
