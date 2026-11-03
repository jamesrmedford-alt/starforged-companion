/**
 * PROBE — FC-14 TRUTH-SET-OVER-STRIKE
 * (src/factContinuity/chatCommands.js `!truth set` → ledgers.js setTruth;
 *  retractions.js sessionRetractedFacts / isNamedStrike)
 *
 * What the user does: the GM strikes "Vance — is dead" (the narrator killed
 * him by mistake). Later someone re-establishes it with `!truth set Vance is
 * dead` — the GM changing their mind, or a player.
 *
 * What happens: setTruth appends a new binding truth and leaves the strike
 * as it was: a bare strike (no correctedTo), which sessionRetractedFacts keeps
 * naming under CORRECTED for the rest of the session (and rememberSession-
 * Retractions carries past the scene). Every prompt now holds both
 *   TRUTHS:     Vance — is dead
 *   CORRECTED (retracted by the table — do NOT re-assert these…): Vance — is dead
 * and the consistency check audits the prose against both. A PLAYER's
 * `!truth set` does the same over the GM's strike: the command takes no
 * account of the strike, though a player may not strike a GM-asserted truth
 * (canCorrectTruth) and rules/narrator-memory.md 6b names only the GM's
 * `!truth set` as bypassing a strike.
 *
 * What should happen: re-asserting a struck fact lifts the strike (as a
 * Replace does — `correctedTo`), so the prompt says one thing; and a
 * player's `!truth set` does not overturn a GM's strike.
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { applyFactContinuityCommand } from '../../../src/factContinuity/chatCommands.js';
import { buildLedgerBlock } from '../../../src/narration/narratorPrompt.js';

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

describe('`!truth set` of a struck fact', () => {
  it('control: the GM\'s strike is named under CORRECTED', () => {
    expect(buildLedgerBlock(stored(), {}).corrections).toMatch(/Vance — is dead/);
  });

  it('the GM re-establishing it leaves one instruction, not "binding" and "do NOT re-assert" together', async () => {
    await applyFactContinuityCommand({ text: '!truth set Vance is dead' }, { requesterIsGM: true });
    const block = buildLedgerBlock(stored(), {});
    const binding = /Vance — is dead/.test(block.truths);
    const struck  = /Vance — is dead/.test(block.corrections);
    // Today: { binding: true, struck: true }.
    expect(binding && struck).toBe(false);
  });

  it("a player's `!truth set` does not overturn the GM's strike", async () => {
    await applyFactContinuityCommand({ text: '!truth set Vance is dead' }, { requesterIsGM: false });
    // Today: "Truth recorded" — a new binding truth, asserter "player", beside the GM's strike.
    expect(buildLedgerBlock(stored(), {}).truths).not.toMatch(/Vance — is dead/);
  });
});
