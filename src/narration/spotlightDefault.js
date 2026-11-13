/**
 * STARFORGED COMPANION
 * src/narration/spotlightDefault.js — Rotating Spotlight is off by default
 *
 * Issue #354 P2-07. The Rotating Spotlight setting (issue #232) defaulted on,
 * and it counts player characters, not players: at a table of one player
 * running two characters it ended most beats by naming the character who had
 * not just acted. The maintainer asked for it to default off.
 *
 * A default only reaches a world that never stored the setting, and saving the
 * Narrator settings tab stores every field on it — so most worlds hold an
 * explicit "on" the new default would not change. The maintainer's decision
 * (decisions.md → "Issue #354"): each world's stored "on" is switched off
 * once, the GMs are told, and from then on the setting stays as the GM sets
 * it. This module is that one-time switch.
 */

const MODULE_ID = "starforged-companion";

/** The Rotating Spotlight world setting (settingsPanel.js SETTING.NARRATOR_SPOTLIGHT). */
export const SPOTLIGHT_SETTING = "narratorSpotlightRotation";

/** World setting: whether this world's one-time switch-off has run. */
export const SPOTLIGHT_DEFAULT_OFF_APPLIED = "narratorSpotlightDefaultOffApplied";

/**
 * Register the world setting that marks the switch-off done. Called with the
 * Narrator settings' registration (ui/settingsPanel.js registerSettings).
 */
export function registerSpotlightDefaultSetting() {
  game.settings.register(MODULE_ID, SPOTLIGHT_DEFAULT_OFF_APPLIED, {
    scope:   "world",
    config:  false,
    type:    Boolean,
    default: false,
  });
}

/**
 * Switch a stored Rotating Spotlight "on" off, once per world, and tell the
 * GMs. Called by the canonical GM at world load (src/index.js); a world
 * created on this version stores nothing and is only marked.
 *
 * The setting is switched off before the marker is written: a marker with the
 * switch-off refused would leave the stored "on" for good, while a refused
 * marker after it finds the setting already off on the next load and writes
 * no second notice. Never throws.
 *
 * @returns {Promise<{ switchedOff: boolean, marked: boolean }>}
 */
export async function applySpotlightDefaultOff() {
  const result = { switchedOff: false, marked: false };
  try {
    if (!globalThis.game?.user?.isGM) return result;
    if (game.settings.get(MODULE_ID, SPOTLIGHT_DEFAULT_OFF_APPLIED) === true) return result;

    if (game.settings.get(MODULE_ID, SPOTLIGHT_SETTING) === true) {
      await game.settings.set(MODULE_ID, SPOTLIGHT_SETTING, false);
      result.switchedOff = true;
    }
    await game.settings.set(MODULE_ID, SPOTLIGHT_DEFAULT_OFF_APPLIED, true);
    result.marked = true;
  } catch (err) {
    console.warn(`${MODULE_ID} | spotlight default: the one-time switch-off did not finish — it runs again on the next load:`, err?.message ?? err);
    return result;
  }

  if (result.switchedOff) {
    const gmIds = Array.from(game.users ?? []).filter(u => u?.isGM).map(u => u.id);
    await ChatMessage.create({
      content:
        `<div class="sf-ptp-card"><strong>Rotating spotlight is now off</strong>` +
        `<p>Rotating Spotlight is off by default from this version, and it was switched off in this world: ` +
        `with it on, the narrator ended most beats by naming a character. To turn it back on, tick ` +
        `<strong>Rotating spotlight</strong> in Companion Settings → Narrator — it stays as you set it from now on.</p></div>`,
      whisper: gmIds,
      flags:   { [MODULE_ID]: { spotlightDefaultNotice: true } },
    }).catch(err => console.warn(`${MODULE_ID} | spotlight default: the notice could not be posted:`, err?.message ?? err));
  }
  return result;
}
