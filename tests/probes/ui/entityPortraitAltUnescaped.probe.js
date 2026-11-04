/**
 * PROBE — UI-03 ENTITY-PORTRAIT-ALT-UNESCAPED (SAFETY / WRONG-DETAIL)
 * (src/ui/entityPanel.js #renderDetail, lines 478–481:
 *    <img class="entity-portrait" src="${entity.art.dataUri}" alt="${entity.name} portrait">)
 *
 * What the user does: opens an entity's detail view in the Entities panel
 * once it has a portrait. The entity's name is the host document's name: for
 * a detected NPC or ship, the name the narrator's detection pass proposed on
 * the New Entities Detected card and the GM confirmed; for anything, a name
 * a GM typed in the sidebar. A name can hold a double quote (the model
 * proposes names like Vex "the Knife"; a GM pastes one).
 *
 * What happens: issue #325 W26 (PANEL-TEXT-UNESCAPED) escaped every name and
 * field the panel renders — the row name, the detail heading, the fields,
 * the tier details, the dismissed names, every data-* attribute — except
 * this one: the portrait's alt attribute takes the raw name. A name holding
 * `"` closes the attribute and the rest of the name becomes attributes of
 * the <img> (an `onload=` runs on every client that opens the view, the GM's
 * included — the same script-injection surface W26 closed), and even a
 * harmless quote leaves a truncated alt text.
 *
 * What should happen: the name goes into the alt attribute through
 * escapeHtml like every other sink in the panel (W26: "escapeHtml at each
 * site").
 *
 * Controls: the detail heading and the thumbnail row's alt are escaped today.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/ui/entityPortraitAltUnescaped.probe.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StubElement } from '../../helpers/cardDom.js';

vi.mock('../../../src/art/storage.js', () => ({
  loadArtAsset: vi.fn(async (id) => (id === 'art-1' ? { id, b64: 'AAAA', locked: false, regenerationUsed: false } : null)),
  getDataUri:   (asset) => (asset?.b64 ? `data:image/png;base64,${asset.b64}` : null),
}));

import { EntityPanelApp } from '../../../src/ui/entityPanel.js';

const MODULE_ID = 'starforged-companion';
const NAME = 'Vex" onload="alert(1)';

function shipActor(id, name) {
  const flags = { [MODULE_ID]: { ship: { name, type: 'Corvette', portraitId: 'art-1' } } };
  return { id, name, type: 'starship', flags, getFlag: (mod, key) => flags[mod]?.[key], system: {} };
}

let panel;

beforeEach(() => {
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  const actors = [shipActor('ship-1', NAME)];
  game.actors = {
    get: (id) => actors.find(a => a.id === id) ?? null,
    [Symbol.iterator]: () => actors[Symbol.iterator](),
  };
  game.settings._store.set(`${MODULE_ID}.campaignState`, {});
  game.user.isGM = true;
  panel = EntityPanelApp.open();
  panel.rendered = true;
  vi.spyOn(panel, 'render').mockImplementation(() => {});
});

afterEach(() => {
  delete globalThis.document;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

async function renderDetail() {
  await EntityPanelApp.DEFAULT_OPTIONS.actions.selectEntity.call(panel, {}, { dataset: { journalId: 'ship-1' } });
  return panel._renderHTML(await panel._prepareContext({}), {});
}

describe("UI-03 an entity's name in the portrait's alt attribute", () => {
  it('control: the detail heading and the list row show the name as text, escaped', async () => {
    const detail = await renderDetail();
    expect(detail.querySelector('h2.detail-name').textContent).toBe(NAME);

    await EntityPanelApp.DEFAULT_OPTIONS.actions.backToList.call(panel, {}, {});
    const list = await panel._renderHTML(await panel._prepareContext({}), {});
    const thumb = list.querySelector('img.entity-thumb');
    expect(thumb.getAttribute('alt')).toBe(NAME);
    expect(thumb.hasAttribute('onload')).toBe(false);
  });

  it('the portrait <img> keeps the whole name as its alt text and grows no attribute from it', async () => {
    const detail = await renderDetail();
    const img = detail.querySelector('img.entity-portrait');
    expect(img).not.toBeNull();
    // FAILS today: alt is "Vex" and the element carries onload="alert(1) portrait".
    expect.soft(img.hasAttribute('onload')).toBe(false);
    expect.soft(img.getAttribute('alt')).toBe(`${NAME} portrait`);
  });
});
