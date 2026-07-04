# Vault & derelict (site) flow — as implemented

How precursor vaults and derelicts are generated, hidden, discovered, and
explored — verified against source (v1.7.30 cycle). Sibling docs:
`exploration-flow.md` (expeditions, waypoints, ship position),
`narrator-context-flow.md` (the context surfaces site details ride on).

Prompted by: "Can you review the Vault and Derelict creation and exploration
flow?" All six audit defects were **fixed in the same cycle** ("Please
address all items") — §3 is the resolved ledger, §4 the dispositions.
Tags: **LOSE-CONTENT** (shipped content unreachable), **WRONG-DETAIL**,
**LOSE-PLOT**, **LOSE-PAYOFF**.

## 1. Creation — sector generation only

`generateSectorSites(region, trouble)` (`src/sectors/precursorSites.js`,
pure + unit-tested) plans a region-scaled site count (terminus 1 /
outlands 2 / expanse 3, alternating derelict-first) plus one themed bonus
site when the sector trouble keyword-matches precursor ("vault") or
wreck/ghost ("derelict") wording. Each site rolls the full canonical oracle
spread:

- **Vault**: location, scale, form, shape, material, outer + inner first
  look, purpose, interior feature / peril / opportunity — name
  `Precursor Vault — <Form>`.
- **Derelict**: location, then the location-appropriate type (planetside/orbital/deep-space table), condition, outer + inner first look, one
  notable zone (starship vs settlement zone table by rolled type) — name
  from the type, Roman-numeral deduped within the sector.

`buildSiteLocationData` shapes each site for `createLocation` — a
`location`-type Actor with `system.subtype` vault/derelict,
`canonicalLocked: true` (narrator entity-discovery can never overwrite),
`status: "unexplored"`, and a `description` that bakes the exterior AND
interior prep into one field. A parallel discovery record
(`{id, name, type, discovered:false, actorId}`) lands on the sector's
`mapData.discoveries[]`, and the scene builder places a dim, unlabelled pin
behind an undiscovered passage — players see *something* is out there, not
what.

## 2. Discovery

Two reveal paths, both funnelling through `revealSectorSite`
(`src/sectors/siteDiscovery.js`, dependency-injected, GM-gated by callers):

1. **Finishing an expedition** whose track was stamped with a `siteId` FK at
   creation (`requireLabelMatch` — no guessing) or whose label fuzzy-matches
   (`selectSiteForReveal`: exact → substring → type-keyword-when-unique →
   sole-undiscovered). The reveal mutates the in-memory campaignState so the
   pending `persistResolution` write carries it.
2. **`!reveal-site <name>`** — manual, GM-only, with the same ladder.

Revealing flips `discovered`, sets the location Actor `status: "visited"`,
restyles the scene pin + passage to charted appearance, persists, and posts
the **◈ Site Discovered** card ("undertake an expedition there, or Explore
a Waypoint to move through its zones").

## 3. Audit defects — all resolved (v1.7.30 cycle)

| Code | Class | Defect → fix |
|---|---|---|
| SITE-ZONE-TABLES-DEAD | LOSE-CONTENT | `tables/derelicts.js` shipped 20 tables, only 7 registered → the roller now registers the remaining 13 (planetside/orbital type tables + the Access suite + all seven per-zone AREA tables), reachable via `!oracle` and the site-aware waypoint seeds below |
| SITE-WAYPOINT-BLIND | WRONG-DETAIL | `explore_a_waypoint` seeds were site-agnostic → `buildOracleSeeds` takes a `currentSite` and, inside a vault, rolls Interior Feature (Peril on a miss, Opportunity on a strong-hit match); inside a derelict, the Access Area/Feature/Peril/Opportunity suite. The pipeline passes `getCurrentSiteKind(campaignState)` so the seeds fire whenever the crew's current location is a vault/derelict |
| SITE-ANCHOR-ABSENT | LOSE-PLOT | `formatActiveSector` listed settlements only → discovered sites now render a "Charted sites (established — do not reinvent them)" block with type + status, so "the derelict" has a standing anchor from discovery onward |
| SITE-TYPE-TABLE-MISMATCH | canon fidelity | `derelict_type` always rolled deep-space weights → `derelictTypeTableFor(location)` routes the roll to the planetside / orbital / deep-space type table matching the rolled location |
| SITE-DISCOVERY-CARD-GENERIC | LOSE-PAYOFF | The Site Discovered card omitted the rolled exterior → it now reads the location record's first look and renders it beneath the announcement (fail-open) |
| SITE-NO-COMPLETION | minor | `status: "cleared"` was never set → new `clearSectorSite` + `!clear-site <name>` (GM-only) close the unexplored → visited → cleared lifecycle, stamping the discovery record and the location Actor |

## 4. Design-level observations — dispositions (2026-07)

- **Interior prep stays baked into one description field** — reaffirmed. The
  narrator paces revelation; the site-aware waypoint seeds (§3) are the live
  reveal mechanism, so a staged outer/inner split is unnecessary machinery.
- **No zone-position state — reaffirmed.** Starforged has no delve track;
  exploration depth stays fictional. The zone AREA tables are now reachable
  by `!oracle` when the fiction names a specific zone (community,
  engineering, medical, …); the waypoint seeds use the always-applicable
  Access suite so a roll needs no prior zone pick.

## 5. What held up under audit

Creation is pure, canonical, and unit-tested (region scaling, trouble
theming, full oracle spreads, name dedup); sites are `canonicalLocked` so
entity discovery never overwrites them; pins stay unlabelled until
discovery, and the sector anchor's settlement-only roster means undis-
covered sites leak nowhere; the expedition→site link is stamped strictly
(`requireLabelMatch`) and revealed precisely (`siteId` FK with the fuzzy
ladder as fallback — the 2026-07 soft-spot fixes); `!reveal-site` is
GM-gated with a not-found notice; the reveal updates record + pin + state
in one pass, tolerating per-step failures; and arrival by move sets
`currentLocationId` for location-type entities (LOCATION-DUAL-STORE fix),
so a named site becomes the CURRENT LOCATION card with its full record the
moment the crew actually goes there.
