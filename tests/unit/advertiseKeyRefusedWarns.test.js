/**
 * STARFORGED COMPANION
 * tests/unit/advertiseKeyRefusedWarns.test.js
 *
 * Issue #337 Y40 (ADVERTISE-REFUSED-SILENT) — a GM whose Claude key change
 * the world refused to register for the table is told.
 *
 * At a two-GM table the lower-id GM (gm-1) is keyless; gm-2 pastes a Claude
 * key mid-session and the world refuses the one write that advertises it,
 * the `keyedGmUserIds` registry. The claudeApiKey onChange was
 * `advertiseClaudeKeyPresence().catch(() => {})`: no console line, no
 * notification, while the ready-path call of the same function warns
 * "keyed-GM advertise failed". The registry stayed empty, so every client
 * kept the keyless gm-1 canonical and `hasKeyedActiveGM()` false — a
 * player's `@scene` ran on their own keyless client — until a reload
 * re-advertised. Now the onChange warns as the ready path does and tells
 * the GM, naming the reload that registers it.
 *
 * (Converted from the tenth audit's probe
 * tests/probes/multiplayer/advertiseRefusedSilent.probe.js.)
 */

/* global getCapturedWarns, expectConsoleError */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, failWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
const registryWrite = (w) => w.kind === 'setting' && w.key === `${MODULE_ID}.keyedGmUserIds`;
const registry = () => table.world.getSetting('keyedGmUserIds') ?? [];
const warnedAdvertise = () => getCapturedWarns().some(w => /keyed-GM advertise failed/.test(w));
const gm2Notices = () => table.client('gm-2').notifications.filter(n => n.level === 'warn' && /Claude key/.test(n.message));

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    narratorSessionSummary: false, chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'adv-s1', currentSceneId: 'adv-scene', sceneTruths: [] },
  } } });
});

async function playerAsksTheScene() {
  scriptClaude(table);
  await table.client('pl-1').chat('@scene what does the hangar smell like?');
  await table.settle();
}

describe('issue #337 Y40 — the keyed-GM registry write is refused when a GM pastes a key', () => {
  it('the GM who pasted the key is warned and told; a reload (the ready-time advertise) registers it', async () => {
    expectConsoleError(/API key|Scene query|not configured/);   // the keyless author's @scene, below
    const refused = failWrites(table, registryWrite);

    await table.client('gm-2').setSetting('claudeApiKey', 'sk-ant-gus');
    await table.settle();

    expect(refused.refused).toBe(1);
    expect(registry()).not.toContain('gm-2');               // the world never listed gm-2 …
    expect(warnedAdvertise()).toBe(true);                    // … and that is said: in the console
    expect(gm2Notices()).toHaveLength(1);                    // … and to the GM who pasted the key
    expect(gm2Notices()[0].message).toMatch(/could not be registered for the table.*reload Foundry/);

    // Until then the table is still keyless: the player's @scene runs on their own client.
    await playerAsksTheScene();
    expect(table.claude.calls.map(c => c.client)).not.toContain('gm-2');

    // What a reload does (the ready hook's advertise), the write accepted this time.
    const { advertiseClaudeKeyPresence } = await table.client('gm-2').import('../../src/multiplayer/gmGate.js');
    await table.client('gm-2').run(() => advertiseClaudeKeyPresence());
    await table.settle();
    expect(registry()).toContain('gm-2');
    table.claude.reset();
    await playerAsksTheScene();
    expect(table.claude.calls.length).toBeGreaterThan(0);
    expect(table.claude.calls.every(c => c.client === 'gm-2')).toBe(true);
  }, 30_000);

  it('a GM who clears their key and whose unregistering is refused is told too', async () => {
    await table.client('gm-2').setSetting('claudeApiKey', 'sk-ant-gus');
    await table.settle();
    expect(registry()).toContain('gm-2');
    failWrites(table, registryWrite);

    await table.client('gm-2').setSetting('claudeApiKey', '');
    await table.settle();

    expect(registry()).toContain('gm-2');                    // still listed as keyed
    expect(warnedAdvertise()).toBe(true);
    expect(gm2Notices()).toHaveLength(1);
    expect(gm2Notices()[0].message).toMatch(/cleared Claude key could not be unregistered/);
  }, 30_000);

  it("control: with the write accepted the registry lists gm-2, nobody is warned, and the player's @scene runs on its key", async () => {
    await table.client('gm-2').setSetting('claudeApiKey', 'sk-ant-gus');
    await table.settle();
    expect(registry()).toContain('gm-2');
    expect(warnedAdvertise()).toBe(false);
    expect(gm2Notices()).toHaveLength(0);

    await playerAsksTheScene();
    expect(table.claude.calls.length).toBeGreaterThan(0);
    expect(table.claude.calls.every(c => c.client === 'gm-2')).toBe(true);
  }, 30_000);
});
