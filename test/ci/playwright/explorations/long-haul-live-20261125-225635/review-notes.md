# Long haul, sixth live round, first run — a partial run, kept for its evidence

Run `test/ci/playwright/explorations/long-haul-live-20261125-225635/` (commit 1dcf83d3), given the round's ten questions. 57 actions, **$1.6882**. It stopped at beat 22 of 27 on a runner fault. The round's second run (`long-haul-live-20261125-232143/`, commit e62fa124) played all 27 beats. Its `review-notes.md` holds the round's findings (issue #389), and this run's samples are filed there.

- **Beats, re-scored:** 21 of 27 done, none failed; beat 22 not exercised; beats 23–27 never reached.
- **Mechanics:** 851 checks, none violated.
- **Ledger:** 5 recalled, 2 carried unasked, 0 lost, 0 refused, 1 not probed of 8.

## Why it stopped

- Beat 22 is the night's recovery. The fight had cost nothing: its miss paid the price the reader stated before the roll.
- The player, told to mend only what is spent, had nothing to mend, and stopped the run.
- The check now passes the beat as not exercised when nothing on the sheet is spent and the beat's line is answered (`lib/beats.mjs` `recovered`, `moot`; EXPLORE-ROUND-6-CHECKS, fixed in e62fa124).

## The review's own fix

Its F7 "refused" was a sentence that gives the old name as what it was: "Earlier lines and records may have called her Tamsin Vey; that name was the table's mistake, and Okoro is what you know her by." (a55). `FORMER_MARK` (`lib/ledger.mjs`) reads "called her" and "mistake" now, so the re-score refuses nothing.

## What it adds to the round's findings

- **Openings in the third person** (the second run's finding 4): a48, "Mira has taken up an odd occupation at the gunnery console". That makes three of the round's six openings.
- **An opening that moves the character:** session 1 stopped at Tamsin's stall with Tamsin ("Place: Hollow Spire … With them at the end: Tamsin Vey"). a17 opened "Back aboard Kobayashi IV", though its prompt said "no time is skipped to move them". One sample.
- **One journey, a scene a beat** (the second run's finding 9): a23 (ship), a24 (ship) and a25 (place) each began a scene of one beat, on one expedition.
- **A single rolled word written as rolled:** a17's "decided to assault the problem" for the rolled "Assault Knowledge". The second run has "authority" (a2) and "follows" (a96). The MATERIAL rule forbids it; the check catches only labels, names and pairs, by design.
- **A mutter for the character on typed lines:** "I wouldn't touch that housing bare-handed," (a24); "Hold your fire until she turns," (a30). Small.

## What held

Every #388 fix it reached:
- the openings from the last scene played, with What binds;
- closings to someone absent (a15, a46);
- the ship's record (a40, a53);
- 16 of 20 tags kept and the 4 refused right (a `result` on a line narrated with no roll);
- the plea offered Make a Connection (a5);
- no words on a button's move;
- the rename recorded no tie.

## What it does not have

No cold read and no step notes: the second run, at the next commit, played the same charter to its end and was read in full. The scorecard's cold-read place says so.
