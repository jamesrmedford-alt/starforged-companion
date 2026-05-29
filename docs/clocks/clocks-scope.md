# Clocks — Scope

**Status:** ✅ COMPLETE

Campaign and tension clocks (play kit p. 1 / Reference Guide pp. 122–123), via
chat commands and an ApplicationV2 panel. Implemented in `src/clocks/clocks.js`.

---

## Overview

Two clock types:

| Type | Purpose | Advances |
|------|---------|----------|
| `campaign` | Slow-burn faction/world projects | At Begin a Session, via Ask the Oracle on the clock's `advanceOdds` (default *likely*) |
| `tension` | Scene-bound danger or deadline | When you Pay the Price or roll a complication |

Clocks are stored as an array on `campaignState.clocks`. Each clock carries
`_id`, `name`, `type`, `segments` (4 / 6 / 8 / 10), `filled` (0..segments),
`active`, and `advanceOdds`. `filled === segments` means the clock has triggered.

---

## Chat commands

`list` is open to anyone; `new` / `advance` / `fill` / `reset` / `remove` are
GM-gated (via `gmGate()`).

| Command | Effect |
|---------|--------|
| `!clock new <name> <segments> [campaign\|tension] [odds]` | Create a clock (default type `tension`) |
| `!clock advance <name>` | Advance — campaign clocks auto-roll their `advanceOdds` |
| `!clock fill <name>` | Manually fill one segment |
| `!clock reset <name>` | Reset to empty |
| `!clock remove <name>` | Delete the clock |
| `!clock list` *(or bare `!clock`)* | List all clocks |

Predicate `isClockCommand` and dispatcher `handleClockCommand` live in
`src/clocks/clocks.js`; the handlers are wired from `src/index.js`.

---

## Panel

An ApplicationV2 singleton (`ClocksPanelApp`) renders each clock as a segmented
ring with add / advance / fill / reset / remove actions. Triggered clocks
(`filled >= segments`) are flagged in the prepared context.

## Dependencies

`rollYesNo` from `src/oracles/roller.js` drives campaign-clock auto-advance.
