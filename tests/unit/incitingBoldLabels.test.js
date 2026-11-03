/**
 * STARFORGED COMPANION
 * tests/unit/incitingBoldLabels.test.js
 *
 * Issue #325 W33: the inciting proposal's trailing-line parsers allowed
 * Markdown before the label (`^[ \t>*_-]*Suggested vow:`) but not the closing
 * `**` after the colon, so "**Suggested vow:** I will find Dani" was sworn as
 * "** I will find Dani …" on every PC, the clock was "** Dani's captivity",
 * and the target "** Dani Okoro" no longer matched the established Dani Okoro:
 * the swear created a second, asterisk-named connection with a bond on every
 * PC. The label's Markdown is now tolerated and emphasis stripped from the
 * value.
 *
 * Converted from the audit probe session/incitingBoldLabels, plus the other
 * Markdown shapes of a labelled line.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/narration/narrator.js', async (importOriginal) => ({
  ...(await importOriginal()),
  narrateIncitingIncident:   vi.fn(),
  runPacedDetection:         vi.fn(async () => {}),
  runNarrationTierUpdate:    vi.fn(async () => {}),
  narrateAndPostVowSwearing: vi.fn(async () => {}),
}));
vi.mock('../../src/world/worldJournal.js', async (importOriginal) => ({
  ...(await importOriginal()),
  recordLoreDiscovery: vi.fn(async () => {}),
}));
vi.mock('../../src/entities/connection.js', async (importOriginal) => ({
  ...(await importOriginal()),
  createConnection: vi.fn(async (data) => ({ _id: 'rec-new', name: data.name, rank: 'dangerous' })),
}));

import { narrateIncitingIncident } from '../../src/narration/narrator.js';
import { createConnection } from '../../src/entities/connection.js';
import { runIncitingIncident, splitIncitingMeta } from '../../src/session/incitingIncident.js';
import { swearSharedVowForAll } from '../../src/session/swearVow.js';

const MODULE_ID = 'starforged-companion';

const BOLD_REPLY = [
  'The distress call cuts out mid-word. Dani Okoro is gone from the Ashwind relay.',
  '',
  '**Suggested vow:** I will find Dani before the Covenant does (extreme)',
  "**Suggested clock:** Dani's captivity (6 segments)",
  '**Immediate crisis:** The relay is venting atmosphere (4 segments)',
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

describe('splitIncitingMeta — a Markdown-bold label is a label', () => {
  it('reads every proposal line without the label\'s Markdown, and cuts them all from the prose', () => {
    const meta = splitIncitingMeta(BOLD_REPLY);
    expect({
      vow:       meta.vow && { statement: meta.vow.statement, rank: meta.vow.rank },
      clock:     meta.clock,
      crisis:    meta.immediateCrisis,
      target:    meta.target,
      situation: meta.situation,
      prose:     meta.prose,
    }).toEqual({
      vow:       { statement: 'I will find Dani before the Covenant does', rank: 'extreme' },
      clock:     { label: "Dani's captivity", segments: 6 },
      crisis:    { label: 'The relay is venting atmosphere', segments: 4 },
      target:    { name: 'Dani Okoro', pronouns: 'she/her', description: 'your sister, a relay engineer taken by Covenant raiders.', kind: 'person' },
      situation: 'Covenant raiders took Dani Okoro from the Ashwind relay.',
      prose:     'The distress call cuts out mid-word. Dani Okoro is gone from the Ashwind relay.',
    });
  });

  it('the other Markdown shapes of a labelled line', () => {
    expect(splitIncitingMeta('Prose.\n**Suggested vow**: Find the *Archive* (formidable)').vow)
      .toMatchObject({ statement: 'Find the Archive', rank: 'formidable' });
    expect(splitIncitingMeta('Prose.\n- *Vow target:* __Ren Ito__ — a fixer').target)
      .toEqual({ name: 'Ren Ito', pronouns: '', description: 'a fixer', kind: 'person' });
    expect(splitIncitingMeta('Prose.\n**Suggested clock: The hunt closes in (8 segments)**').clock)
      .toEqual({ label: 'The hunt closes in', segments: 8 });
  });

  it('control: plain labels read as before', () => {
    const meta = splitIncitingMeta(BOLD_REPLY.replace(/\*\*/g, ''));
    expect(meta.vow.statement).toBe('I will find Dani before the Covenant does');
    expect(meta.target.name).toBe('Dani Okoro');
  });
});

describe('the inciting card and the swear', () => {
  function establishDani() {
    const dani = makeTestActor({ id: 'npc-dani', name: 'Dani Okoro', type: 'character',
      flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-dani', name: 'Dani Okoro', rank: 'dangerous', active: true } } } });
    const kira = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character' });
    game.actors._setAll([dani, kira]);
    game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 's1', connectionIds: ['npc-dani'] });
    return kira;
  }

  it("the card's proposal carries the vow, clock and target without the label's Markdown", async () => {
    vi.mocked(narrateIncitingIncident).mockResolvedValue(BOLD_REPLY);
    game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 's1' });
    await runIncitingIncident(game.settings.get(MODULE_ID, 'campaignState'));
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.incitingIncidentCard);
    const meta = card.flags[MODULE_ID].incitingMeta;
    expect(meta.vow.statement).toBe('I will find Dani before the Covenant does');
    expect(meta.clock.label).toBe("Dani's captivity");
    expect(meta.target.name).toBe('Dani Okoro');
  });

  it('swearing it creates no second connection for the established Dani Okoro', async () => {
    silenceConsoleErrors();
    const kira = establishDani();
    vi.mocked(narrateIncitingIncident).mockResolvedValue(BOLD_REPLY);
    await runIncitingIncident(game.settings.get(MODULE_ID, 'campaignState'));
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.incitingIncidentCard);
    card.id ??= 'inc-1';

    await swearSharedVowForAll(card, { speakerActorId: 'pc-kira' });

    expect(vi.mocked(createConnection)).not.toHaveBeenCalled();
    const vow = kira.items.contents.find(i => i.system?.subtype === 'vow');
    expect(vow?.name).toBe('I will find Dani before the Covenant does');
  });
});
