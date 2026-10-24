/**
 * STARFORGED COMPANION
 * tests/unit/layoutMode.test.js
 *
 * Adaptive layout (issue #293): the decision from what the device reports,
 * the <body> classes the stylesheet keys on, the listeners that keep floating
 * UI on screen, and the per-device override setting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  decideLayout,
  applyLayout,
  currentLayout,
  isCompactLayout,
  onLayoutChange,
  registerLayoutSettings,
  initLayoutMode,
  LAYOUT_SETTING,
  LAYOUT_MODES,
  _resetLayoutModeForTests,
} from "../../src/ui/layoutMode.js";

const MODULE_ID = "starforged-companion";

describe("decideLayout — Automatic", () => {
  const auto = (viewportWidth, viewportHeight, screenWidth, screenHeight, coarsePointer) =>
    decideLayout({ mode: "auto", viewportWidth, viewportHeight, screenWidth, screenHeight, coarsePointer });

  it("a Pixel in portrait is compact and touch", () => {
    expect(auto(412, 915, 412, 915, true)).toEqual({ compact: true, touch: true });
  });

  it("a Pixel in landscape is compact (short height) and touch", () => {
    expect(auto(915, 412, 915, 412, true)).toEqual({ compact: true, touch: true });
  });

  it("a phone drawing a desktop-width page is still compact, from its screen size", () => {
    expect(auto(980, 2176, 412, 915, true)).toEqual({ compact: true, touch: true });
  });

  it("a tablet in landscape gets touch sizing but the full layout", () => {
    expect(auto(1280, 800, 1280, 800, true)).toEqual({ compact: false, touch: true });
  });

  it("a desktop is neither", () => {
    expect(auto(1920, 1080, 1920, 1080, false)).toEqual({ compact: false, touch: false });
  });

  it("a narrow desktop window is compact, with mouse sizing", () => {
    expect(auto(560, 900, 1920, 1080, false)).toEqual({ compact: true, touch: false });
  });

  it("a short desktop window is compact", () => {
    expect(auto(1400, 460, 1920, 1080, false)).toEqual({ compact: true, touch: false });
  });

  it("missing measurements read as not small", () => {
    expect(decideLayout({})).toEqual({ compact: false, touch: false });
  });
});

describe("decideLayout — override", () => {
  it("Phone forces compact and touch on a desktop", () => {
    expect(decideLayout({ mode: LAYOUT_MODES.PHONE, viewportWidth: 1920, viewportHeight: 1080 }))
      .toEqual({ compact: true, touch: true });
  });

  it("Desktop forces the full layout on a phone", () => {
    expect(decideLayout({
      mode: LAYOUT_MODES.DESKTOP, viewportWidth: 412, viewportHeight: 915,
      screenWidth: 412, screenHeight: 915, coarsePointer: true,
    })).toEqual({ compact: false, touch: false });
  });
});

/** Minimal window / document fakes for the node test environment. */
function fakeDevice({ width, height, screenWidth = width, screenHeight = height, coarse = false }) {
  const classes = new Set();
  const win = Object.assign(new EventTarget(), {
    innerWidth: width,
    innerHeight: height,
    screen: { width: screenWidth, height: screenHeight },
    matchMedia: (query) => Object.assign(new EventTarget(), {
      matches: query === "(pointer: coarse)" ? coarse : false,
    }),
  });
  const doc = {
    body: {
      classList: {
        toggle: (name, on) => { if (on) classes.add(name); else classes.delete(name); return on; },
        contains: (name) => classes.has(name),
      },
    },
  };
  return { win, doc, classes };
}

describe("applyLayout", () => {
  let saved;

  beforeEach(() => {
    _resetLayoutModeForTests();
    saved = { window: globalThis.window, document: globalThis.document };
    game.settings._store.delete(`${MODULE_ID}.${LAYOUT_SETTING}`);
  });

  afterEach(() => {
    globalThis.window   = saved.window;
    globalThis.document = saved.document;
    game.settings._store.delete(`${MODULE_ID}.${LAYOUT_SETTING}`);
  });

  it("sets sf-compact and sf-touch on <body> for a phone", () => {
    const { win, doc, classes } = fakeDevice({ width: 412, height: 915, coarse: true });
    globalThis.window = win;
    globalThis.document = doc;
    expect(applyLayout()).toEqual({ compact: true, touch: true });
    expect([...classes].sort()).toEqual(["sf-compact", "sf-touch"]);
    expect(isCompactLayout()).toBe(true);
  });

  it("clears both classes on a desktop", () => {
    const { win, doc, classes } = fakeDevice({ width: 1920, height: 1080 });
    classes.add("sf-compact");
    classes.add("sf-touch");
    globalThis.window = win;
    globalThis.document = doc;
    applyLayout();
    expect(classes.size).toBe(0);
    expect(currentLayout()).toEqual({ compact: false, touch: false });
  });

  it("follows the per-device setting", () => {
    const { win, doc, classes } = fakeDevice({ width: 1920, height: 1080 });
    globalThis.window = win;
    globalThis.document = doc;
    game.settings._store.set(`${MODULE_ID}.${LAYOUT_SETTING}`, LAYOUT_MODES.PHONE);
    applyLayout();
    expect(classes.has("sf-compact")).toBe(true);
  });

  it("tells listeners whether the layout changed", () => {
    const { win, doc } = fakeDevice({ width: 1920, height: 1080 });
    globalThis.window = win;
    globalThis.document = doc;
    const calls = [];
    onLayoutChange((layout, changed) => calls.push([layout.compact, changed]));
    applyLayout();                 // first apply: a change
    applyLayout();                 // same layout: a resize-only re-check
    win.innerWidth = 412;
    applyLayout();                 // now compact: a change
    expect(calls).toEqual([[false, true], [false, false], [true, true]]);
  });

  it("an unsubscribed listener is not called", () => {
    const { win, doc } = fakeDevice({ width: 1920, height: 1080 });
    globalThis.window = win;
    globalThis.document = doc;
    const listener = vi.fn();
    const off = onLayoutChange(listener);
    off();
    applyLayout();
    expect(listener).not.toHaveBeenCalled();
  });

  it("re-checks after a resize, debounced", async () => {
    vi.useFakeTimers();
    try {
      const { win, doc, classes } = fakeDevice({ width: 1920, height: 1080 });
      globalThis.window = win;
      globalThis.document = doc;
      initLayoutMode();
      expect(classes.has("sf-compact")).toBe(false);
      win.innerWidth = 412;
      win.dispatchEvent(new Event("resize"));
      expect(classes.has("sf-compact")).toBe(false);   // not yet
      vi.advanceTimersByTime(200);
      expect(classes.has("sf-compact")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("registerLayoutSettings", () => {
  let saved;

  beforeEach(() => {
    _resetLayoutModeForTests();
    saved = { window: globalThis.window, document: globalThis.document };
  });

  afterEach(() => {
    globalThis.window   = saved.window;
    globalThis.document = saved.document;
  });

  it("registers a per-device Automatic / Phone / Desktop setting, Automatic by default", () => {
    registerLayoutSettings();
    const config = game.settings._registry.get(`${MODULE_ID}.${LAYOUT_SETTING}`);
    expect(config.scope).toBe("client");
    expect(config.config).toBe(true);
    expect(config.default).toBe("auto");
    expect(Object.keys(config.choices)).toEqual(["auto", "phone", "desktop"]);
  });

  it("describes what Automatic sees on this device in the hint", () => {
    const { win, doc } = fakeDevice({ width: 412, height: 915, coarse: true });
    globalThis.window = win;
    globalThis.document = doc;
    registerLayoutSettings();
    const { hint } = game.settings._registry.get(`${MODULE_ID}.${LAYOUT_SETTING}`);
    expect(hint).toContain("compact layout, touch sizing");
    expect(hint).toContain("page 412 × 915 px");
  });

  it("re-applies the layout when the setting changes", () => {
    const { win, doc, classes } = fakeDevice({ width: 1920, height: 1080 });
    globalThis.window = win;
    globalThis.document = doc;
    registerLayoutSettings();
    const { onChange } = game.settings._registry.get(`${MODULE_ID}.${LAYOUT_SETTING}`);
    game.settings._store.set(`${MODULE_ID}.${LAYOUT_SETTING}`, LAYOUT_MODES.PHONE);
    onChange(LAYOUT_MODES.PHONE);
    expect(classes.has("sf-compact")).toBe(true);
    game.settings._store.delete(`${MODULE_ID}.${LAYOUT_SETTING}`);
  });
});
