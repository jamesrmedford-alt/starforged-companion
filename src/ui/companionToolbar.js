/**
 * src/ui/companionToolbar.js
 *
 * A floating, always-visible, draggable launcher for the Companion's panels.
 *
 * Replaces the old scene-controls control group (F16). That group was backed by
 * a canvas InteractionLayer, and Foundry can only activate a control group when
 * the canvas is ready — so with no active scene (canvas.ready === false, the
 * normal state for theater-of-the-mind play) the whole group, and every button
 * in it, was inert. This toolbar is a frameless ApplicationV2 pinned to the
 * viewport, so it works with or without a scene loaded. See docs/decisions.md.
 *
 * It always stays inside the viewport (issue #293). In the compact layout
 * (layoutMode.js) it folds behind one launcher button: tap it for a labelled
 * tool list, drag it to move the toolbar.
 */

import { companionToolbarTools, clampToViewport } from "./companionToolbarTools.js";
import { isCompactLayout, onLayoutChange } from "./layoutMode.js";
import { openSessionPanel }      from "./sessionPanel.js";
import { openProgressTracks }    from "./progressTracks.js";
import { openEntityPanel }       from "./entityPanel.js";
import { openChroniclePanel }    from "../character/chroniclePanel.js";
import { openClocksPanel }       from "../clocks/clocks.js";
import { openPrivateChannel, isPrivateChannelEnabled } from "../private-channel/index.js";
import { openSettingsPanel }     from "./settingsPanel.js";
import { openSectorCreator }     from "../sectors/sectorPanel.js";
import { openWorldJournalPanel } from "../world/worldJournalPanel.js";
import { openSystemTruthsDialog } from "../truths/generator.js";
import { openCustomOraclesPanel } from "../oracles/customOracles.js";

const { ApplicationV2 } = foundry.applications.api;

const MODULE_ID        = "starforged-companion";
const POSITION_SETTING = "companionToolbarPosition";
/** Movement under this many px on the grip is a tap, not a drag. */
const DRAG_THRESHOLD_PX = 6;

/** Maps a tool key (from companionToolbarTools) to the function that opens its panel. */
const OPENERS = {
  sfSession:        openSessionPanel,
  progressTracks:   openProgressTracks,
  entityPanel:      openEntityPanel,
  chronicle:        openChroniclePanel,
  clocks:           openClocksPanel,
  sfPrivateChannel: openPrivateChannel,
  sfSettings:       openSettingsPanel,
  sectorCreator:    openSectorCreator,
  worldJournal:     openWorldJournalPanel,
  worldTruths:      openSystemTruthsDialog,
  customOracles:    openCustomOraclesPanel,
};

/**
 * Register the per-user setting that remembers where the toolbar was dragged.
 * Client-scoped so each player positions their own launcher. Call from `init`.
 */
export function registerCompanionToolbarSettings() {
  game.settings.register(MODULE_ID, POSITION_SETTING, {
    name:    "Companion Toolbar Position",
    hint:    "Where you dragged the floating Companion launcher. Stored per-user.",
    scope:   "client",
    config:  false,
    type:    Object,
    default: null,
  });
}

export class CompanionToolbarApp extends ApplicationV2 {
  static #instance = null;

  static DEFAULT_OPTIONS = {
    id:      `${MODULE_ID}-toolbar`,
    classes: [MODULE_ID, "sf-companion-toolbar-app"],
    tag:     "div",
    // Frameless but absolutely positioned, so setPosition() places it in the
    // viewport and there is no window chrome / close button to manage.
    window:   { frame: false, positioned: true },
    position: { width: "auto", height: "auto" },
  };

  async _prepareContext(_options) {
    const isGM = !!globalThis.game?.user?.isGM;
    let privateChannelEnabled = false;
    try { privateChannelEnabled = !!isPrivateChannelEnabled(); }
    catch (err) { console.warn(`${MODULE_ID} | toolbar: private-channel check failed:`, err); }
    return { tools: companionToolbarTools({ isGM, privateChannelEnabled }) };
  }

  /** Whether the compact layout's tool list is open. */
  #menuOpen = false;

  async _renderHTML(context, _options) {
    const compact = isCompactLayout();
    const root = document.createElement("nav");
    root.className = compact ? "sf-companion-toolbar is-compact" : "sf-companion-toolbar";
    root.setAttribute("aria-label", "Starforged Companion");

    // The grip drags the toolbar. In the compact layout it is also the
    // launcher: a tap (no drag) opens the labelled tool list.
    const grip = document.createElement(compact ? "button" : "div");
    grip.className = "sf-companion-toolbar__grip";
    grip.innerHTML = `<i class="fas fa-meteor"></i>`;
    if (compact) {
      grip.type  = "button";
      grip.title = "Starforged Companion — tap for tools, drag to move";
      grip.setAttribute("aria-label", "Starforged Companion tools");
      grip.setAttribute("aria-expanded", String(this.#menuOpen));
    } else {
      grip.title = "Starforged Companion — drag to move";
    }
    root.appendChild(grip);

    let list = root;
    if (compact) {
      list = document.createElement("div");
      list.className = "sf-companion-toolbar__menu";
      list.hidden    = !this.#menuOpen;
      root.appendChild(list);
    }

    for (const tool of context.tools) {
      const btn = document.createElement("button");
      btn.type           = "button";
      btn.className      = "sf-companion-toolbar__btn";
      btn.dataset.tool   = tool.key;
      btn.title          = tool.title;
      btn.setAttribute("aria-label", tool.title);
      btn.innerHTML      = `<i class="${tool.icon}"></i>`;
      if (compact) {
        // A touch screen has no hover tooltips, so every tool is labelled.
        const label = document.createElement("span");
        label.className   = "sf-companion-toolbar__label";
        label.textContent = tool.title;
        btn.appendChild(label);
      }
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (compact) this.#setMenuOpen(false);
        const open = OPENERS[tool.key];
        if (!open) return;
        try { open(); }
        catch (err) { console.error(`${MODULE_ID} | toolbar '${tool.key}' failed to open:`, err); }
      });
      list.appendChild(btn);
    }

    return root;
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = "";
    content.append(result);
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.#restorePosition();
    this.#wireDrag();
  }

  async close(options) {
    this.#setMenuOpen(false);   // drops the outside-tap listener
    return super.close(options);
  }

  /** Keep the toolbar inside the viewport, e.g. after a resize or rotation. */
  refit() {
    if (!this.rendered) return;
    this.#placeWithinViewport(this.position.left, this.position.top);
  }

  /** Place the toolbar at the saved per-user position, or a sensible default. */
  #restorePosition() {
    let saved = null;
    try { saved = globalThis.game?.settings?.get(MODULE_ID, POSITION_SETTING); }
    catch (err) { console.warn(`${MODULE_ID} | toolbar: could not read saved position:`, err); }
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
      this.#placeWithinViewport(saved.left, saved.top);
    } else {
      this.#placeWithinViewport(8, 96);
    }
  }

  /** setPosition, kept inside the viewport (issue #293). */
  #placeWithinViewport(left, top) {
    const rect = this.element?.getBoundingClientRect?.();
    const box  = { left, top, width: rect?.width ?? 0, height: rect?.height ?? 0 };
    this.setPosition(clampToViewport(box, { width: window.innerWidth, height: window.innerHeight }));
  }

  /** Open or close the compact tool list, keeping the grown toolbar on screen. */
  #setMenuOpen(open) {
    if (this.#menuOpen === open) return;
    this.#menuOpen = open;
    const menu = this.element?.querySelector(".sf-companion-toolbar__menu");
    if (menu) menu.hidden = !open;
    this.element?.querySelector(".sf-companion-toolbar__grip")?.setAttribute("aria-expanded", String(open));
    if (open) {
      document.addEventListener("pointerdown", this.#onOutsidePointer, true);
      this.refit();
    } else {
      document.removeEventListener("pointerdown", this.#onOutsidePointer, true);
    }
  }

  /** A tap outside the toolbar closes the compact tool list. */
  #onOutsidePointer = (ev) => {
    if (this.element?.contains(ev.target)) return;
    this.#setMenuOpen(false);
  };

  /**
   * Drag by the grip and persist the resting position on release. On the
   * compact launcher, a tap (moving less than DRAG_THRESHOLD_PX) toggles the
   * tool list instead.
   */
  #wireDrag() {
    const grip = this.element?.querySelector(".sf-companion-toolbar__grip");
    if (!grip || grip.dataset.dragWired) return;
    grip.dataset.dragWired = "1";

    let pointerId = null, startX = 0, startY = 0, startLeft = 0, startTop = 0, moved = false;

    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      pointerId = null;
    };
    const savePosition = () => {
      const { left, top } = this.position;
      try { globalThis.game?.settings?.set(MODULE_ID, POSITION_SETTING, { left, top }); }
      catch (err) { console.warn(`${MODULE_ID} | toolbar: could not save position:`, err); }
    };
    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      moved = true;
      this.#placeWithinViewport(startLeft + dx, startTop + dy);
    };
    const onUp = (ev) => {
      if (ev.pointerId !== pointerId) return;
      stop();
      if (moved) savePosition();
      else if (isCompactLayout()) this.#setMenuOpen(!this.#menuOpen);
    };
    const onCancel = (ev) => {
      if (ev.pointerId !== pointerId) return;
      stop();
      if (moved) savePosition();
    };

    grip.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      pointerId = ev.pointerId;
      moved     = false;
      startX    = ev.clientX;
      startY    = ev.clientY;
      startLeft = this.position.left;
      startTop  = this.position.top;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    });
    // Keyboard activation (Enter / Space) clicks with no pointer events.
    grip.addEventListener("click", (ev) => {
      if (ev.detail === 0 && isCompactLayout()) this.#setMenuOpen(!this.#menuOpen);
    });
  }

  /** Open (or focus) the singleton toolbar. */
  static open() {
    if (!CompanionToolbarApp.#instance) {
      CompanionToolbarApp.#instance = new CompanionToolbarApp();
      // Re-render on a change of layout; on any other resize or rotation,
      // just keep the toolbar on screen.
      onLayoutChange((_layout, changed) => {
        const app = CompanionToolbarApp.#instance;
        if (!app?.rendered) return;
        if (changed) app.render();
        else app.refit();
      });
    }
    CompanionToolbarApp.#instance.render({ force: true });
    return CompanionToolbarApp.#instance;
  }

  /** Re-render if open — call when tool visibility may have changed (e.g. settings). */
  static rerenderIfOpen() {
    if (CompanionToolbarApp.#instance?.rendered) CompanionToolbarApp.#instance.render();
  }
}

/** Show the floating Companion launcher. Call from the `ready` hook. */
export function openCompanionToolbar() {
  CompanionToolbarApp.open();
}
