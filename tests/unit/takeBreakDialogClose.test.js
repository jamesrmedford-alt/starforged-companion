/**
 * STARFORGED COMPANION
 * tests/unit/takeBreakDialogClose.test.js
 *
 * Issue #331 X43 (TAKE-BREAK-X-CLOSE-REJECTS). `!break` (or the Session
 * panel's Take a Break) opened DialogV2.wait({ buttons }) with no
 * `rejectClose: false` and no try/catch; Foundry v13's wait() rejects when the
 * window is closed without a button (its default), and the rejection escaped:
 * `!break`'s route logged "!break command failed", the panel's action
 * rejected unhandled. The handler's own `if (choice === "cancel" || !choice)
 * return;` shows a dismissal was meant to be a cancel.
 *
 * (Foundry) the offline harness has no DialogV2: `wait` here does what
 * Foundry's does — rejects a dismissal unless the caller passed
 * `rejectClose: false`, which resolves it null.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/multiplayer/gmRelay.js", async (importOriginal) => ({
  ...(await importOriginal()),
  requestGmAction: vi.fn(async () => ({ ok: true, relayed: false, result: undefined })),
}));

import { openTakeABreakDialog } from "../../src/safety/sessionDialogs.js";
import { requestGmAction } from "../../src/multiplayer/gmRelay.js";

const MODULE_ID = "starforged-companion";
let wait;

/** DialogV2.wait as Foundry v13 has it: `pressed` a button's action, or null for × / Escape. */
const foundryWait = (pressed) => async (opts = {}) => {
  if (pressed !== null) return pressed;
  if (opts.rejectClose === false) return null;
  throw new Error("Dialog was dismissed without pressing a button.");
};

beforeEach(() => {
  wait = vi.fn();
  foundry.applications.api.DialogV2 = { wait, prompt: vi.fn(), confirm: vi.fn() };
  ChatMessage._reset();
  requestGmAction.mockClear();
});

describe("X43 — Take a Break closed with × or Escape is a cancel", () => {
  it("dismissed: nothing recorded, nothing posted, no rejection", async () => {
    wait.mockImplementation(foundryWait(null));
    await expect(openTakeABreakDialog()).resolves.toBeUndefined();
    expect(wait).toHaveBeenCalledWith(expect.objectContaining({ rejectClose: false }));
    expect(requestGmAction).not.toHaveBeenCalled();
    expect(ChatMessage._created.filter(c => c.flags?.[MODULE_ID]?.takeBreakCard)).toHaveLength(0);
  });

  it("control: the Cancel button records nothing and posts nothing", async () => {
    wait.mockImplementation(foundryWait("cancel"));
    await expect(openTakeABreakDialog()).resolves.toBeUndefined();
    expect(requestGmAction).not.toHaveBeenCalled();
    expect(ChatMessage._created).toHaveLength(0);
  });

  it("control: Move on relays session.takeBreak and posts the Take a Break card", async () => {
    wait.mockImplementation(foundryWait("move_on"));
    await openTakeABreakDialog();
    expect(requestGmAction).toHaveBeenCalledWith("session.takeBreak", {});
    expect(ChatMessage._created.filter(c => c.flags?.[MODULE_ID]?.takeBreakCard)).toHaveLength(1);
  });
});
