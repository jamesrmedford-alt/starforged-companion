/**
 * src/ui/companionToolbarTools.js
 *
 * Pure data + visibility logic for the Companion's floating launcher toolbar.
 * Kept free of any Foundry / UI-module imports so it can be unit-tested in
 * isolation (node/vitest) — the actual panel-opening functions are wired up in
 * companionToolbar.js, which maps each tool `key` to its opener.
 *
 * The launcher used to live in Foundry's scene-controls as a dedicated control
 * group backed by a canvas layer. That surface is inert whenever no scene is
 * active (canvas.ready === false — common for theater-of-the-mind play), which
 * left every button dead. The toolbar now floats independently of the canvas;
 * see docs/decisions.md and companionToolbar.js.
 */

/**
 * Build the ordered list of visible toolbar tools for the current client.
 *
 * @param {object}  ctx
 * @param {boolean} ctx.isGM                  Whether the current user is a GM.
 * @param {boolean} ctx.privateChannelEnabled Whether the Private Channel feature is on.
 * @returns {Array<{key: string, title: string, icon: string}>} visible tools, in display order.
 */
export function companionToolbarTools({ isGM = false, privateChannelEnabled = false } = {}) {
  const all = [
    { key: "sfSession",        title: "Session",             icon: "fas fa-play-circle",  visible: true },
    { key: "progressTracks",   title: "Progress Tracks",     icon: "fas fa-tasks",        visible: true },
    { key: "entityPanel",      title: "Entities",            icon: "fas fa-users",        visible: true },
    { key: "chronicle",        title: "Character Chronicle", icon: "fas fa-book-open",    visible: true },
    { key: "clocks",           title: "Clocks",              icon: "fas fa-clock",        visible: true },
    { key: "sfPrivateChannel", title: "Private Channel",     icon: "fas fa-comment-dots", visible: !!privateChannelEnabled },
    { key: "sfSettings",       title: "Companion Settings",  icon: "fas fa-shield-alt",   visible: true },
    { key: "sectorCreator",    title: "Sector Creator",      icon: "fas fa-map",          visible: !!isGM },
    { key: "worldJournal",     title: "World Journal",       icon: "fas fa-book",         visible: !!isGM },
    { key: "worldTruths",      title: "World Truths",        icon: "fas fa-scroll",       visible: !!isGM },
    { key: "customOracles",    title: "Custom Oracles",      icon: "fas fa-table-list",   visible: !!isGM },
  ];
  return all.filter(t => t.visible).map(({ key, title, icon }) => ({ key, title, icon }));
}
