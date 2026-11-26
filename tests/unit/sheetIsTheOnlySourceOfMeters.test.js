/**
 * STARFORGED COMPANION
 * tests/unit/sheetIsTheOnlySourceOfMeters.test.js
 *
 * PRICE-TOLD-WITH-A-COST-NOT-PAID, the seventh live round (2026-11-26;
 * explorations/long-haul-live-20261126-030646/): a24's pick took no meter, and
 * a25's narration told "your supplies thinned working through it". Its fact
 * block filed "Kobayashi IV: the scan of the ribs turned up something worse,
 * and the effort cost Mira supply" from the result — bound as the dice's — and
 * it came back as a [dice] line and in the recap: a cost the sheet never took.
 *
 * A character's health, spirit, supply and momentum are the sheet's: the fact
 * block's entries that tell one changing are not kept (sheetClaims.js); the
 * rest of the block is.
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isMeterClaim, withoutMeterClaims } from '../../src/factContinuity/sheetClaims.js';
import { extractSidecar } from '../../src/factContinuity/sidecarParser.js';
import { applyNarratorSidecar } from '../../src/narration/narrator.js';
import { startScene } from '../../src/factContinuity/sceneLifecycle.js';

const MODULE_ID = 'starforged-companion';
const ROUND_7 = JSON.parse(fs.readFileSync(path.resolve(__dirname,
  '../../test/ci/playwright/explorations/long-haul-live-20261126-030646/replay.json'), 'utf8'));
const A25 = ROUND_7.recording.exchanges.find(x => x.step === 'a25' && /narrateResolution$/.test(x.kind)).response.content.map(c => c.text ?? '').join('');
const OWNERS = ['Mira Kestrel', 'Kobayashi IV'];

describe('a fact block entry telling a character\'s meter changing', () => {
  it('a25\'s: "the effort cost Mira supply", said of the ship', () => {
    expect(isMeterClaim('Kobayashi IV', 'the scan of the ribs turned up something worse, and the effort cost Mira supply', OWNERS)).toBe(true);
  });
  it('by "you", by name, of their ship, as a state change', () => {
    expect(isMeterClaim('Mira Kestrel', 'her supplies thinned working through the ribs', OWNERS)).toBe(true);
    expect(isMeterClaim('scene', 'your supplies thinned working through it', OWNERS)).toBe(true);
    expect(isMeterClaim('Mira', 'lost her nerve and her spirit is shaken low', OWNERS)).toBe(true);
    expect(isMeterClaim('Mira Kestrel', 'supply running low', OWNERS)).toBe(true);
  });
  it('controls: another\'s supplies, a meter word with no change, a change of something that is no meter', () => {
    expect(isMeterClaim('the clipped hauler', 'its supplies were stripped from the racks', OWNERS)).toBe(false);
    expect(isMeterClaim('Hollow Spire', 'the colony\'s health is failing', OWNERS)).toBe(false);
    expect(isMeterClaim('Mira Kestrel', 'keeps her medical supplies in the aft locker', OWNERS)).toBe(false);
    expect(isMeterClaim('Kobayashi IV', 'her drive housing took a scorch along the flank', OWNERS)).toBe(false);
  });
});

describe('the fact block keeps all but those', () => {
  it('a25\'s block: the supply truth goes; the dead hull\'s truth, its state changes and its frame stay', () => {
    const { sidecar } = extractSidecar(A25);
    const kept = withoutMeterClaims(sidecar, { owners: OWNERS });
    expect(kept.newTruths.map(t => t.subject)).toEqual(['dead hull']);
    expect(kept.stateChanges).toEqual(sidecar.stateChanges);
    expect(kept.sceneFrame).toEqual(sidecar.sceneFrame);
    // No claim: the block as it was.
    const clean = { ...sidecar, newTruths: sidecar.newTruths.slice(1) };
    expect(withoutMeterClaims(clean, { owners: OWNERS })).toBe(clean);
    expect(withoutMeterClaims(null)).toBeNull();
  });
  it('a state change of a character\'s meter goes too', () => {
    const block = { newTruths: [], stateChanges: [{ subject: 'Mira Kestrel', attribute: 'supply', value: 'spent down to the last pack' },
      { subject: 'Mira Kestrel', attribute: 'location', value: 'aboard the dead hull' }] };
    expect(withoutMeterClaims(block, { owners: OWNERS }).stateChanges.map(c => c.attribute)).toEqual(['location']);
  });
});

describe('applied as the narrator applies it — nothing of it reaches the ledger', () => {
  let orig;
  beforeEach(() => {
    orig = { user: global.game.user, users: global.game.users };
    const gmUser = { id: 'gm-1', name: 'Test GM', isGM: true, active: true };
    global.game.users = Object.assign([gmUser], { get: (id) => (id === 'gm-1' ? gmUser : null) });
    global.game.user = gmUser;
    ChatMessage._reset();
    game.settings._store.clear();
    game.actors._reset();
    game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
    game.settings._store.set(`${MODULE_ID}.campaignState`, {
      currentSessionId: 'sess-2', sessionNumber: 2, currentSceneId: null, characterIds: ['pc-mira'],
      sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null, dismissedEntities: [],
    });
  });
  afterEach(() => {
    global.game.user = orig.user;
    global.game.users = orig.users;
  });

  it('a25\'s narration: the dead hull is recorded, the supply cost is not', async () => {
    const stored = () => game.settings.get(MODULE_ID, 'campaignState');
    await startScene(foundry.utils.deepClone(stored()), { reason: 'test' });
    applyNarratorSidecar(A25, foundry.utils.deepClone(stored()), { narrationId: 'nar-a25', mode: 'move_resolution' });
    for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0));
    const facts = (stored().sceneTruths ?? []).map(t => t.fact);
    expect(facts.some(f => /cracked data slate/.test(f))).toBe(true);
    expect(facts.some(f => /supply/.test(f))).toBe(false);
  });
});
