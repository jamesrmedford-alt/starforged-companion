/**
 * PROBE SC — INCITING-BOLD-LABEL (WRONG-DETAIL)
 *
 * What the user does: Envision an Inciting Incident (Session panel ✦ /
 * `!incite`), then ⚔ Swear this vow. The narrator writes its proposal block
 * with Markdown-bold labels — "**Suggested vow:** …", "**Vow target:** …" —
 * the commonest Markdown form of a labelled line.
 *
 * What happens: every trailing-line parser (incitingIncident.js
 * splitSuggestedVow / splitSuggestedClock / splitImmediateCrisis /
 * splitVowTarget / splitSituationSummary) allows Markdown characters BEFORE
 * the label (`^[ \t>*_-]*Suggested vow:`) but not the closing `**` after the
 * colon, which leaks into the value: the vow is created on every PC as
 * "** I will find Dani …", the clock "** Dani's captivity", and the vow
 * target "** Dani Okoro" — whose name no longer matches the established
 * Dani Okoro (entityExistsAnyType normalises case and spaces only), so the
 * swear creates a second, asterisk-named connection with a bond on every PC.
 *
 * What should happen: the label's Markdown is stripped; the values are the
 * statement, the clock label and the established NPC's name.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/narration/narrator.js', async (importOriginal) => ({
  ...(await importOriginal()),
  narrateIncitingIncident:   vi.fn(),
  runPacedDetection:         vi.fn(async () => {}),
  runNarrationTierUpdate:    vi.fn(async () => {}),
  narrateAndPostVowSwearing: vi.fn(async () => {}),
}));
vi.mock('../../../src/world/worldJournal.js', async (importOriginal) => ({
  ...(await importOriginal()),
  recordLoreDiscovery: vi.fn(async () => {}),
}));
vi.mock('../../../src/entities/connection.js', async (importOriginal) => ({
  ...(await importOriginal()),
  createConnection: vi.fn(async (data) => ({ _id: 'rec-new', name: data.name, rank: 'dangerous' })),
}));

import { narrateIncitingIncident } from '../../../src/narration/narrator.js';
import { createConnection } from '../../../src/entities/connection.js';
import { runIncitingIncident } from '../../../src/session/incitingIncident.js';
import { swearSharedVowForAll } from '../../../src/session/swearVow.js';

const MODULE_ID = 'starforged-companion';

const BOLD_REPLY = [
  'The distress call cuts out mid-word. Dani Okoro is gone from the Ashwind relay.',
  '',
  '**Suggested vow:** I will find Dani before the Covenant does (extreme)',
  "**Suggested clock:** Dani's captivity (6 segments)",
  '**Vow target:** Dani Okoro (she/her) — your sister, a relay engineer taken by Covenant raiders.',
  '**Situation:** Covenant raiders took Dani Okoro from the Ashwind relay.',
].join('\n');

beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset();
  game.settings._store.clear();
  game.user.isGM = true;
  vi.mocked(narrateIncitingIncident).mockReset();
  vi.mocked(createConnection).mockClear();
});

describe('PROBE INCITING-BOLD-LABEL', () => {
  it('control: the same block without Markdown names the established NPC, and the swear creates no one', async () => {
    silenceConsoleErrors();
    const dani = makeTestActor({ id: 'npc-dani', name: 'Dani Okoro', type: 'character',
      flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-dani', name: 'Dani Okoro', rank: 'dangerous', active: true } } } });
    const kira = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character' });
    game.actors._setAll([dani, kira]);
    game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 's1', connectionIds: ['npc-dani'] });
    vi.mocked(narrateIncitingIncident).mockResolvedValue(BOLD_REPLY.replace(/\*\*/g, ''));
    await runIncitingIncident(game.settings.get(MODULE_ID, 'campaignState'));
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.incitingIncidentCard);
    card.id ??= 'inc-1';
    expect(card.flags[MODULE_ID].incitingMeta.target.name).toBe('Dani Okoro');
    await swearSharedVowForAll(card, { speakerActorId: 'pc-kira' });
    expect(vi.mocked(createConnection)).not.toHaveBeenCalled();
  });

  it("the card's proposal carries the vow, clock and target without the label's Markdown", async () => {
    vi.mocked(narrateIncitingIncident).mockResolvedValue(BOLD_REPLY);
    game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 's1' });
    await runIncitingIncident(game.settings.get(MODULE_ID, 'campaignState'));
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.incitingIncidentCard);
    const meta = card.flags[MODULE_ID].incitingMeta;
    expect(meta.vow.statement).toBe('I will find Dani before the Covenant does');   // actual: "** I will find Dani …"
    expect(meta.clock.label).toBe("Dani's captivity");                              // actual: "** Dani's captivity"
    expect(meta.target.name).toBe('Dani Okoro');                                    // actual: "** Dani Okoro"
  });

  it('swearing it does not create a second connection for the established Dani Okoro', async () => {
    silenceConsoleErrors();
    // The established NPC (a connection card, its record on the Actor's flag).
    const dani = makeTestActor({ id: 'npc-dani', name: 'Dani Okoro', type: 'character',
      flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-dani', name: 'Dani Okoro', rank: 'dangerous', active: true } } } });
    const kira = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character' });
    game.actors._setAll([dani, kira]);
    game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 's1', connectionIds: ['npc-dani'] });

    vi.mocked(narrateIncitingIncident).mockResolvedValue(BOLD_REPLY);
    await runIncitingIncident(game.settings.get(MODULE_ID, 'campaignState'));
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.incitingIncidentCard);
    card.id ??= 'inc-1';

    await swearSharedVowForAll(card, { speakerActorId: 'pc-kira' });
    expect(vi.mocked(createConnection)).not.toHaveBeenCalled();                     // actual: called with "** Dani Okoro"
    const vow = kira.items.contents.find(i => i.system?.subtype === 'vow');
    expect(vow?.name).toBe('I will find Dani before the Covenant does');             // actual: "** I will find …"
  });
});
