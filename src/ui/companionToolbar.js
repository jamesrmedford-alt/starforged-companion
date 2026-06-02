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
 */

import { companionToolbarTools } from "./companionToolbarTools.js";
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

  async _renderHTML(context, _options) {
    const root = document.createElement("nav");
    root.className = "sf-companion-toolbar";
    root.setAttribute("aria-label", "Starforged Companion");

    const grip = document.createElement("div");
    grip.className = "sf-companion-toolbar__grip";
    grip.title     = "Starforged Companion — drag to move";
    grip.innerHTML = `<i class="fas fa-meteor"></i>`;
    root.appendChild(grip);

    for (const tool of context.tools) {
      const btn = document.createElement("button");
      btn.type           = "button";
      btn.className      = "sf-companion-toolbar__btn";
      btn.dataset.tool   = tool.key;
      btn.title          = tool.title;
      btn.setAttribute("aria-label", tool.title);
      btn.innerHTML      = `<i class="${tool.icon}"></i>`;
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const open = OPENERS[tool.key];
        if (!open) return;
        try { open(); }
        catch (err) { console.error(`${MODULE_ID} | toolbar '${tool.key}' failed to open:`, err); }
      });
      root.appendChild(btn);
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

  /** Place the toolbar at the saved per-user position, or a sensible default. */
  #restorePosition() {
    let saved = null;
    try { saved = globalThis.game?.settings?.get(MODULE_ID, POSITION_SETTING); }
    catch (err) { console.warn(`${MODULE_ID} | toolbar: could not read saved position:`, err); }
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
      this.setPosition({ left: saved.left, top: saved.top });
    } else {
      this.setPosition({ left: 8, top: 96 });
    }
  }

  /** Drag by the grip; persist the resting position on release. */
  #wireDrag() {
    const grip = this.element?.querySelector(".sf-companion-toolbar__grip");
    if (!grip || grip.dataset.dragWired) return;
    grip.dataset.dragWired = "1";

    let startX = 0, startY = 0, startLeft = 0, startTop = 0, dragging = false;

    const onMove = (ev) => {
      if (!dragging) return;
      this.setPosition({ left: startLeft + (ev.clientX - startX), top: startTop + (ev.clientY - startY) });
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const { left, top } = this.position;
      try { globalThis.game?.settings?.set(MODULE_ID, POSITION_SETTING, { left, top }); }
      catch (err) { console.warn(`${MODULE_ID} | toolbar: could not save position:`, err); }
    };

    grip.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      dragging  = true;
      startX    = ev.clientX;
      startY    = ev.clientY;
      startLeft = this.position.left;
      startTop  = this.position.top;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

  /** Open (or focus) the singleton toolbar. */
  static open() {
    if (!CompanionToolbarApp.#instance) CompanionToolbarApp.#instance = new CompanionToolbarApp();
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
