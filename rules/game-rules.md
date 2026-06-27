# Game rules reference — Ironsworn: Starforged

Two authoritative game-rules docs live in `docs/`. They exist so the
narrator, the move pipeline, the classifier, and any new mechanic you
design behave the way the published game says they should — not the way
a quick read of a single move's text suggested.

| Doc | What it covers | When to read |
|-----|---------------|--------------|
| [`docs/rules-reference/playkit-rules-and-coverage.md`](../docs/rules-reference/playkit-rules-and-coverage.md) | Verbatim summary of every move (all 51), table (the 8 d100 tables), and resolution rule from the *Starforged Playkit* (Tomkin 2022, Jan 2023 update). Part 1 is the rules; Part 2 maps each rule onto file:line in the source tree; Part 3 is a punch list of bugs and gaps. | Before implementing or fixing a specific move, table, oracle, or mechanic. Quote rule wording in commit messages where useful. Part 2 is also the fastest way to find which file owns a given rule. |
| [`docs/rules-reference/rulebook-summary.md`](../docs/rules-reference/rulebook-summary.md) | Section-by-section paraphrased summary of the full rulebook (Tomkin 2022). Covers the conceptual model, mechanical structure, design principles, principles of play, and how the game's systems interrelate. Omits oracle tables and NPC stat blocks (foundry-ironsworn data) and verbatim move text (use the play kit doc for that). | Before designing narrator behaviour, classifier prompts, move-interpreter logic, scene-design features, or any cross-cutting feature that needs to fit the game's intent. The "Cross-cutting design themes" and "Implications for module design" sections at the end are especially useful for narrator / pacing / classifier work. |

**Rule:** Whenever a task touches narrator behaviour, move interpretation,
pacing classification, scene mechanics, or oracle usage — read the
relevant section of these docs before writing code. They are short,
indexed, and answer "what does the game say should happen here?"
without the noise of the full rulebook prose.

### Expansion: Sundered Isles

| Doc | What it covers | When to read |
|-----|---------------|--------------|
| [`docs/rules-reference/sundered-isles-playkit-rules.md`](../docs/rules-reference/sundered-isles-playkit-rules.md) | Rules reference for the **Sundered Isles** expansion (Tomkin 2024) — every move, clock, embedded table, worksheet, and safety tool, plus a Part 2 delta against Starforged and a Part 3 implementation-status / data-source note. | Only when a task explicitly concerns Sundered Isles. **Sundered Isles is not implemented** in the Companion (Starforged only); this is reference for potential future scoping, and a pointer to the SI data already vendored in `foundry-ironsworn`. |
| [`docs/rules-reference/sundered-isles-guidebook-summary.md`](../docs/rules-reference/sundered-isles-guidebook-summary.md) | Section-by-section paraphrased summary of the **Sundered Isles** guidebook (Tomkin 2024) — setting, the subsystems that differ from or extend Starforged (ships, crews, two-meter supply, optional wealth, phased naval combat, the 11 seafaring truths), design intent, and an "Implications for module design" section. The expansion analogue of `rulebook-summary.md`. | Before reasoning about Sundered Isles narrator behaviour, seafaring subsystems, or how the module would extend to ships/crews. Same caveat: SI is not implemented in the Companion. |

These docs are about **the game**; they are not a substitute for reading
the foundry-ironsworn source when touching Actor / Item schemas (see
`rules/foundry-ironsworn.md`), or for fetching Foundry API docs when
calling Foundry methods (see `rules/foundry-api.md`). The play-kit doc
tells you *what* a move should do; the foundry-ironsworn schema tells
you *where* on the document the result lands.

When the play kit / rulebook is reissued, update both docs and bump
their "Document maintenance" footers. The play-kit doc's Part 3 punch
list should be re-audited after any meaningful rules change.
