/**
 * PROBE — VENDOR-MOVE-CARD-NARRATED (eighth audit, area index-commands-hooks)
 *
 * What the user does: during a session, a player opens the Moves tab of their
 * foundry-ironsworn character sheet (or the Starforged moves sidebar) and
 * clicks a move's "Send to chat" icon (btn-sendmovetochat.vue) to show the
 * table the rules for Face Danger.
 *
 * What happens: the system posts the move's rules card with
 * `ChatMessage.create({ speaker: ChatMessage.getSpeaker(), content })`
 * (vendor src/module/chat/sf-move-chat-message.ts:22) — no flags, no rolls,
 * no whisper, default style. `isPlayerNarration` (src/index.js ~2647) rejects
 * only EMOTE / whispers / rolls / module flags / foundry-ironsworn flags /
 * the "Ironsworn" alias / short or `\` `@` `/` `!` text, so the
 * `<article class='ironsworn-message'>…` HTML passes as player narration. The
 * canonical GM's createChatMessage pipeline then runs the pacing classifier
 * and the move interpreter on the move's own rules text ("When you attempt
 * something risky … roll"), and a Face Danger roll is resolved for the
 * player who only shared a reference card (or, on a NARRATIVE decision, the
 * narrator narrates the HTML — the "you speak the HTML aloud" class the
 * module-flag check was written to stop).
 *
 * What should happen: a system reference card is not narration — no pacing
 * call, no interpretation, no roll.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/commands/vendorMoveCardNarrated.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// The pipeline past the classifier: Face Danger +edge, confirmed.
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'test', mischiefApplied: false,
  })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';
import { isPlayerNarration } from '../../../src/index.js';
import { routePacedInput } from '../../../src/pacing/router.js';
import { interpretMove } from '../../../src/moves/interpreter.js';

const MODULE_ID = 'starforged-companion';

// What the vendor's sf-move.hbs renders for Face Danger (the enriched move text
// inside the system's ironsworn-message article).
const VENDOR_MOVE_CARD =
  "<article class='ironsworn-message theme-starforged flexcol' data-tooltip-direction='LEFT'>" +
  '<h3>Face Danger</h3>' +
  "<div class='dice-result dice-tooltip dice-roll ironsworn-roll' data-move='Face Danger'>" +
  "<div class='move-outcome'><p><strong>When you attempt something risky or react to an imminent threat</strong>, " +
  'envision your action and roll. If you act...</p><ul><li>With speed, mobility, or agility: Roll +edge</li>' +
  '<li>With resolve, command, or sociability: Roll +heart</li></ul>' +
  '<p>On a <strong>strong hit</strong>, you are successful. Take +1 momentum.</p></div></div></article>';

describe('PROBE VENDOR-MOVE-CARD-NARRATED — the predicate', () => {
  it("the system's 'Send to chat' move card is not player narration", () => {
    const message = {
      type:    'base',
      style:   0,                       // CHAT_MESSAGE_STYLES.OTHER — the default
      content: VENDOR_MOVE_CARD,
      speaker: { actor: 'pc-pat', alias: 'Kira' },
      whisper: [],
      rolls:   [],
      flags:   {},
      author:  { id: 'pl-1', isGM: false },
    };
    // Expected false: it is the system's reference card. Today: true.
    expect(isPlayerNarration(message)).toBe(false);
  });

  it('control: typed narration still is', () => {
    expect(isPlayerNarration({
      type: 'base', style: 1, content: 'I brace against the hull and push through the breach.',
      speaker: { actor: 'pc-pat' }, whisper: [], rolls: [], flags: {}, author: { id: 'pl-1' },
    })).toBe(true);
  });
});

describe('PROBE VENDOR-MOVE-CARD-NARRATED — on a table', () => {
  let table;

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  }, 30_000);
  afterAll(() => table?.teardown());

  beforeEach(async () => {
    await table.reset({ world: { settings: { campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [],
    } } } });
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
    routePacedInput.mockClear();
    interpretMove.mockClear();
  });

  it("a player's 'Send to chat' on Face Danger rolls nothing", async () => {
    // Exactly what createSfMoveChatMessage does, on the player's client.
    await table.client('pl-1').run(() => globalThis.ChatMessage.create({
      speaker: { actor: 'pc-pat', alias: 'Kira' },
      content: VENDOR_MOVE_CARD,
    }));
    await table.settle();

    // Expected: the reference card never reaches the pipeline.
    expect(routePacedInput).not.toHaveBeenCalled();
    expect(interpretMove).not.toHaveBeenCalled();
    expect(table.cards(f => f.moveResolution === true)).toHaveLength(0);
  }, 30_000);

  it('control: the same player typing narration does run the pipeline', async () => {
    await table.client('pl-1').chat('I brace against the hull and push through the breach.', { speaker: { actor: 'pc-pat' } });
    await table.settle();
    expect(interpretMove).toHaveBeenCalledTimes(1);
  }, 30_000);
});
