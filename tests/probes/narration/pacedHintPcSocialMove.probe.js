// tests/probes/narration/pacedHintPcSocialMove.probe.js
//
// PROBE (eighth audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// NR HINT-PC-SOCIAL — the paced card's Roll button can offer a Compel against
// a fellow player character.
//
// What the user does: in a two-PC game, Kira types "Ren, tell me what you
// really saw in the vault." The classifier answers NARRATIVE_WITH_MOVE_AVAILABLE
// and nominates Gather Information; the narrator closes its prose with
// "*Pressing Ren for the truth here would be a Compel.*"
//
// What happens: narratePacedInput (src/narration/narrator.js) runs the finding-G
// guard, suppressPcDirectedSocialMove, on the CLASSIFIER's nomination only
// (Gather Information passes). After the narration it reconciles the button
// with the narrator's closing hint (reconcileSuggestedMove — the hint wins,
// finding J) and posts that move unchecked: the card offers "Roll Compel",
// whose click re-posts Kira's line with forcedMoveId "compel" — a Compel roll
// against Ren. Finding G (decisions.md "The Roll button reflects the
// narrator's prose"; narrator.js PC_DIRECTED_SOCIAL_MOVES): a social move is
// never suggested against a fellow PC — "suppress the nomination before it
// reaches … the card (so no Roll button appears)".
//
// What should happen: the reconciled move goes through the same guard — no
// Compel / relationship move on the button when the input names another PC.
// Control: the same reply when Kira addresses an NPC keeps "Roll Compel".

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../../src/api-proxy.js';
import { narratePacedInput } from '../../../src/narration/narrator.js';
import { invalidateActorCache } from '../../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';

function installPc(id, name) {
  const pc = makeTestActor({ id, type: 'character', name, hasPlayerOwner: true });
  game.actors._set(id, pc);
  invalidateActorCache(id);
}

const REPLY = 'Ren\'s jaw tightens; his eyes slide toward the hatch. *Pressing him for the truth here would be a Compel.*'
  + '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

beforeEach(() => {
  vi.clearAllMocks();
  apiPost.mockResolvedValue({ content: [{ type: 'text', text: REPLY }], usage: {}, stop_reason: 'end_turn' });
  ChatMessage._reset();
  game.actors._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, false);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 's1', sessionNumber: 1, currentSceneId: 'sc-1' });
  global.game.messages = { contents: [] };
  installPc('pc-kira', 'Kira Voss');
  installPc('pc-ren', 'Ren Tal');
});

const pacedCard = () => ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.pacedNarrative);

describe('no Roll button offers a social move against a fellow PC', () => {
  it("the narrator's Compel hint does not reach the button when the input names another PC", async () => {
    await narratePacedInput('Ren, tell me what you really saw in the vault.',
      game.settings.get(MODULE_ID, 'campaignState'), { suggestedMove: 'gather_information', speakerActorId: 'pc-kira' });
    const card = pacedCard();
    expect(card).toBeDefined();
    expect(card.flags[MODULE_ID].suggestedMove).not.toBe('compel');
    expect(card.content).not.toContain('Roll Compel');
  });

  it('control: addressing an NPC, the hint still wins (finding J)', async () => {
    await narratePacedInput('I lean on the dock official about the manifest.',
      game.settings.get(MODULE_ID, 'campaignState'), { suggestedMove: 'gather_information', speakerActorId: 'pc-kira' });
    expect(pacedCard().flags[MODULE_ID].suggestedMove).toBe('compel');
  });
});
