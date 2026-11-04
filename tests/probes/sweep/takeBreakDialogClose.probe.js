/**
 * PROBE — SWEEP-06 TAKE-BREAK-X-CLOSE-REJECTS (sweep auditor, family 6: dialogs
 * that must settle on close; rules/foundry-api.md "Prefer the framework
 * primitives … DialogV2.wait rejects on close") — (Foundry)
 *
 * What the user does: types `!break` (or presses Take a Break on the Session
 * Panel) and then dismisses the dialog with the window X or Escape.
 *
 * What happens: openTakeABreakDialog (src/safety/sessionDialogs.js:207-228)
 * awaits `DialogV2.wait({ buttons })` with no `rejectClose: false` and no
 * try/catch. Foundry v13's `DialogV2.wait` rejects the promise when the dialog
 * is closed without a button press (`rejectClose` defaults to true for
 * `wait`; the repo passes `rejectClose: false` explicitly to its other
 * primitive calls in src/factContinuity/correctionDialog.js:80 and :281). The
 * rejection escapes: from `!break` the route's `run` rejects and
 * dispatchChatCommand logs "!break command failed" (src/multiplayer/commandRouting.js:67);
 * from the Session Panel the action handler's promise rejects unhandled.
 * The `!break` handler's own `if (choice === "cancel" || !choice) return;`
 * shows the dismissal was meant to be a cancel.
 *
 * What should happen: an X / Escape close is a cancel — nothing recorded,
 * nothing posted, no error.
 *
 * Controls: the Cancel button is a cancel; "Move on" relays `session.takeBreak`
 * and posts the Take a Break card.
 *
 * (Foundry) — the rejection on close is Foundry's documented DialogV2.wait
 * behaviour, which the offline harness cannot exercise; the probe stands in
 * for it with a rejecting `wait`.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sweep/takeBreakDialogClose.probe.js
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/multiplayer/gmRelay.js", async (importOriginal) => ({
  ...(await importOriginal()),
  requestGmAction: vi.fn(async () => ({ ok: true, relayed: false, result: undefined })),
}));

import { openTakeABreakDialog } from "../../../src/safety/sessionDialogs.js";
import { requestGmAction } from "../../../src/multiplayer/gmRelay.js";

const MODULE_ID = "starforged-companion";
let wait;

beforeEach(() => {
  wait = vi.fn();
  foundry.applications.api.DialogV2 = { wait, prompt: vi.fn(), confirm: vi.fn() };
  ChatMessage._reset();
  requestGmAction.mockClear();
});

describe("PROBE SWEEP-06 TAKE-BREAK-X-CLOSE-REJECTS", () => {
  it("dismissing Take a Break with the window X / Escape is a cancel: nothing recorded, nothing posted, no rejection", async () => {
    // Foundry v13 DialogV2.wait, rejectClose default: a close without a button rejects.
    wait.mockRejectedValue(new Error("Dialog was dismissed without pressing a button."));
    // Expected: resolves (a cancel). Today: the rejection escapes to the caller.
    await expect(openTakeABreakDialog()).resolves.toBeUndefined();
    expect(requestGmAction).not.toHaveBeenCalled();
    expect(ChatMessage._created.filter(c => c.flags?.[MODULE_ID]?.takeBreakCard)).toHaveLength(0);
  });

  it("control: the Cancel button records nothing and posts nothing", async () => {
    wait.mockResolvedValue("cancel");
    await expect(openTakeABreakDialog()).resolves.toBeUndefined();
    expect(requestGmAction).not.toHaveBeenCalled();
    expect(ChatMessage._created).toHaveLength(0);
  });

  it("control: Move on relays session.takeBreak and posts the Take a Break card", async () => {
    wait.mockResolvedValue("move_on");
    await openTakeABreakDialog();
    expect(requestGmAction).toHaveBeenCalledWith("session.takeBreak", {});
    expect(ChatMessage._created.filter(c => c.flags?.[MODULE_ID]?.takeBreakCard)).toHaveLength(1);
  });
});
