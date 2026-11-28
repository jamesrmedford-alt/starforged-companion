# The judges, measured — judges-live-20261127-153509

Commit 952ba3e4 (with the measure's own files) · 327 narrations (52 with a review's label, 36 seeded) · 458 calls · $0.0610.

The bar (issue #399 D7): of a kind's flags, at least 9 in 10 right — all of them, with fewer than 10 — and at least two of every three breaches caught.

## The pre-post judge

| Kind | Lines | Flags | Right | Breaches | Caught | Wrong on a labelled kept line | Bar |
|---|---|---|---|---|---|---|---|
| [cost] | 12 | 4 | 4 | 4 | 4 | 0 | **passed** |
| [dice] | 77 | 21 | 3 | 4 | 3 | 1 | failed |
| [fight] | 10 | 4 | 4 | 4 | 4 | 0 | **passed** |
| [foe] | 14 | 7 | 7 | 7 | 7 | 0 | **passed** |
| [offer] | 66 | 1 | 1 | 4 | 1 | 0 | failed |
| [oracle] | 10 | 7 | 3 | 4 | 3 | 3 | failed |
| [place] | 16 | 7 | 3 | 3 | 3 | 0 | failed |
| [premise] | 12 | 9 | 9 | 9 | 9 | 0 | **passed** |
| [price] | 4 | 3 | 2 | 3 | 2 | 0 | failed |
| [state] | 112 | 8 | 3 | 3 | 3 | 0 | failed |
| [unsaid] | 20 | 4 | 4 | 4 | 4 | 0 | **passed** |
| [whereabouts] | 16 | 6 | 6 | 8 | 6 | 0 | **passed** |

## The audit

| Kind | Lines | Flags | Right | Breaches | Caught | Wrong on a labelled kept line | Bar |
|---|---|---|---|---|---|---|---|
| [cost] | 12 | 4 | 4 | 4 | 4 | 0 | **passed** |
| [dice] | 77 | 2 | 2 | 4 | 2 | 0 | failed |
| [fight] | 10 | 5 | 4 | 4 | 4 | 0 | failed |
| [foe] | 14 | 3 | 3 | 7 | 3 | 0 | failed |
| [offer] | 66 | 2 | 2 | 4 | 2 | 0 | failed |
| [oracle] | 10 | 5 | 4 | 4 | 4 | 0 | failed |
| [place] | 16 | 3 | 3 | 3 | 3 | 0 | **passed** |
| [premise] | 12 | 9 | 9 | 9 | 9 | 0 | **passed** |
| [price] | 4 | 3 | 3 | 3 | 3 | 0 | **passed** |
| [state] | 112 | 3 | 3 | 3 | 3 | 0 | **passed** |
| [unsaid] | 20 | 4 | 4 | 4 | 4 | 0 | **passed** |
| [whereabouts] | 16 | 0 | 0 | 8 | 0 | 0 | failed |

## Assumptions

- An unlabelled line is counted kept: a flag on it counts as wrong. A review that missed a breach makes a right flag look wrong.
- The audit is asked about the lines alone, with no ledger beside them; in play it is given the scene's ledger too.
- A [dice] or [whereabouts] line's trip words, and the judge sentences, are rebuilt from the recorded text as the module builds them now.
