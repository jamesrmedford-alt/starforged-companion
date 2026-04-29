# Starforged Companion — Scope Index

Single-glance status of all features. Start here every session to orient quickly.
For detail on any scope, open the linked document.

---

## Status key

| Badge | Meaning |
|-------|---------|
| ✅ COMPLETE | Implemented, tested, merged to main |
| 🔄 IN PROGRESS | Partially implemented or currently active |
| 📋 PLANNED | Specified, not yet started |
| 🔧 SUPERSEDED | Replaced — see note |

---

## All scopes

| Scope | Status | Description | Depends on | Blocks |
|-------|--------|-------------|------------|--------|
| [Narrator](narrator-scope.md) | ✅ COMPLETE | Direct Claude narration replacing Loremaster; configurable tone, perspective, model | — | Foundations, Scene Interrogation, Previously On |
| [Ironsworn API](ironsworn-api-scope.md) | ✅ COMPLETE | Corrected `actorBridge.js` field paths for foundry-ironsworn v1.27.0 | — | Character Management |
| [Character Management](character-management-scope.md) | ✅ COMPLETE | Actor bridge, character chronicle, and chronicle UI panel | Narrator, Ironsworn API | Previously On, World Journal |
| [Foundations](foundations-scope.md) | 🔄 IN PROGRESS | Session ID management and narrator card metadata; README and help compendium pending | Narrator | Scene Interrogation, Previously On, Character Management, World Journal |
| [Scene Interrogation](scene-interrogation-scope.md) | 📋 PLANNED | `@scene` prefix routes free-form questions to the narrator without triggering a move | Foundations | Previously On |
| [Previously On](previously-on-scope.md) | 📋 PLANNED | Session recap (no API call) and campaign recap (Claude, cached); auto-posts at session start | Foundations, Character Management | World Journal |
| [World Journal](world-journal-scope.md) | 📋 PLANNED | Automatic faction/location/lore/threat documentation in Foundry journal entries | Character Management, Previously On | — |
| [API Key Privacy](api-key-privacy-scope.md) | 📋 PLANNED | Hide API keys from player view; GM-only input in Companion Settings About tab | — | — |

---

## Dependency graph

```
Narrator (✅)
  └─► Foundations (🔄)
        ├─► Scene Interrogation (📋)
        │     └─► Previously On (📋)
        │               └─► World Journal (📋)
        └─► Character Management (✅) ◄── Ironsworn API (✅)
                    └─► Previously On (📋)
                              └─► World Journal (📋)
```

---

## What to work on next

1. **Complete Foundations** — README rewrite and `packs/help.json` are the remaining pieces; nothing else is blocked on them but they should ship before v1.0.
2. **Scene Interrogation** — first planned scope; self-contained, depends only on Foundations infrastructure that is already implemented.
3. **Previously On (session recap)** — no API call required; can be implemented independently of campaign recap.
