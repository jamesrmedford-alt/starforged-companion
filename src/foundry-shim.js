/**
 * STARFORGED COMPANION
 * src/foundry-shim.js — Shim for Foundry globals in non-Foundry contexts
 *
 * The assembler and other modules reference foundry.utils.randomID().
 * In a live Foundry session this global exists. In Jest unit tests it does not.
 *
 * This shim exports a safe fallback so modules can import from here
 * rather than referencing the global directly, keeping them testable.
 *
 * In a real Foundry session, the global `foundry` is already available
 * and this shim's fallback is never invoked — the try/catch in the caller
 * catches the ReferenceError and falls back to Math.random() instead.
 *
 * Usage in module code:
 *   import { foundry } from "../foundry-shim.js";
 *   const id = foundry.utils.randomID();
 */

export const foundry = (typeof globalThis.foundry !== "undefined")
  ? globalThis.foundry
  : {
      utils: {
        randomID: () => Math.random().toString(36).slice(2, 10),
        deepClone: (obj) => JSON.parse(JSON.stringify(obj)),
      },
    };
