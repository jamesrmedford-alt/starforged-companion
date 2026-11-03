/**
 * STARFORGED COMPANION
 * tests/unit/noCloseWorldHook.test.js
 *
 * The module registers no `closeWorld` hook (issue #326 D7).
 *
 * `Hooks.once("closeWorld")` ended the active scene and stamped
 * `lastSessionTimestamp` on world close. Foundry documents no such hook —
 * the repo's API reference listed it from a community source — and nothing
 * in the system or the tests exercised it, so the handler was dead code (and
 * a stale whole-state write, CLOSEWORLD-STALE-WRITE, if it ever ran).
 * Decided: delete it and its mentions. A scene left open at a reload closes
 * at End Session or the idle re-mint (rules/narrator-memory.md §6).
 */

import { describe, it, expect } from "vitest";
import { productionSources } from "../helpers/sourceScan.js";

describe("no closeWorld hook (issue #326 D7)", () => {
  it("no production module registers one", () => {
    const offenders = productionSources()
      .filter(({ text }) => /Hooks\.(?:on|once)\(\s*["'`]closeWorld["'`]/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("control: the scan sees the hooks the module does register", () => {
    const ready = productionSources().filter(({ text }) => /Hooks\.once\(\s*["'`]ready["'`]/.test(text));
    expect(ready.length).toBeGreaterThan(0);
  });
});
