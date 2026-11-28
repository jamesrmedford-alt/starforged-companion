# The judges, measured — judges-live-20261127-162035

Commit e070cc52 (with slice 5, as it ships) · 327 narrations (52 with a review's label, 36 seeded) · 273 calls · $0.0283.

The bar (issue #399 D7): of a kind's flags, at least 9 in 10 right — all of them, with fewer than 10 — and at least two of every three breaches caught.

## The pre-post judge

| Kind | Lines | Flags | Right | Breaches | Caught | Wrong on a labelled kept line | Bar |
|---|---|---|---|---|---|---|---|
| [cost] | 12 | 4 | 4 | 4 | 4 | 0 | **passed** |
| [fight] | 10 | 4 | 4 | 4 | 4 | 0 | **passed** |
| [foe] | 14 | 6 | 6 | 7 | 6 | 0 | **passed** |
| [offer] | 66 | 0 | 0 | 4 | 0 | 0 | retired: not asked |
| [oracle] | 10 | 3 | 3 | 4 | 3 | 0 | **passed** |
| [place] | 16 | 0 | 0 | 3 | 0 | 0 | retired: not asked |
| [premise] | 12 | 9 | 9 | 9 | 9 | 0 | **passed** |
| [price] | 4 | 2 | 2 | 3 | 2 | 0 | **passed** |
| [state] | 112 | 0 | 0 | 3 | 0 | 0 | retired: not asked |
| [unsaid] | 20 | 4 | 4 | 4 | 4 | 0 | **passed** |
| [whereabouts] | 16 | 5 | 5 | 8 | 5 | 0 | failed |

## The audit

| Kind | Lines | Flags | Right | Breaches | Caught | Wrong on a labelled kept line | Bar |
|---|---|---|---|---|---|---|---|
| [cost] | 12 | 3 | 3 | 4 | 3 | 0 | **passed** |
| [fight] | 10 | 4 | 4 | 4 | 4 | 0 | **passed** |
| [foe] | 14 | 0 | 0 | 7 | 0 | 0 | retired: not asked |
| [offer] | 66 | 3 | 3 | 4 | 3 | 0 | **passed** |
| [oracle] | 10 | 0 | 0 | 4 | 0 | 0 | retired: not asked |
| [place] | 16 | 4 | 3 | 3 | 3 | 0 | failed |
| [premise] | 12 | 9 | 9 | 9 | 9 | 0 | **passed** |
| [price] | 4 | 3 | 3 | 3 | 3 | 0 | **passed** |
| [state] | 112 | 2 | 2 | 3 | 2 | 0 | **passed** |
| [unsaid] | 20 | 5 | 4 | 4 | 4 | 0 | failed |
| [whereabouts] | 16 | 0 | 0 | 8 | 0 | 0 | retired: not asked |

## The checks in code

| Check | Narrations | Flags | Right | Breaches | Caught | Wrong on a labelled kept line | Bar |
|---|---|---|---|---|---|---|---|
| [harm] | 327 | 10 | 10 | 10 | 10 | 0 | **passed** |

## Assumptions

- An unlabelled line is counted kept: a flag on it counts as wrong. A review that missed a breach makes a right flag look wrong.
- The audit is asked about the lines alone, with no ledger beside them; in play it is given the scene's ledger too.
- A [whereabouts] line's trip words, and the judge sentences, are rebuilt from the recorded text as the module builds them now.
- Each request is asked once, and the model samples at its default: an identical request can be answered otherwise in another run.
- The judge sentences and the harm check were written with the set's earlier results in view, so the set is not a test they have not seen.
