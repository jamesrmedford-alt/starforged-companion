/**
 * UI-2 PRIVATE-LINES-TWO-GM-LOST-UPDATE (twelfth audit, ui area).
 *
 * Every GM's client writes its own Private Lines into the shared list
 * `campaignState.safety.privateLines` at `ready` and on every Lines / Veils /
 * Private Lines edit (syncSafetyToCampaignState, src/ui/settingsPanel.js:757-799):
 * it reads the list from its cached campaignState, replaces its own entry,
 * keeps "the others" it can see, and writes the whole object. The write chain
 * (CAMPSTATE-CHAIN-REST) orders writes on ONE client only. Two GMs who load at
 * once — a session's start, a server restart — each read the list before the
 * other's write lands, and the later write drops the earlier GM's entry: the
 * Z68 lost update (keyed-GM registries) on a list nothing heals — a GM's
 * entry is re-written only at that GM's next load or edit, and a player's
 * only at the canonical GM's next relay-ready (registerPrivateLinesGmPull).
 *
 * Consequence: every shared narration is built from that list
 * (formatNarratorSafetyContext, src/context/safety.js:97 — a GM's client
 * passes "gm", which reads campaignState.safety.privateLines, never the
 * GM's own client setting), so the dropped GM's hard limits are absent from
 * the narrator's prompt with nobody told.
 *
 * Scenario A: Gina (gm-1, keyed, canonical) and Gus (gm-2) each keep a
 * Private Line. Gina's ready-time sync is still on its way to the server when
 * Gus loads; Gus's sync lands; Gina's lands last — Gus's line is gone.
 * Scenario B: Gus's ready-time sync is on its way when Pat's (pl-1) relayed
 * lines reach Gina, who writes them (applyPrivateLinesSync, :832-854); Gus's
 * write, built before Pat's entry existed, lands last — Pat's line is gone,
 * until Gina's next load re-pulls it.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { holdWrites } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const CLIENT_SETTINGS = {
  'gm-1': { claudeApiKey: 'sk-ant-gina', privateLines: ['No spiders, ever.'] },
  'gm-2': { privateLines: ['No drowning scenes.'] },
};

const WORLD = { settings: {
  chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
  campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
    lastSessionTimestamp: new Date().toISOString(),
  },
} };

let table = null;
afterEach(async () => { await table?.teardown(); table = null; });

/** Gina's own safety-sync write (her entry in the shared list). */
const ginaSafetySync = (w) => w.kind === 'setting'
  && w.key === `${MODULE_ID}.campaignState`
  && w.client === 'gm-1'
  && (w.value?.safety?.privateLines ?? []).some(e => e.playerId === 'gm-1');

const entriesById = () => Object.fromEntries(
  (table.world.campaignState()?.safety?.privateLines ?? []).map(e => [e.playerId, e.lines]));

/** The canonical GM narrates an @scene answer; the system prompt it sent. */
async function narratorPromptOnGina() {
  await table.client('gm-1').chat('@scene What does the cargo bay look like?');
  await table.settle();
  await table.drain();
  const call = table.claude.by('gm-1').at(-1);
  return call?.system ?? '';
}

describe('UI-2: two GMs loading at once both keep their Private Lines', () => {
  it('control: loaded one after the other, both GMs\' lines are listed and reach the narrator', async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1], boot: false, world: WORLD, clientSettings: CLIENT_SETTINGS });
    await table.client('gm-1').boot();
    await table.client('gm-2').boot();
    await table.client('pl-1').boot();
    await table.settle();

    expect(entriesById()).toEqual({ 'gm-1': ['No spiders, ever.'], 'gm-2': ['No drowning scenes.'] });
    const prompt = await narratorPromptOnGina();
    expect(prompt).toContain('No spiders, ever.');
    expect(prompt).toContain('No drowning scenes.');
  }, 60_000);

  it('Gina\'s sync still in flight when Gus loads: Gus\'s Private Line should stay in the list and in the narrator\'s prompt', async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1], boot: false, world: WORLD, clientSettings: CLIENT_SETTINGS });
    const held = holdWrites(table, ginaSafetySync);
    await table.client('gm-1').boot();           // reads the list (empty), writes [gina] — in flight
    await held.arrived;
    await table.client('gm-2').boot();           // reads the list (empty) too, writes [gus]
    held.release();                              // Gina's [gina] lands last
    await table.settle();
    await table.client('pl-1').boot();
    await table.settle();

    // Gus's hard limit is gone from the list every shared narration reads…
    expect(entriesById()).toEqual({ 'gm-1': ['No spiders, ever.'], 'gm-2': ['No drowning scenes.'] });
  }, 60_000);

  it('control: with nothing in flight, a player\'s relayed Private Line reaches the list beside both GMs\'', async () => {
    const settings = { ...CLIENT_SETTINGS, 'pl-1': { privateLines: ['Nothing involving my character\'s family.'] } };
    table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1], boot: false, world: WORLD, clientSettings: settings });
    await table.client('gm-1').boot();
    await table.client('gm-2').boot();
    await table.client('pl-1').boot();
    await table.settle();
    expect(entriesById()).toEqual({
      'gm-1': ['No spiders, ever.'], 'gm-2': ['No drowning scenes.'], 'pl-1': ['Nothing involving my character\'s family.'],
    });
  }, 60_000);

  it('a player\'s relayed Private Line should survive a co-GM\'s sync built before it landed', async () => {
    // Pat (pl-1) keeps a hard limit; Gus's own sync, read from his cache
    // before Pat's entry existed, lands after the canonical GM wrote it.
    const settings = { ...CLIENT_SETTINGS, 'pl-1': { privateLines: ['Nothing involving my character\'s family.'] } };
    table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1], boot: false, world: WORLD, clientSettings: settings });
    await table.client('gm-1').boot();
    const held = holdWrites(table, (w) => w.kind === 'setting' && w.key === `${MODULE_ID}.campaignState` && w.client === 'gm-2');
    await table.client('gm-2').boot();           // Gus reads [gina], writes [gina, gus] — in flight
    await held.arrived;
    await table.client('pl-1').boot();           // Pat's lines relay to Gina, who writes [gina, pat]
    await table.settle();
    held.release();                              // Gus's write lands last
    await table.settle();

    expect(entriesById()['pl-1']).toEqual(['Nothing involving my character\'s family.']);
  }, 60_000);

  it('…and from the narrator\'s prompt, with nobody told', async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1], boot: false, world: WORLD, clientSettings: CLIENT_SETTINGS });
    const held = holdWrites(table, ginaSafetySync);
    await table.client('gm-1').boot();
    await held.arrived;
    await table.client('gm-2').boot();
    held.release();
    await table.settle();
    await table.client('pl-1').boot();
    await table.settle();

    const prompt = await narratorPromptOnGina();
    expect(prompt).toContain('No spiders, ever.');       // control: the prompt carries the block
    expect(prompt).toContain('No drowning scenes.');
  }, 60_000);
});
