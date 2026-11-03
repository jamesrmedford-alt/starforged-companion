/**
 * STARFORGED COMPANION
 * tests/unit/pacedHintMove.test.js
 *
 * Issue #325 W36, two defects in the paced card's Roll button:
 *
 * - extractMoveFromNarrationHint tested every move name, longest first, as a
 *   case-insensitive whole phrase: "*Binding that wound before the battle
 *   could be a Heal.*" made the button "Roll Battle" (a combat move, outside
 *   any fight); "repair" vs "battle" the same. The move the hint invites is
 *   now the one written as a move (capitalised, not just opening a sentence),
 *   else the last one named.
 * - narratePacedInput ran suppressPcDirectedSocialMove on the classifier's
 *   nomination only, then reconciled the button with the hint unchecked:
 *   "*Pressing Ren for the truth would be a Compel.*" offered a Compel against
 *   a fellow PC (finding G). The reconciled move passes the same guard.
 *
 * Converted from the audit probes narration/hintCommonNounMove and
 * narration/pacedHintPcSocialMove.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { extractMoveFromNarrationHint, reconcileSuggestedMove, narratePacedInput } from '../../src/narration/narrator.js';
import { invalidateActorCache } from '../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';

describe('the Roll button is the move the hint invites', () => {
  it('"…before the battle could be a Heal." is Heal, not Battle', () => {
    const text = 'You press the gauze into the cut. *Binding that wound before the battle could be a Heal.*';
    expect(extractMoveFromNarrationHint(text)).toBe('heal');
    expect(reconcileSuggestedMove(text, 'heal')).toBe('heal');
  });

  it('"…before the next battle would be a Repair." is Repair, not Battle', () => {
    const text = 'The hull plate rattles loose. *Patching it before the next battle would be a Repair.*';
    expect(extractMoveFromNarrationHint(text)).toBe('repair');
  });

  it('a move written as a move wins over a lowercase noun named after it', () => {
    expect(extractMoveFromNarrationHint('*A Strike now could end the battle.*')).toBe('strike');
  });

  it('a capital that only opens the sentence is not "written as a move"', () => {
    expect(extractMoveFromNarrationHint('*Battle lines drawn, this could be a Clash.*')).toBe('clash');
    expect(extractMoveFromNarrationHint('*Battle-weary as you are, you could still face danger here.*')).toBe('face_danger');
  });

  it('control: a hint that names only the move reads correctly', () => {
    expect(extractMoveFromNarrationHint('The gauze is ready. *This could be a Heal.*')).toBe('heal');
    expect(extractMoveFromNarrationHint('*Strike while the guard looks away.*')).toBe('strike');
  });
});

describe('no Roll button offers a social move against a fellow PC', () => {
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

  it("the narrator's Compel hint does not reach the button when the input names another PC — the nomination stands", async () => {
    await narratePacedInput('Ren, tell me what you really saw in the vault.',
      game.settings.get(MODULE_ID, 'campaignState'), { suggestedMove: 'gather_information', speakerActorId: 'pc-kira' });
    const card = pacedCard();
    expect(card).toBeDefined();
    expect(card.flags[MODULE_ID].suggestedMove).toBe('gather_information');
    expect(card.content).not.toContain('Roll Compel');
  });

  it('control: addressing an NPC, the hint still wins (finding J)', async () => {
    await narratePacedInput('I lean on the dock official about the manifest.',
      game.settings.get(MODULE_ID, 'campaignState'), { suggestedMove: 'gather_information', speakerActorId: 'pc-kira' });
    expect(pacedCard().flags[MODULE_ID].suggestedMove).toBe('compel');
  });

  it('reconcileSuggestedMove guards the hint when told the input', () => {
    const text = '*Pressing Ren for the truth here would be a Compel.*';
    const pcs = [{ name: 'Kira Voss' }, { name: 'Ren Tal' }];
    expect(reconcileSuggestedMove(text, 'gather_information',
      { playerText: 'Ren, what did you see?', speakerName: 'Kira Voss', pcActors: pcs })).toBe('gather_information');
    expect(reconcileSuggestedMove(text, 'gather_information',
      { playerText: 'Tell me, official.', speakerName: 'Kira Voss', pcActors: pcs })).toBe('compel');
  });
});
