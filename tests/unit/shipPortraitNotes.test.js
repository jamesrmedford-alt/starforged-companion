import { describe, it, expect } from "vitest";
import { withPortraitInNotes } from "../../src/art/generator.js";

// F5: the generated ship portrait is mirrored into the starship Notes tab
// (the sheet header icon is small). withPortraitInNotes prepends an <img>
// block, idempotently, preserving the existing notes prose.

describe("withPortraitInNotes (F5)", () => {
  it("prepends an image block above the existing notes", () => {
    const out = withPortraitInNotes("<p>A battered courier.</p>", "worlds/w/art/ship.png");
    expect(out).toContain('<img src="worlds/w/art/ship.png"');
    expect(out).toContain("<p>A battered courier.</p>");
    expect(out.indexOf("<img")).toBeLessThan(out.indexOf("<p>A battered"));
  });

  it("is idempotent — regeneration replaces, not stacks, the art block", () => {
    const once  = withPortraitInNotes("<p>notes</p>", "a.png");
    const twice = withPortraitInNotes(once, "b.png");
    const imgCount = (twice.match(/sf-ship-portrait/g) ?? []).length;
    expect(imgCount).toBe(1);
    expect(twice).toContain('src="b.png"');
    expect(twice).not.toContain('src="a.png"');
    expect(twice).toContain("<p>notes</p>");
  });

  it("strips the art block when given no path", () => {
    const withArt = withPortraitInNotes("<p>notes</p>", "a.png");
    const cleared = withPortraitInNotes(withArt, "");
    expect(cleared).not.toContain("sf-ship-portrait");
    expect(cleared).toContain("<p>notes</p>");
  });

  it("handles empty / nullish notes", () => {
    expect(withPortraitInNotes("", "a.png")).toContain('<img src="a.png"');
    expect(withPortraitInNotes(undefined, "a.png")).toContain('<img src="a.png"');
  });
});
