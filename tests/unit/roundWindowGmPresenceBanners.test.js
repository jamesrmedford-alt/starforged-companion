/**
 * STARFORGED COMPANION
 * tests/unit/roundWindowGmPresenceBanners.test.js
 *
 * Issue #342 Z33 (ROUND-WINDOW-GM-BANNER-STALE; the multiplayer auditor's
 * probe, MP-4). The Round window's banners say whether a GM, and a GM with a
 * Claude key, is connected (src/batch/roundView.js ROUND_NOTICES.noGm /
 * noKeyedGm), read live in _prepareContext. But the window re-rendered only
 * when the round, the Batch Mode switch, the draft or campaignState changed —
 * not when a user connected or left, nor when the keyed-GM registry changed:
 * the GM dropped and no window said so; the GM came back and every window
 * that had said so kept saying it. The window now re-renders on
 * `userConnected` and on the registry's write (create or update).
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 't', mischiefApplied: false })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { ROUND_NOTICES } from '../../src/batch/roundView.js';

let table;
const round = () => table.world.getSetting('batchMode.round');

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    // A live session: a GM's page that loads mid-session keeps it.
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [], lastSessionTimestamp: new Date().toISOString() },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => '{}' });
  silenceConsoleErrors();
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
});

/** Pat's Round window (opened by the round), its renders recorded as the window would show them. */
async function patsWindow() {
  const c = table.client('pl-1');
  const mod = await c.import('../../src/ui/roundWindow.js');
  const app = await c.run(() => mod.RoundWindowApp.open());
  const banners = [];
  app.rendered = true;
  app.render = async function render() {
    const ctx = await c.run(() => this._prepareContext({}));
    banners.push(ctx.view.banners.map(b => b.text));
    return this;
  };
  return { app, banners, c };
}

describe('the Round window\'s GM banners follow the GMs (issue #342 Z33)', () => {
  it('control: rendered now, with no GM connected, the window says so', async () => {
    expect(round()).toMatchObject({ phase: 'collecting' });
    const { app, banners } = await patsWindow();
    await table.leave('gm-1');
    try {
      await app.render();
      expect(banners.at(-1)).toContain(ROUND_NOTICES.noGm);
    } finally {
      await table.join('gm-1');
    }
  }, 30_000);

  it('the GM leaves: Pat\'s open window says no GM is connected', async () => {
    const { banners } = await patsWindow();
    await table.leave('gm-1');
    try {
      // A render follows the GM's departure.
      expect(banners.flat()).toContain(ROUND_NOTICES.noGm);
    } finally {
      await table.join('gm-1');
    }
  }, 30_000);

  it('the GM comes back: the "No GM is connected" banner goes', async () => {
    const { app, banners } = await patsWindow();
    await table.leave('gm-1');
    await app.render();
    expect(banners.at(-1)).toContain(ROUND_NOTICES.noGm);
    // The GM's page loads (one back from a dropped connection stands down
    // until it reloads — issue #347 AB19-STALE-CACHE-WRITES).
    await table.reload('gm-1');
    await table.settle();
    await table.drain();
    // The window re-renders without it.
    expect(banners.at(-1)).not.toContain(ROUND_NOTICES.noGm);
  }, 30_000);

  it('the GM\'s Claude key comes and goes (the keyed-GM registry): the "can\'t be read" banner follows it', async () => {
    const { banners } = await patsWindow();
    const last = () => banners.at(-1) ?? [];
    await table.setClaudeKey('gm-1', '');
    await table.settle();
    expect(last()).toContain(ROUND_NOTICES.noKeyedGm);
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    await table.settle();
    expect(last()).not.toContain(ROUND_NOTICES.noKeyedGm);
  }, 30_000);
});
