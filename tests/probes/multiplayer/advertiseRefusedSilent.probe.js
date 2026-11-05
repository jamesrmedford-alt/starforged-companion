/**
 * PROBE — MP-01 ADVERTISE-REFUSED-SILENT (tenth audit, area multiplayer)
 *
 * What the user does: at a two-GM table the lower-id GM (Gina, gm-1) has no
 * Claude key; the second GM (Gus, gm-2) opens Companion Settings → About
 * mid-session and pastes a key. The world refuses the one write that
 * advertises it — the `keyedGmUserIds` registry setting (a server error, a
 * dropped socket: the fault the fault matrix drives, issue #302).
 *
 * What happens: the claudeApiKey setting's onChange is
 * `advertiseClaudeKeyPresence().catch(() => {})` (src/index.js:276) — the
 * refusal is swallowed whole: no console line, no notification. The registry
 * stays empty, so every client keeps computing the keyless gm-1 as the
 * canonical GM (src/multiplayer/gmGate.js:68-88) and `hasKeyedActiveGM()`
 * false (:104-116): a player's `@scene`, `!recap`, `!incite` and every oracle
 * follow-up run on the author's own keyless client (the "Claude API key not
 * configured" fallback), and every move the pipeline runs on gm-1 fails the
 * same way — until a reload re-advertises. Gus pasted a working key and
 * nothing tells either GM why the table is still keyless.
 *
 * What should happen: a refused world write is named to the GM who made it
 * (decisions.md "No silent failures"; the ready-path call at src/index.js:7403
 * already warns "keyed-GM advertise failed"), so the GM can retry (paste the
 * key again) instead of reloading.
 *
 * Control: with the write accepted the registry lists gm-2 and a player's
 * `@scene` is answered on gm-2's key.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/multiplayer/advertiseRefusedSilent.probe.js
 */

/* global getCapturedWarns, expectConsoleError */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude, failWrites } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;
const registryWrite = (w) => w.kind === 'setting' && w.key === `${MODULE_ID}.keyedGmUserIds`;
const registry = () => table.world.getSetting('keyedGmUserIds') ?? [];

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    narratorSessionSummary: false, chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'adv-s1', currentSceneId: 'adv-scene', sceneTruths: [] },
  } } });
});

describe('MP-01 the keyed-GM registry write is refused when a GM pastes a key', () => {
  it('the GM who pasted the key is told the registry write failed', async () => {
    expectConsoleError(/API key|Scene query|not configured/);
    const refused = failWrites(table, registryWrite);

    await table.client('gm-2').setSetting('claudeApiKey', 'sk-ant-gus');
    await table.settle();

    // Sanity: the write was refused once and the world never listed gm-2.
    expect(refused.refused).toBe(1);
    expect(registry()).not.toContain('gm-2');

    const warned   = getCapturedWarns().some(w => /keyed|registry|advertis/i.test(w));
    const notified = table.client('gm-2').notifications.some(n => /key|registry|advertis/i.test(n.message));

    // Consequence: the player's @scene is routed to nobody keyed — the keyless author runs it
    // and gets the "key not configured" fallback; gm-2's working key is never asked.
    scriptClaude(table);
    await table.client('pl-1').chat('@scene what does the hangar smell like?');
    await table.settle();
    expect.soft(table.claude.calls.map(c => c.client)).toEqual(['gm-2']);

    // Expected: a word to the GM — the warning the ready-path call gives, or a notification.
    // Actual: nothing — the onChange swallows the rejection (`.catch(() => {})`).
    expect(warned || notified).toBe(true);
  }, 30_000);

  it('control: with the write accepted the registry lists gm-2 and the player\'s @scene runs on its key', async () => {
    await table.client('gm-2').setSetting('claudeApiKey', 'sk-ant-gus');
    await table.settle();
    expect(registry()).toContain('gm-2');

    scriptClaude(table);
    await table.client('pl-1').chat('@scene what does the hangar smell like?');
    await table.settle();
    expect(table.claude.calls.length).toBeGreaterThan(0);
    expect(table.claude.calls.every(c => c.client === 'gm-2')).toBe(true);
  }, 30_000);
});
