/**
 * STARFORGED COMPANION
 * tests/unit/xcardNarratorMemory.test.js
 *
 * The narration an X-Card answers leaves narrator memory (issue #321 U07 —
 * full exclusion, the maintainer's decision).
 *
 * XCARD-CONTENT-REFED: suppressScene / clearXCard (src/context/safety.js) only
 * flipped xCardActive and counted plays — nothing marked the X-carded narrator
 * card, and sessionNarratorCards (src/narration/narrator.js) had no exclude
 * for it. The moment a GM resumed, the next narration's RECENT SCENE carried
 * the X-carded prose verbatim, the rolling summary re-summarised it, and the
 * facts its sidecar ledgered stayed binding.
 *
 * Now, on the canonical GM, the X-Card:
 *   - flags the narration's cards `xCarded` — out of the ring, the rolling
 *     summary and the session recap's prose;
 *   - retracts what their sidecars wrote (truths retracted `by: xcard` and
 *     named nowhere, state removed, a frame they wrote cleared) — and keeps it
 *     retracted against a stale writer's merge or a late relayed sidecar;
 *   - drops the rolling summary's text when it covered the narration;
 *   - leaves a redirect the first narration after a GM resumes carries,
 *     cleared once a narration has posted.
 *
 * Which cards (applyXCardToNarratorMemory): the newest narrator card of the
 * session still in memory, with the cards of the same beat — after the last
 * message someone sent, at most two minutes older — bounded by an earlier
 * X-Card's cards; nothing more once nothing new was narrated.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import {
  postNarrationCard,
  getRecentNarrationContext,
  applyNarratorSidecar,
  applyRelayedNarratorSidecar,
  buildNarratorExtras,
  postSessionRecap,
  registerXCardRedirectHook,
  xCardedNarrationCards,
} from '../../src/narration/narrator.js';
import { buildNarratorSystemPrompt, buildLedgerBlock } from '../../src/narration/narratorPrompt.js';
import { suppressScene, clearXCard } from '../../src/context/safety.js';
import { applySidecar } from '../../src/factContinuity/ledgers.js';
import { sessionRetractedFacts } from '../../src/factContinuity/retractions.js';
import { persistResolution } from '../../src/moves/persistResolution.js';
import { onNarratorCardRendered } from '../../src/audio/index.js';
import { parseHTML, StubElement } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-2';

const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const flags = (m) => m.flags[MODULE_ID];

/** game.messages shows every card created so far, plus any extra messages, in order. */
function syncChat() {
  global.game.messages = { contents: ChatMessage._created.slice() };
}

/** A line someone typed into chat — not one of this module's cards. */
async function personSays(content) {
  await ChatMessage.create({ content, flags: {} });
}

/** A narration as the narrator makes one: its sidecar applied (and persisted) with its id, then its card. */
async function narrate(narrationId, prose, sidecar, { at = null, playerText = 'I press on.', resolution = {} } = {}) {
  const raw = `${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``;
  const text = applyNarratorSidecar(raw, stored(), { narrationId });
  await new Promise(r => setTimeout(r, 0));    // the sidecar's persist settles
  const card = await postNarrationCard(text, { moveId: 'compel', outcome: 'miss', _id: `res-${narrationId}`, ...resolution },
    stored(), { playerText, playerName: 'Kira', narrationId });
  if (at !== null) card.timestamp = at;
  return card;
}

const TORCH = {
  newTruths:    [{ subject: 'the prisoner', fact: 'His hand was burned with a cutting torch' }],
  stateChanges: [{ subject: 'the prisoner', attribute: 'condition', value: 'burned hand' }],
  sceneFrame:   { location: 'the interrogation cell', present: ['the prisoner'], situation: 'The torch hovers over his hand' },
};
const DOCKS = {
  newTruths:    [{ subject: 'the dockmaster', fact: 'Owes the crew a favour' }],
  stateChanges: [{ subject: 'the dockmaster', attribute: 'location', value: 'the cargo bay' }],
  sceneFrame:   { location: 'the docking ring', present: ['the dockmaster'], situation: 'Haggling over berths' },
};

beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.clear();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 2, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0,
  });
});

describe('the X-carded narration leaves narrator memory', () => {
  it("after the X-Card is played and resumed, the X-carded narration is not in the next narration's RECENT SCENE", async () => {
    const state = stored();
    await postNarrationCard('The interrogator lifts the cutting torch toward the prisoner\'s hand.',
      { moveId: 'compel', outcome: 'miss', _id: 'res-x' }, state, { playerText: 'I press him harder.', playerName: 'Kira' });
    syncChat();

    // A player plays the X-Card on that beat; the GM later resumes.
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardActive).toBe(true);
    expect(await clearXCard()).toBe(true);

    expect(flags(ChatMessage._created[0]).xCarded).toBe(true);
    expect(getRecentNarrationContext(SESSION, 20)).not.toContain('cutting torch');
  });

  it("retracts what its sidecar wrote — and only that: an earlier narration's facts stay", async () => {
    await narrate('nar-docks', 'The dockmaster waves you in.', DOCKS);
    await personSays('I follow the guard down to the cells.');
    await narrate('nar-torch', 'The interrogator lifts the cutting torch.', TORCH);
    syncChat();

    await suppressScene({}, { local: true });

    const cs = stored();
    const byFact = Object.fromEntries(cs.sceneTruths.map(t => [t.fact, t]));
    expect(byFact['His hand was burned with a cutting torch']).toMatchObject({ retracted: true, retractedBy: 'xcard' });
    expect(byFact['Owes the crew a favour']).toMatchObject({ retracted: false });
    expect(cs.sceneState.bySubject['the prisoner']).toBeUndefined();
    expect(cs.sceneState.bySubject['the dockmaster']).toEqual([expect.objectContaining({ value: 'the cargo bay' })]);
    expect(cs.sceneFrame).toBeNull();                            // the X-carded narration wrote it
    expect(cs.xCardedNarrationIds).toEqual(['nar-torch']);
    expect(flags(ChatMessage._created.find(m => flags(m)?.narrationId === 'nar-docks')).xCarded).toBeUndefined();
  });

  it('names a removed fact nowhere — not even as a correction — and still blocks its re-assertion', async () => {
    await narrate('nar-torch', 'The interrogator lifts the cutting torch.', TORCH);
    syncChat();
    await suppressScene({}, { local: true });

    const cs = stored();
    expect(sessionRetractedFacts(cs)).toEqual([]);
    expect(buildLedgerBlock(cs, {}).combined).not.toMatch(/cutting torch|burned hand|interrogation cell/);

    applySidecar({ newTruths: TORCH.newTruths, stateChanges: [] }, { campaignState: cs });
    expect(cs.sceneTruths.filter(t => /cutting torch/.test(t.fact))).toHaveLength(1);   // not re-appended
  });

  it('a move resolving from a snapshot read before the X-Card does not bring its state or frame back', async () => {
    await narrate('nar-torch', 'The interrogator lifts the cutting torch.', TORCH);
    syncChat();
    game.settings._store.set(`${MODULE_ID}.campaignState`, { ...stored(), currentSessionId: SESSION, sessionLogs: { [SESSION]: [] } });
    const snapshot = JSON.parse(JSON.stringify(stored()));   // the move pipeline's working copy

    await suppressScene({}, { local: true });
    await persistResolution({
      _id: 'res-2', moveId: 'face_danger', outcome: 'strong_hit',
      consequences: { momentumChange: 0, healthChange: 0, spiritChange: 0, supplyChange: 0 },
    }, snapshot);

    const cs = stored();
    expect(cs.xCardActive).toBe(true);
    expect(cs.sceneState.bySubject['the prisoner']).toBeUndefined();
    expect(cs.sceneFrame).toBeNull();
    expect(cs.sceneTruths.find(t => /cutting torch/.test(t.fact))).toMatchObject({ retracted: true, retractedBy: 'xcard' });
  });

  it('a relayed sidecar of the removed narration that arrives late is dropped', async () => {
    await narrate('nar-torch', 'The interrogator lifts the cutting torch.', TORCH);
    syncChat();
    await suppressScene({}, { local: true });

    await applyRelayedNarratorSidecar({
      sidecar: { newTruths: [{ subject: 'the prisoner', fact: 'Screams for his mother' }], stateChanges: [], sceneFrame: null },
      sceneId: 'sc-1', narrationId: 'nar-torch',
    });

    expect(stored().sceneTruths.some(t => /Screams/.test(t.fact))).toBe(false);
  });

  it("drops the rolling summary's text when it covered the narration", async () => {
    await narrate('nar-docks', 'The dockmaster waves you in.', DOCKS);
    await personSays('I head for the cells.');
    await narrate('nar-torch', 'The interrogator lifts the cutting torch.', TORCH);
    syncChat();

    // Made after both cards: it covers the X-carded one.
    game.settings._store.set(KEY, { ...stored(), sessionSummary: { text: 'Kira watched the torch.', coveredCount: 2, sessionId: SESSION } });
    await suppressScene({}, { local: true });
    expect(stored().sessionSummary).toMatchObject({ text: '', coveredCount: 0 });
  });

  // Control: before this fix nothing touched the summary either; it pins that the coverage check keeps it.
  it('control: keeps a rolling summary made before the narration it removes', async () => {
    await narrate('nar-docks', 'The dockmaster waves you in.', DOCKS);
    await personSays('I head for the cells.');
    await narrate('nar-torch', 'The interrogator lifts the cutting torch.', TORCH);
    syncChat();

    game.settings._store.set(KEY, { ...stored(), sessionSummary: { text: 'Kira reached the docks.', coveredCount: 1, sessionId: SESSION } });
    await suppressScene({}, { local: true });
    expect(stored().sessionSummary).toMatchObject({ text: 'Kira reached the docks.', coveredCount: 1 });
  });

  it('the session recap counts the move but does not quote the removed narration', async () => {
    await narrate('nar-torch', 'The interrogator lifts the cutting torch.', TORCH);
    syncChat();
    await suppressScene({}, { local: true });

    await postSessionRecap(stored());
    const recap = ChatMessage._created.at(-1);
    expect(recap.content).toContain('Compel → Miss');
    expect(recap.content).not.toContain('cutting torch');
  });

  it('a removed narration shows no audio Play button', async () => {
    const savedHTMLElement = globalThis.HTMLElement;
    globalThis.HTMLElement = StubElement;
    try {
      game.settings._store.set(`${MODULE_ID}.audio.enabled`, true);
      game.settings._store.set(`${MODULE_ID}.audio.clientEnabled`, true);
      const root = parseHTML('<div class="sf-narration-prose">The torch.</div><button data-action="audioPlayToggle" hidden></button>');
      await onNarratorCardRendered({ id: 'm1', flags: { [MODULE_ID]: { narratorCard: true, narrationText: 'The torch.', xCarded: true } } }, root);
      expect(root.querySelector('[data-action="audioPlayToggle"]').hasAttribute('hidden')).toBe(true);
    } finally {
      globalThis.HTMLElement = savedHTMLElement;
    }
  });
});

describe("the X-Card's redirect", () => {
  it('the first narration after a GM resumes carries it; once a narration has posted it is cleared', async () => {
    registerXCardRedirectHook();
    await narrate('nar-torch', 'The interrogator lifts the cutting torch.', TORCH);
    syncChat();
    await suppressScene({}, { local: true });
    await clearXCard();

    const extras = await buildNarratorExtras('paced_narrative', stored(), { playerNarration: 'I leave the cell.' });
    expect(extras.xCardRedirect).toBe(true);
    expect(buildNarratorSystemPrompt(stored(), {}, null, '', extras)).toContain('## X-CARD — REDIRECT');

    // A fallback card delivered nothing — the redirect stays.
    const fallback = await ChatMessage.create({ content: 'x', flags: { [MODULE_ID]: { narratorCard: true, narrationFallback: true, narrationText: 'Compel: Miss — narration unavailable.' } } });
    Hooks.call('createChatMessage', fallback);
    await new Promise(r => setTimeout(r, 0));
    expect(stored().xCardRedirect).toBeTruthy();

    // The narration that carried it posts.
    const next = await postNarrationCard('The corridor lights flicker.', { moveId: 'face_danger', outcome: 'weak_hit' }, stored(), {});
    Hooks.call('createChatMessage', next);
    await new Promise(r => setTimeout(r, 0));
    expect(stored().xCardRedirect).toBeNull();
    expect((await buildNarratorExtras('paced_narrative', stored(), { playerNarration: 'x' })).xCardRedirect).toBe(false);
  });

  it('is not cleared while the X-Card is still active', async () => {
    registerXCardRedirectHook();
    await suppressScene({}, { local: true });
    const card = await postNarrationCard('Something slipped through.', { moveId: 'face_danger', outcome: 'miss' }, stored(), {});
    Hooks.call('createChatMessage', card);
    await new Promise(r => setTimeout(r, 0));
    expect(stored().xCardRedirect).toBeTruthy();
  });

  it('is never rendered in a recap', async () => {
    await suppressScene({}, { local: true });
    await clearXCard();
    const extras = await buildNarratorExtras('campaign_recap', stored(), {});
    expect(extras.xCardRedirect).toBe(false);
  });
});

describe('which cards an X-Card removes', () => {
  const removed = () => ChatMessage._created.filter(m => flags(m)?.xCarded).map(m => flags(m).narrationText);

  it('the newest narration and the cards posted with it, back to the last message someone sent', async () => {
    await narrate('n0', 'Earlier: the dockmaster waves.', DOCKS);
    await personSays('I press him harder.');
    await narrate('n1', 'The torch flares.', TORCH);
    await ChatMessage.create({ content: 'clock', flags: { [MODULE_ID]: { clockCard: true } } });   // another module card
    await narrate('n2', 'Far away, the Syndicate closes in.', { newTruths: [], stateChanges: [] });
    syncChat();

    await suppressScene({}, { local: true });
    expect(removed()).toEqual(['The torch flares.', 'Far away, the Syndicate closes in.']);
  });

  it('a card more than two minutes older than the newest is not in its beat', async () => {
    const t = Date.now();
    await narrate('n1', 'Long ago, the hatch opened.', DOCKS, { at: t - 5 * 60_000 });
    await narrate('n2', 'The torch flares.', TORCH, { at: t });
    syncChat();

    expect(xCardedNarrationCards(SESSION).map(m => flags(m).narrationText)).toEqual(['The torch flares.']);
  });

  it('played again before anything new is narrated, it removes nothing more', async () => {
    await narrate('n0', 'Earlier: the dockmaster waves.', DOCKS);
    await personSays('I press him harder.');
    await narrate('n1', 'The torch flares.', TORCH);
    syncChat();

    await suppressScene({}, { local: true });
    await ChatMessage.create({ content: 'X-Card', flags: { [MODULE_ID]: { xcardCard: true, xcardRecorded: true } } });
    syncChat();
    await suppressScene({}, { local: true });

    expect(removed()).toEqual(['The torch flares.']);
    expect(stored().sceneTruths.find(t => t.fact === 'Owes the crew a favour')).toMatchObject({ retracted: false });
  });

  it('after a GM resumes, the next X-Card removes the new narration and does not reach past the resume', async () => {
    await narrate('n1', 'The torch flares.', TORCH);
    syncChat();
    await suppressScene({}, { local: true });
    await ChatMessage.create({ content: 'X-Card', flags: { [MODULE_ID]: { xcardCard: true } } });
    await ChatMessage.create({ content: 'cleared', flags: { [MODULE_ID]: { xcardClearedCard: true } } });
    await clearXCard();
    await narrate('n3', 'The corridor lights flicker.', DOCKS);
    syncChat();

    await suppressScene({}, { local: true });
    expect(removed()).toEqual(['The torch flares.', 'The corridor lights flicker.']);
    expect(stored().xCardedNarrationIds).toEqual(['n1', 'n3']);
  });

  it('never chooses a fallback or a whispered card', async () => {
    await narrate('n1', 'The torch flares.', TORCH);
    await ChatMessage.create({ content: 'fb', flags: { [MODULE_ID]: { narratorCard: true, narrationFallback: true, narrationText: 'Compel: Miss — narration unavailable.', sessionId: SESSION } } });
    await ChatMessage.create({ content: 'w', whisper: ['gm-1'], flags: { [MODULE_ID]: { narratorCard: true, narrationText: 'A private aside.', sessionId: SESSION } } });
    syncChat();

    expect(xCardedNarrationCards(SESSION).map(m => flags(m).narrationText)).toEqual(['The torch flares.']);
  });
});

afterEach(() => {
  game.settings._store.clear();
});
