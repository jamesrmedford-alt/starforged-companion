// STARFORGED COMPANION
// tests/unit/entityPortraitAltEscaped.test.js
//
// An entity's name in its portrait's alt attribute is escaped (issue #331 X57).
//
// Issue #325 W26 escaped every name and field the Entities panel renders —
// except the detail view's portrait, whose alt took the raw name. A name
// holding a double quote (a detected NPC the GM confirmed as Vex "the Knife",
// a pasted name) closed the attribute, and the rest of the name became
// attributes of the <img>: an `onload=` ran on every client that opened the
// view, the GM's included, and even a harmless quote truncated the alt text.
// The name (and the image's data URI, as the list row's thumbnail has it)
// now goes through escapeHtml like every other sink in the panel.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StubElement } from '../helpers/cardDom.js';

vi.mock('../../src/art/storage.js', () => ({
  loadArtAsset: vi.fn(async (id) => (id === 'art-1' ? { id, b64: 'AAAA', locked: false, regenerationUsed: false } : null)),
  getDataUri:   (asset) => (asset?.b64 ? `data:image/png;base64,${asset.b64}` : null),
}));

import { EntityPanelApp } from '../../src/ui/entityPanel.js';

const MODULE_ID = 'starforged-companion';

function shipActor(id, name) {
  const flags = { [MODULE_ID]: { ship: { name, type: 'Corvette', portraitId: 'art-1' } } };
  return { id, name, type: 'starship', flags, getFlag: (mod, key) => flags[mod]?.[key], system: {} };
}

let panel, savedActors, savedIsGM;

function seat(name) {
  const actors = [shipActor('ship-1', name)];
  game.actors = {
    get: (id) => actors.find(a => a.id === id) ?? null,
    [Symbol.iterator]: () => actors[Symbol.iterator](),
  };
}

beforeEach(() => {
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  savedActors = game.actors;
  savedIsGM = game.user.isGM;
  game.settings._store.set(`${MODULE_ID}.campaignState`, {});
  game.user.isGM = true;
  panel = EntityPanelApp.open();
  panel.rendered = true;
  vi.spyOn(panel, 'render').mockImplementation(() => {});
});

afterEach(() => {
  delete globalThis.document;
  game.actors = savedActors;
  game.user.isGM = savedIsGM;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

async function renderDetail() {
  await EntityPanelApp.DEFAULT_OPTIONS.actions.selectEntity.call(panel, {}, { dataset: { journalId: 'ship-1' } });
  return panel._renderHTML(await panel._prepareContext({}), {});
}

describe("an entity's name in the portrait's alt attribute (issue #331 X57)", () => {
  it('control: the detail heading and the list row show the name as text, escaped', async () => {
    const NAME = 'Vex" onload="alert(1)';
    seat(NAME);
    const detail = await renderDetail();
    expect(detail.querySelector('h2.detail-name').textContent).toBe(NAME);

    await EntityPanelApp.DEFAULT_OPTIONS.actions.backToList.call(panel, {}, {});
    const list = await panel._renderHTML(await panel._prepareContext({}), {});
    const thumb = list.querySelector('img.entity-thumb');
    expect(thumb.getAttribute('alt')).toBe(NAME);
    expect(thumb.hasAttribute('onload')).toBe(false);
  });

  it('a name that would close the attribute grows no attribute on the portrait, and is its whole alt text', async () => {
    const NAME = 'Vex" onload="alert(1)';
    seat(NAME);
    const img = (await renderDetail()).querySelector('img.entity-portrait');
    expect(img).not.toBeNull();
    expect(img.hasAttribute('onload')).toBe(false);
    expect(img.getAttribute('alt')).toBe(`${NAME} portrait`);
    expect(img.getAttribute('src')).toBe('data:image/png;base64,AAAA');
  });

  it('a plain quoted epithet keeps its whole alt text', async () => {
    seat('Vex "the Knife"');
    const img = (await renderDetail()).querySelector('img.entity-portrait');
    expect(img.getAttribute('alt')).toBe('Vex "the Knife" portrait');
  });
});
