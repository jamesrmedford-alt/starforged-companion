/**
 * src/ui/layoutMode.js
 *
 * Adaptive layout for phones and touch screens (issue #293). Decides, on this
 * device, whether the Companion's own UI uses the compact layout (a small
 * screen) and touch sizing (a finger as the main input), and mirrors the
 * decision as two classes on <body> — `sf-compact` and `sf-touch` — that the
 * stylesheet keys on, so the CSS and the code never disagree about which
 * layout is active. A per-device setting overrides the guess: Automatic (the
 * default), Phone or Desktop. Only the module's UI adapts, with one exception:
 * on a phone, two-finger gestures pass through Foundry's map to the browser
 * (the stylesheet). See docs/decisions.md → "Phone layout".
 */

const MODULE_ID = "starforged-companion";

export const LAYOUT_SETTING = "layoutMode";
export const LAYOUT_MODES = Object.freeze({ AUTO: "auto", PHONE: "phone", DESKTOP: "desktop" });

// Material's window size classes: compact width < 600 dp, compact height < 480 dp.
const COMPACT_WIDTH_PX  = 600;
const COMPACT_HEIGHT_PX = 480;
const RESIZE_DEBOUNCE_MS = 150;

const _listeners = new Set();
let _applied     = null;
let _initialised = false;

/**
 * Decide the layout from what the device reports. Pure.
 *
 * Compact: a viewport under 600 × 480 px (a phone in either orientation, or a
 * narrow desktop window), or a touch screen whose shorter side is under
 * 600 px. The second covers a phone that draws a desktop-width page: its
 * viewport reports about 980 px, but its screen reports the phone's size.
 * Touch: the main input is a finger.
 *
 * @param {object} input
 * @param {string}  [input.mode]           — LAYOUT_MODES value
 * @param {number}  [input.viewportWidth]  — window.innerWidth
 * @param {number}  [input.viewportHeight] — window.innerHeight
 * @param {number}  [input.screenWidth]    — screen.width
 * @param {number}  [input.screenHeight]   — screen.height
 * @param {boolean} [input.coarsePointer]  — matchMedia("(pointer: coarse)")
 * @returns {{ compact: boolean, touch: boolean }}
 */
export function decideLayout({
  mode = LAYOUT_MODES.AUTO,
  viewportWidth, viewportHeight, screenWidth, screenHeight,
  coarsePointer = false,
} = {}) {
  if (mode === LAYOUT_MODES.PHONE)   return { compact: true,  touch: true };
  if (mode === LAYOUT_MODES.DESKTOP) return { compact: false, touch: false };
  const under = (value, limit) => Number.isFinite(value) && value < limit;
  const smallViewport = under(viewportWidth, COMPACT_WIDTH_PX) || under(viewportHeight, COMPACT_HEIGHT_PX);
  const smallScreen   = !!coarsePointer && under(Math.min(screenWidth, screenHeight), COMPACT_WIDTH_PX);
  return { compact: smallViewport || smallScreen, touch: !!coarsePointer };
}

/** @returns {{ compact: boolean, touch: boolean }} the layout last applied (desktop before init). */
export function currentLayout() {
  return _applied ?? { compact: false, touch: false };
}

/** @returns {boolean} whether the Companion's UI is in the compact layout. */
export function isCompactLayout() {
  return currentLayout().compact;
}

/**
 * Call `listener(layout, changed)` after every re-check: on a change of
 * layout (`changed` true), and on every resize or rotation (`changed` false),
 * so floating UI can stay inside the viewport.
 * @param {(layout: {compact: boolean, touch: boolean}, changed: boolean) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onLayoutChange(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

/** What this device reports. */
function measureDevice() {
  const win = globalThis.window;
  return {
    viewportWidth:  win?.innerWidth,
    viewportHeight: win?.innerHeight,
    screenWidth:    win?.screen?.width,
    screenHeight:   win?.screen?.height,
    coarsePointer:  !!win?.matchMedia?.("(pointer: coarse)")?.matches,
  };
}

/** The per-device setting; Automatic when it can't be read. */
function readMode() {
  try {
    return game.settings.get(MODULE_ID, LAYOUT_SETTING) ?? LAYOUT_MODES.AUTO;
  } catch (err) {
    console.warn(`${MODULE_ID} | layout: could not read the Layout setting, using Automatic:`, err);
    return LAYOUT_MODES.AUTO;
  }
}

/**
 * Re-check the layout, set the <body> classes and tell the listeners.
 * @returns {{ compact: boolean, touch: boolean }}
 */
export function applyLayout() {
  const layout  = decideLayout({ ...measureDevice(), mode: readMode() });
  const changed = !_applied || _applied.compact !== layout.compact || _applied.touch !== layout.touch;
  _applied = layout;
  const classes = globalThis.document?.body?.classList;
  classes?.toggle("sf-compact", layout.compact);
  classes?.toggle("sf-touch", layout.touch);
  for (const listener of [..._listeners]) {
    try { listener(layout, changed); }
    catch (err) { console.warn(`${MODULE_ID} | layout listener failed:`, err); }
  }
  return layout;
}

/** A one-line description of what Automatic sees on this device, for the setting hint. */
function describeDevice() {
  const m = measureDevice();
  if (!Number.isFinite(m.viewportWidth)) return "";
  const auto  = decideLayout({ ...m, mode: LAYOUT_MODES.AUTO });
  const shape = auto.compact ? "compact" : "full";
  const input = m.coarsePointer ? "touch" : "mouse";
  return ` On this device Automatic chooses the ${shape} layout, ${input} sizing` +
    ` (page ${m.viewportWidth} × ${m.viewportHeight} px, screen ${m.screenWidth} × ${m.screenHeight} px).`;
}

/** Register the per-device Layout setting. Call from `init`. */
export function registerLayoutSettings() {
  game.settings.register(MODULE_ID, LAYOUT_SETTING, {
    name:    "Layout",
    hint:    "How the Companion's own windows, toolbar and buttons are laid out on this device. " +
      "Automatic switches to a compact, touch-friendly layout on a phone-sized or touch screen; " +
      "Phone and Desktop force one or the other. On a phone, two fingers also pinch-zoom and pan the page " +
      "over Foundry's map. A per-device setting; Foundry's own UI is otherwise unchanged." +
      describeDevice(),
    scope:   "client",
    config:  true,
    type:    String,
    choices: {
      [LAYOUT_MODES.AUTO]:    "Automatic",
      [LAYOUT_MODES.PHONE]:   "Phone",
      [LAYOUT_MODES.DESKTOP]: "Desktop",
    },
    default:  LAYOUT_MODES.AUTO,
    onChange: () => applyLayout(),
  });
}

/**
 * Apply the layout now and re-check it on every resize, rotation or change of
 * pointer (a tablet's keyboard docking, say). Call from `ready`, before the
 * toolbar opens. Idempotent.
 */
export function initLayoutMode() {
  applyLayout();
  if (_initialised) return;
  const win = globalThis.window;
  if (!win?.addEventListener) return;
  _initialised = true;
  let timer = null;
  win.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(applyLayout, RESIZE_DEBOUNCE_MS);
  });
  // A matchMedia without change events still gets re-checked on resize.
  win.matchMedia?.("(pointer: coarse)")?.addEventListener?.("change", () => applyLayout());
}

/** Test seam — forget the applied layout, listeners and init state. */
export function _resetLayoutModeForTests() {
  _listeners.clear();
  _applied     = null;
  _initialised = false;
}
