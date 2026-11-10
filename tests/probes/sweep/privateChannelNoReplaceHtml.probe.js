/**
 * SWP-3 PRIVATE-CHANNEL-WINDOW-RENDERS-NOTHING — twelfth audit (lead), the
 * root two round-2 refuters found under R2T-2. (Foundry: needs one live check.)
 *
 * Foundry's ApplicationV2 renders in two steps: `_renderHTML(context)` builds
 * the result and `_replaceHTML(result, content)` puts it into the window's
 * content element. The base class implements neither — both are hooks "an
 * Application subclass should implement … in order for the Application to be
 * renderable" (foundry-vtt-types 13.346, applications/api/application.d.mts
 * :693-710; HandlebarsApplicationMixin and DialogV2 supply their own). The
 * module's own reference shows the pair as the subclass pattern
 * (docs/foundry-reference/foundry-api-reference.md:72-83), and every other
 * ApplicationV2 window in src/ implements `_replaceHTML`.
 *
 * src/private-channel/app.js:40 PrivateChannelApp extends ApplicationV2
 * directly, builds its element in `_renderHTML` (:132-155) and has no
 * `_replaceHTML`, and nothing else inserts the element (no _onRender, no
 * append). So in a live world the ✦ Private Channel window opens with an
 * empty content area: no transcript, no input, no Send or Publish. The unit
 * harness never notices: tests/setup.js's ApplicationV2 stub `render()` is a
 * no-op, and the Quench Private Channel batch builds the context without
 * opening the window.
 *
 * This probe renders through a faithful model of the base contract — the
 * base `_replaceHTML` does nothing — and asserts the window's content holds
 * the input after `open()`. The control renders another of the module's
 * ApplicationV2 windows (the Clocks panel) the same way.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { StubElement } from "../../helpers/cardDom.js";

const ROOT = path.resolve(__dirname, "../../..");

/** Foundry's two-step render, with the base class's own (empty) _replaceHTML. */
async function renderLikeFoundryBase(app) {
  const context = await app._prepareContext({});
  const result  = await app._renderHTML(context, {});
  const content = document.createElement("section");
  content.className = "window-content";
  const proto = Object.getPrototypeOf(app);
  // Own or inherited from a module class — the stub base defines none, as Foundry's base defines an empty one.
  let replace = null;
  for (let p = proto; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    if (Object.prototype.hasOwnProperty.call(p, "_replaceHTML")) { replace = p._replaceHTML; break; }
  }
  if (replace) replace.call(app, result, content, {});
  return content;
}

describe("SWP-3 the Private Channel window renders its content", () => {
  beforeAll(() => { globalThis.document = { createElement: (tag) => new StubElement(tag) }; });
  afterAll(() => { delete globalThis.document; });

  it("source: every ApplicationV2 window in src/ implements _replaceHTML (Foundry's base does not)", () => {
    const missing = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (p.endsWith(".js") && !p.includes(`${path.sep}integration${path.sep}`)) {
          const src = fs.readFileSync(p, "utf8");
          const direct = /extends\s+(?:foundry\.applications\.api\.)?ApplicationV2\b/.test(src);
          if (direct && !/_replaceHTML\s*\(/.test(src)) missing.push(path.relative(ROOT, p));
        }
      }
    };
    walk(path.join(ROOT, "src"));
    expect(missing, "windows with no _replaceHTML render an empty content area in Foundry").toEqual([]);
  });

  it("the ✦ Private Channel window's content holds the transcript and the input after it opens", async () => {
    const { PrivateChannelApp } = await import("../../../src/private-channel/app.js");
    const app = new PrivateChannelApp({ userId: "pl-1" });
    app.loaded = true;   // skip the saved-transcript read; the render is what is under test
    const content = await renderLikeFoundryBase(app);
    expect(content.querySelector("[data-pc-input]"), "the Private Channel's text box").not.toBeNull();
    expect(content.querySelector('[data-action="send"]'), "the Send button").not.toBeNull();
  });

  it("control: a window that implements _replaceHTML (the reference's pattern) shows its content under the same model", async () => {
    const { PrivateChannelApp } = await import("../../../src/private-channel/app.js");
    class WithReplace extends PrivateChannelApp {
      _replaceHTML(result, content) { content.innerHTML = ""; content.append(result); }
    }
    const app = new WithReplace({ userId: "pl-2" });
    app.loaded = true;
    const content = await renderLikeFoundryBase(app);
    expect(content.querySelector("[data-pc-input]"), "the text box").not.toBeNull();
  });
});
