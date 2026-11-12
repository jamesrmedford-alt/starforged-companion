/**
 * STARFORGED COMPANION
 * tests/unit/chronicleOpenerBringsToFront.test.js
 *
 * CHRONICLE-OPENER-V1-BRING-TO-TOP (issue #345 AA66's sibling). The toolbar's
 * Chronicle button, pressed while the panel was open, called the v1
 * Application's `bringToTop?.()` and returned. An ApplicationV2 window has no
 * `bringToTop`: the press did nothing — the window stayed behind whatever
 * covered it — and, asked for another actor's chronicle, the open one's kept
 * showing. Now the opener does what the World Journal panel's does (AA66):
 * re-render with `force` and `bringToFront`, on the actor asked for.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let ChroniclePanelApp, openChroniclePanel;
let renders, fronts, saved;

beforeEach(async () => {
  vi.resetModules();
  ({ ChroniclePanelApp, openChroniclePanel } = await import('../../src/character/chroniclePanel.js'));
  renders = [];
  fronts = [];
  saved = { user: game.user };
  game.user = { id: 'gm-1', isGM: true, active: true, character: null };
  game.actors._reset();
  game.actors._set('pc-1', makeTestActor({ id: 'pc-1', name: 'Kira' }));
  game.actors._set('pc-2', makeTestActor({ id: 'pc-2', name: 'Ren' }));
  // ApplicationV2 as Foundry has it: render opens the window; bringToFront
  // raises it. There is no v1 bringToTop.
  vi.spyOn(ChroniclePanelApp.prototype, 'render').mockImplementation(function (options) {
    this.rendered = true;
    renders.push({ actorId: this.actorId, force: options?.force === true });
  });
  ChroniclePanelApp.prototype.bringToFront = function () { fronts.push(this.actorId); };
});

afterEach(() => {
  delete ChroniclePanelApp.prototype.bringToFront;
  game.user = saved.user;
  game.actors._reset();
  vi.restoreAllMocks();
});

describe('CHRONICLE-OPENER-V1-BRING-TO-TOP — pressing Chronicle while it is open', () => {
  it('control: the first press opens the panel', () => {
    openChroniclePanel('pc-1');
    expect(renders).toEqual([{ actorId: 'pc-1', force: true }]);
  });

  it('a second press re-renders the open window and brings it to the front', () => {
    openChroniclePanel('pc-1');
    openChroniclePanel('pc-1');
    expect(renders).toEqual([
      { actorId: 'pc-1', force: true },
      { actorId: 'pc-1', force: true },
    ]);
    expect(fronts).toEqual(['pc-1']);
  });

  it("asked for another actor's chronicle while open, it shows that actor's — in the same window", () => {
    openChroniclePanel('pc-1');
    openChroniclePanel('pc-2');
    expect(renders.at(-1)).toEqual({ actorId: 'pc-2', force: true });
    expect(fronts).toEqual(['pc-2']);
  });
});
