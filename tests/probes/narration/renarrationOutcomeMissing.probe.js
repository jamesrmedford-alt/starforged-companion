// tests/probes/narration/renarrationOutcomeMissing.probe.js
//
// PROBE (eighth audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// NR RENARRATE-NO-OUTCOME — the narrator is never told what a Burn Momentum or
// Improve Result upgrade turned the move into.
//
// What the user does: a weak-hit Heal card offers 🔥 Burn Momentum (or an
// asset's Improve Result); the player clicks it. The move card is rewritten to
// the strong hit and the narrator re-narrates the upgraded outcome.
//
// What happens: the re-narration's user message carries no MOVE OUTCOME
// section. buildNarratorUserMessage (src/narration/narratorPrompt.js) renders
// the move and its outcome only from `resolution.loremasterContext`, which
// only resolver.resolveMove builds. buildBurnedResolution
// (src/moves/burnMomentum.js) and buildImprovedResolution
// (src/moves/improveResult.js) build their resolution by hand without it, and
// their playerNarration is a marker ("[Player burned momentum to upgrade the
// outcome]"). The burned move's own narration — the only prose that said what
// the move was — is superseded (left out of RECENT SCENE) before the
// re-narration is built. So the narrator is asked to "narrate the consequence"
// of a move it is never named, with an outcome it is never told.
//
// What should happen: the upgraded narration's request names the move and the
// upgraded outcome (Heal → Strong Hit), as every pipeline narration's does.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../../src/api-proxy.js';
import { narrateResolution } from '../../../src/narration/narrator.js';
import { applyBurnFromRelay, registerBurnMomentumHook } from '../../../src/moves/burnMomentum.js';
import { applyImproveFromRelay, registerImproveResultHook } from '../../../src/moves/improveResult.js';
import { invalidateActorCache } from '../../../src/character/actorBridge.js';
import { resolveMove } from '../../../src/moves/resolver.js';

const MODULE_ID = 'starforged-companion';
const GM_CTX = { requesterId: 'test-user-gm', requester: { id: 'test-user-gm', isGM: true }, requesterIsGM: true, local: true };
const ORIGINAL = { momentumChange: 0, healthChange: 1, spiritChange: 0, supplyChange: 0 };

function installPc(id, name) {
  const pc = makeTestActor({
    id, type: 'character', name, hasPlayerOwner: true,
    system: { momentum: { value: 8, max: 10, min: -6, resetValue: 2 }, health: { value: 3 } },
  });
  game.actors._set(id, pc);
  invalidateActorCache(id);
  return pc;
}

function makeCard(id, moduleFlags) {
  const msg = makeTestMessage({ content: '<div class="sf-move-card"></div>', flags: { [MODULE_ID]: moduleFlags } });
  msg.id = id;
  game.messages = { contents: [msg], get: (mid) => (mid === id ? msg : null) };
  return msg;
}

/** The narrator's reply: prose plus an empty sidecar. */
function narratorReply() {
  return {
    content: [{ type: 'text', text: 'The salve bites, then cools.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' }],
    usage: { input_tokens: 10, output_tokens: 10 },
    stop_reason: 'end_turn',
  };
}

/** The user message of the (only) narration request. */
function narrationUserMessage() {
  const calls = apiPost.mock.calls.filter(([, , body]) => Array.isArray(body?.system));
  expect(calls).toHaveLength(1);
  return String(calls[0][2].messages[0].content);
}

beforeEach(() => {
  vi.clearAllMocks();
  apiPost.mockImplementation(async () => narratorReply());
  game.actors._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, false);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 's1', sessionNumber: 1, currentSceneId: 'sc-1' });
  ChatMessage._reset();
  registerBurnMomentumHook({ narrate: narrateResolution, persist: vi.fn(async () => {}) });
  registerImproveResultHook({ narrate: narrateResolution, persist: vi.fn(async () => {}) });
  installPc('pc-kira', 'Kira');
});

describe('an upgraded result is narrated knowing what it upgraded to', () => {
  it('Burn Momentum: the re-narration names the move and its upgraded outcome', async () => {
    makeCard('m-burn', {
      burn: {
        canBurn: true, challengeDice: [2, 6], momentum: 8, outcomeMomentum: 0, markedImpactCount: 0,
        moveId: 'heal', originalOutcome: 'weak_hit',
        originalConsequences: ORIGINAL, previewOutcome: 'strong_hit',
        originalApplied: true, actorId: 'pc-kira', resolutionId: null, ptpReversals: null,
      },
    });

    expect(await applyBurnFromRelay({ messageId: 'm-burn' }, GM_CTX)).toEqual({ applied: true });

    const user = narrationUserMessage();
    expect(user).toMatch(/heal/i);            // which move this is
    expect(user).toMatch(/strong hit/i);      // what it now is
  });

  it('Improve Result: the re-narration names the move and its upgraded outcome', async () => {
    makeCard('m-imp', {
      improve: {
        canImprove: true, improveTo: 'strong_hit', moveId: 'heal', isMatch: false,
        originalOutcome: 'weak_hit', originalConsequences: ORIGINAL, originalApplied: true,
        actorId: 'pc-kira', resolutionId: null, assetId: null, abilityIndex: null,
        assetName: 'Fugitive', abilityName: '', hasClock: false, clockMax: 4, consumed: false,
      },
    });

    expect(await applyImproveFromRelay({ messageId: 'm-imp' }, GM_CTX)).toEqual({ applied: true });

    const user = narrationUserMessage();
    expect(user).toMatch(/heal/i);
    expect(user).toMatch(/strong hit/i);
  });

  it('control: a pipeline resolution (resolveMove) carries its move and outcome into the request', async () => {
    const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.15).mockReturnValueOnce(0.25).mockReturnValueOnce(0.9);
    const resolution = resolveMove(
      { moveId: 'heal', statUsed: 'iron', statValue: 3, adds: 0, playerNarration: 'I bind the wound.' },
      { currentSessionId: 's1' },
      { momentum: 2 },
    );
    dice.mockRestore();
    await narrateResolution(resolution, game.settings.get(MODULE_ID, 'campaignState'), { speakerActorId: 'pc-kira' });
    const user = narrationUserMessage();
    expect(user).toContain('## MOVE OUTCOME');
    expect(user).toMatch(/\[OUTCOME: /);
  });
});
