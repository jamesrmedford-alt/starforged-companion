/**
 * FOLDER-001 regression — ensureFolderPath must reuse an existing nested folder
 * instead of minting a duplicate on every call.
 *
 * Foundry v13's `Folder#folder` getter returns the parent Folder *document*,
 * while `_source.folder` (and the shared test mock) use an id string. The old
 * comparison `(f.folder ?? null) === parentId` worked against the id-string mock
 * but silently failed in production against the document getter, so a fresh
 * `Sectors / <Name>` folder was created on every world load. These tests seed
 * folders with a document-style parent ref to replicate v13 and prove the fix.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  _resetFolderCache,
  ensureFolderPath,
  folderParentId,
  getOrCreateActorFolder,
} from "../../src/entities/folder.js";

beforeEach(() => {
  global.game.folders._reset();
  _resetFolderCache();
});

describe("folderParentId", () => {
  it("normalises a parent document to its id", () => {
    expect(folderParentId({ id: "f-parent", name: "Sectors" })).toBe("f-parent");
  });
  it("passes through an id string", () => {
    expect(folderParentId("f-parent")).toBe("f-parent");
  });
  it("maps null / undefined to null", () => {
    expect(folderParentId(null)).toBe(null);
    expect(folderParentId(undefined)).toBe(null);
  });
});

describe("ensureFolderPath — v13 document-getter parent (FOLDER-001)", () => {
  it("reuses an existing nested folder whose .folder is a document, not an id", async () => {
    // Seed a v13-style tree: the child's `.folder` is the parent *document*.
    const sectors = { id: "f-sectors", name: "Sectors", type: "Actor", folder: null };
    const child   = { id: "f-ot", name: "Outer Threshold", type: "Actor", folder: sectors };
    global.game.folders._set(sectors);
    global.game.folders._set(child);

    const before = global.game.folders.contents.length;
    const leaf = await ensureFolderPath("Actor", ["Sectors", "Outer Threshold"]);

    expect(leaf).toBe("f-ot");                                   // reused, not recreated
    expect(global.game.folders.contents.length).toBe(before);    // no duplicate minted
  });

  it("does not duplicate across repeated calls (per-load idempotency)", async () => {
    const sectors = { id: "f-sectors", name: "Sectors", type: "Actor", folder: null };
    const child   = { id: "f-ot", name: "Outer Threshold", type: "Actor", folder: sectors };
    global.game.folders._set(sectors);
    global.game.folders._set(child);

    await ensureFolderPath("Actor", ["Sectors", "Outer Threshold"]);
    _resetFolderCache(); // simulate a fresh world load (module cache cleared)
    const leaf = await ensureFolderPath("Actor", ["Sectors", "Outer Threshold"]);

    expect(leaf).toBe("f-ot");
    const matches = global.game.folders.contents.filter(
      f => f.type === "Actor" && f.name === "Outer Threshold"
    );
    expect(matches).toHaveLength(1);
  });

  it("creates a top-level Actor folder once and reuses it", async () => {
    const a = await getOrCreateActorFolder("PCs");
    _resetFolderCache();
    const b = await getOrCreateActorFolder("PCs");
    expect(a).toBe(b);
    const pcs = global.game.folders.contents.filter(
      f => f.type === "Actor" && f.name === "PCs"
    );
    expect(pcs).toHaveLength(1);
  });
});
