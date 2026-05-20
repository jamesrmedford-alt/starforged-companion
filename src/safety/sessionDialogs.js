/**
 * STARFORGED COMPANION
 * src/safety/sessionDialogs.js
 *
 * DialogV2-backed flows for the three session-level moves whose play-kit
 * mechanics are entirely narrative + a choice menu:
 *
 *   Set a Flag         (play kit p. 1) — declare content to approach
 *                       mindfully so later moves can Change Your Fate.
 *   Change Your Fate   (play kit p. 1) — pick one or more of five options
 *                       (Reframe, Refocus, Replace, Redirect, Reshape) and
 *                       envision how the situation shifts.
 *   Take a Break       (play kit p. 1) — choose Move on (+1 on next non-
 *                       progress move) or Stop for now (End a Session).
 *
 * State writes are minimal and GM-gated. Flags are appended to a per-world
 * `safetyFlags` array on campaignState; Take a Break's "+1 next move" is
 * recorded as a single-use `nextMoveAdd` so the move pipeline can consume it
 * (consumption is a follow-up — for now it's a record players can reference).
 */

const MODULE_ID = "starforged-companion";


// ─────────────────────────────────────────────────────────────────────────────
// Set a Flag
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open the Set a Flag dialog. Anyone may invoke; the GM may pin a flag
 * publicly, a player may keep it private.
 */
export async function openSetFlagDialog() {
  const { DialogV2 } = foundry.applications.api;

  const content = `
    <form class="sf-set-flag-form">
      <p class="hint">Describe content to approach mindfully. Future scenes
      that touch this content can be revisited via Change Your Fate.</p>
      <label>
        <span>Flag</span>
        <textarea name="text" rows="3" maxlength="500" required></textarea>
      </label>
      <label>
        <span>Visibility</span>
        <select name="visibility">
          <option value="public">Public — visible to the table</option>
          <option value="private">Private — only the GM</option>
        </select>
      </label>
    </form>
  `;

  await DialogV2.prompt({
    window:  { title: "Set a Flag" },
    content,
    ok: {
      label:    "Set Flag",
      callback: async (_event, button) => {
        const form = button.form;
        const text = form?.querySelector('textarea[name="text"]')?.value.trim();
        if (!text) return;

        const visibility = form.querySelector('select[name="visibility"]')?.value ?? "public";
        await persistFlag({ text, visibility });
      },
    },
  });
}

async function persistFlag({ text, visibility }) {
  // Only the GM can write to world-scoped campaignState. Players posting a
  // flag still get a chat card so the table can react, but the persistent
  // record only lands when a GM is present.
  if (game.user?.isGM) {
    const state = game.settings.get(MODULE_ID, "campaignState") ?? {};
    state.safetyFlags ??= [];
    state.safetyFlags.push({
      _id:        foundry.utils.randomID(),
      text,
      visibility,
      createdBy:  game.user?.name ?? "unknown",
      createdAt:  new Date().toISOString(),
    });
    await game.settings.set(MODULE_ID, "campaignState", state);
  }

  const whisper = visibility === "private"
    ? (game.users?.filter?.(u => u.isGM)?.map(u => u.id) ?? [])
    : null;

  await ChatMessage.create({
    content: `<div class="sf-safety-card"><strong>Flag set</strong><p>${escapeHtml(text)}</p>${visibility === "private" ? '<p class="muted"><em>Private — GM only</em></p>' : ""}</div>`,
    flags:   { [MODULE_ID]: { safetyFlagCard: true } },
    whisper: whisper ?? undefined,
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// Change Your Fate
// ─────────────────────────────────────────────────────────────────────────────

const FATE_OPTIONS = [
  { id: "reframe",  label: "Reframe",  hint: "Envision the moment from another perspective that diminishes or changes the content." },
  { id: "refocus",  label: "Refocus",  hint: "Envision how the spotlight shifts to change the focus." },
  { id: "replace",  label: "Replace",  hint: "Switch out an element and envision how this new detail changes the scenario." },
  { id: "redirect", label: "Redirect", hint: "Envision how another person or party becomes involved." },
  { id: "reshape",  label: "Reshape",  hint: "Envision what happens instead — the situation changes completely." },
];

/**
 * Open the Change Your Fate dialog. Anyone may invoke; posts a public
 * chat card listing the chosen options + the player's framing.
 */
export async function openChangeYourFateDialog() {
  const { DialogV2 } = foundry.applications.api;

  const optionRows = FATE_OPTIONS.map(o => `
    <label class="fate-option">
      <input type="checkbox" name="fate-${o.id}" value="${o.id}">
      <span class="fate-label"><strong>${o.label}</strong> — ${o.hint}</span>
    </label>
  `).join("");

  const content = `
    <form class="sf-change-fate-form">
      <p class="hint">Choose as many options as appropriate. Then envision how
      the situation shifts.</p>
      ${optionRows}
      <label>
        <span>How it changes (optional)</span>
        <textarea name="framing" rows="3" maxlength="500"></textarea>
      </label>
    </form>
  `;

  await DialogV2.prompt({
    window:  { title: "Change Your Fate" },
    content,
    ok: {
      label:    "Change Fate",
      callback: async (_event, button) => {
        const form = button.form;
        if (!form) return;

        const chosen = FATE_OPTIONS
          .filter(o => form.querySelector(`input[name="fate-${o.id}"]`)?.checked)
          .map(o => o.label);
        if (chosen.length === 0) return;

        const framing = form.querySelector('textarea[name="framing"]')?.value.trim() ?? "";
        await postChangeFateCard(chosen, framing);
      },
    },
  });
}

async function postChangeFateCard(chosen, framing) {
  const framingBlock = framing
    ? `<p>${escapeHtml(framing)}</p>`
    : "";
  await ChatMessage.create({
    content: `<div class="sf-safety-card"><strong>Change Your Fate</strong><p><em>${chosen.join(", ")}</em></p>${framingBlock}</div>`,
    flags:   { [MODULE_ID]: { safetyFateCard: true } },
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// Take a Break
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open the Take a Break dialog. Posts a chat card with the chosen option;
 * "Move on" sets a single-use `nextMoveAdd` flag on campaignState that the
 * move pipeline can consume to grant +1 on the next non-progress move.
 * "Stop for now" surfaces End a Session as a follow-up prompt (also wired
 * via openEndSessionDialog).
 */
export async function openTakeABreakDialog() {
  const { DialogV2 } = foundry.applications.api;

  const choice = await DialogV2.wait({
    window:  { title: "Take a Break" },
    content: `
      <p class="hint">Reflect on what just happened and how it made you feel.
      Then choose:</p>
      <ul>
        <li><strong>Move on</strong> — you or an ally takes +1 on the next move
            (not a progress move).</li>
        <li><strong>Stop for now</strong> — End a Session.</li>
      </ul>
    `,
    buttons: [
      { action: "move_on", label: "Move on",      default: true },
      { action: "stop",    label: "Stop for now" },
      { action: "cancel",  label: "Cancel" },
    ],
  });

  if (choice === "cancel" || !choice) return;

  if (choice === "move_on") {
    if (game.user?.isGM) {
      const state = game.settings.get(MODULE_ID, "campaignState") ?? {};
      state.nextMoveAdd = { value: 1, source: "take_a_break", setAt: new Date().toISOString() };
      await game.settings.set(MODULE_ID, "campaignState", state);
    }
    await ChatMessage.create({
      content: `<div class="sf-safety-card"><strong>Take a Break</strong><p>You move on, bolstered by reflection. Take <strong>+1 on the next move</strong> (not a progress move).</p></div>`,
      flags:   { [MODULE_ID]: { takeBreakCard: true } },
    });
    return;
  }

  // Stop for now → end session.
  const { openEndSessionDialog } = await import("./sessionLifecycleDialogs.js");
  await openEndSessionDialog();
}


// ─────────────────────────────────────────────────────────────────────────────
// HTML escaping
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
