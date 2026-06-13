/**
 * STARFORGED COMPANION
 * src/moves/riderDialog.js — prompt for optional / choice / progress riders.
 *
 * Automatic consequence riders apply silently (consequenceRiders.js). The ones
 * that need a decision — "you may take +1 momentum", "choose one: +1 health or
 * +1 momentum", and progress marks whose track is ambiguous — are collected
 * here so the player resolves them without touching meters by hand
 * (v1.7.x consequence-riders feature). GM-gated by the caller.
 *
 * Pure decision logic lives in consequenceRiders.js; this file only renders
 * the form and reads back the selection, so it stays a thin Foundry shell.
 */

const MODULE_ID = "starforged-companion";

/**
 * Group prompted riders into render groups:
 *   - optional standalone riders → a checkbox each (default checked)
 *   - choiceGroup riders         → a radio set (pick one, or none)
 *   - progress riders            → a track <select> each
 *
 * Exported for unit testing the grouping without a live dialog.
 *
 * @param {Array} prompted
 * @returns {{ optionals: Array, choices: Array<{group:string, options:Array}>, progress: Array }}
 */
export function groupPromptedRiders(prompted) {
  const optionals = [];
  const progress  = [];
  const choiceMap = new Map();

  for (const r of prompted ?? []) {
    if (r.resource === "progress") { progress.push(r); continue; }
    if (r.choiceGroup) {
      if (!choiceMap.has(r.choiceGroup)) choiceMap.set(r.choiceGroup, []);
      choiceMap.get(r.choiceGroup).push(r);
      continue;
    }
    optionals.push(r);            // optional standalone
  }
  const choices = [...choiceMap.entries()].map(([group, options]) => ({ group, options }));
  return { optionals, choices, progress };
}

/**
 * Prompt the player to resolve the prompted riders. Returns the riders to
 * apply (meter riders) plus the progress assignments { rider, trackId }.
 * Resolves to `{ apply: [], progress: [] }` when cancelled or nothing chosen.
 *
 * @param {Array} prompted — optional/choice/progress riders (firing)
 * @param {Array} tracks   — listProgressTracks() output, for progress pickers
 * @returns {Promise<{ apply: Array, progress: Array<{rider:Object, trackId:string}> }>}
 */
export async function promptRiders(prompted, tracks = []) {
  const { optionals, choices, progress } = groupPromptedRiders(prompted);
  if (!optionals.length && !choices.length && !progress.length) {
    return { apply: [], progress: [] };
  }

  const DialogV2 = foundry.applications.api.DialogV2;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const parts = ["<p>Apply these asset effects from the move's outcome?</p>"];

  optionals.forEach((r, i) => {
    parts.push(
      `<div class="form-group"><label>` +
      `<input type="checkbox" name="opt-${i}" checked> ` +
      `${esc(r.label)}${r.assetName ? ` <em>(${esc(r.assetName)})</em>` : ""}` +
      `</label></div>`);
  });

  choices.forEach((c, gi) => {
    const opts = c.options.map((r, oi) =>
      `<label style="display:block"><input type="radio" name="choice-${gi}" value="${oi}"${oi === 0 ? " checked" : ""}> ` +
      `${esc(r.label)}</label>`).join("");
    const assetName = c.options[0]?.assetName;
    parts.push(
      `<div class="form-group"><strong>Choose one${assetName ? ` (${esc(assetName)})` : ""}:</strong>` +
      `${opts}<label style="display:block"><input type="radio" name="choice-${gi}" value="none"> Neither</label></div>`);
  });

  const trackOptions = tracks.map(t =>
    `<option value="${esc(t.id)}">${esc(t.label)} (${esc(t.rank)})</option>`).join("");
  progress.forEach((r, i) => {
    parts.push(
      `<div class="form-group"><label>${esc(r.label)}${r.assetName ? ` <em>(${esc(r.assetName)})</em>` : ""} on track: ` +
      `<select name="prog-${i}"><option value="">— skip —</option>${trackOptions}</select></label></div>`);
  });

  let result = null;
  try {
    result = await DialogV2.wait({
      window:  { title: "✦ Apply asset effects" },
      content: parts.join(""),
      buttons: [
        { action: "apply", label: "Apply", default: true,
          callback: (_ev, btn) => readSelection(btn.form, { optionals, choices, progress }) },
        { action: "skip", label: "Skip all", callback: () => ({ apply: [], progress: [] }) },
      ],
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | riderDialog: prompt failed:`, err?.message ?? err);
    return { apply: [], progress: [] };
  }
  return result ?? { apply: [], progress: [] };
}

function readSelection(form, { optionals, choices, progress }) {
  const apply = [];
  const progressOut = [];
  if (!form) return { apply, progress: progressOut };

  optionals.forEach((r, i) => {
    if (form.querySelector(`[name="opt-${i}"]`)?.checked) apply.push(r);
  });
  choices.forEach((c, gi) => {
    const val = form.querySelector(`[name="choice-${gi}"]:checked`)?.value;
    if (val != null && val !== "none") {
      const chosen = c.options[Number(val)];
      if (chosen) apply.push(chosen);
    }
  });
  progress.forEach((r, i) => {
    const trackId = form.querySelector(`[name="prog-${i}"]`)?.value;
    if (trackId) progressOut.push({ rider: r, trackId });
  });
  return { apply, progress: progressOut };
}
