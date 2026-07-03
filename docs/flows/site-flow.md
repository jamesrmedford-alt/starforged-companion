# Vault & derelict (site) flow — as implemented

How precursor vaults and derelicts are generated, hidden, discovered, and
explored — verified against source (v1.7.30 cycle). Sibling docs:
`exploration-flow.md` (expeditions, waypoints, ship position),
`narrator-context-flow.md` (the context surfaces site details ride on).

Prompted by: "Can you review the Vault and Derelict creation and exploration
flow?" §3 is the open defect ledger (fixes await direction). Tags:
**LOSE-CONTENT** (shipped content unreachable), **WRONG-DETAIL**,
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
- **Derelict**: location, type, condition, outer + inner first look, one
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

## 3. Verified defects (open — awaiting direction; see `known-issues.md`)

1. **SITE-ZONE-TABLES-DEAD** (LOSE-CONTENT): `tables/derelicts.js` ships
   **20** canonical tables; the roller registers **7**. The entire derelict
   zone-crawl suite — `ACCESS_AREA` / `ACCESS_FEATURE` / `ACCESS_PERIL` /
   `ACCESS_OPPORTUNITY` plus the seven per-zone AREA tables (community,
   engineering, living, medical, operations, production, research) — is
   unreachable from every affordance: no oracle id, no `!oracle` reach, no
   waypoint button, no exploration seed. The rulebook's derelict exploration
   loop (pick a zone → roll Area → Feature → Peril/Opportunity on trouble)
   has its data in-tree and dead.
2. **SITE-WAYPOINT-BLIND** (WRONG-DETAIL): the discovery card tells the
   player to "Explore a Waypoint to move through its zones," but
   `explore_a_waypoint`'s oracle seeds are site-agnostic — action + theme,
   plus Make a Discovery / Confront Chaos on matches. Exploring INSIDE a
   derelict or vault never rolls the site's zone/interior tables and never
   tells the narrator what kind of site the waypoint belongs to. The vault
   interior feature/peril/opportunity tables ARE registered — but they are
   rolled exactly once at generation as static prep; the exploration loop
   (rulebook: roll fresh interior results per area explored) never touches
   them again.
3. **SITE-ANCHOR-ABSENT** (LOSE-PLOT): `formatActiveSector` lists
   settlements only. A **discovered** site never joins the standing sector
   picture — the narrator learns it exists only when the player types its
   exact name (lexical relevance) or after arrival sets it current. Between
   discovery and arrival, prose about "the derelict" matches nothing
   ("Derelict Starship II" ≠ "the derelict"), so the narrator can invent
   details that contradict the rolled prep it was never shown.
4. **SITE-TYPE-TABLE-MISMATCH** (canon fidelity, minor): `derelict_type` is
   registered to `TYPE_DEEP_SPACE` unconditionally; `TYPE_PLANETSIDE` and
   `TYPE_ORBITAL` exist in the table file, unregistered and unused.
   `generateDerelictSite` rolls the location first and then types every
   derelict with deep-space weights — canonically the type table varies by
   location (planetside derelicts skew settlement).
5. **SITE-DISCOVERY-CARD-GENERIC** (LOSE-PAYOFF, minor): the Site
   Discovered card announces "a passage opens through to a precursor vault"
   without the site's rolled exterior — condition, scale/form, outer first
   look. The payoff moment shows none of the prep; the GM has to open the
   location record to narrate the approach.
6. **SITE-NO-COMPLETION** (minor): the location schema documents
   `status: "cleared"` but nothing ever sets it — the lifecycle stops at
   `visited` (set on reveal, before anyone has even boarded). Nothing
   distinguishes glimpsed-from-orbit from fully-delved, and no affordance
   closes a site.

## 4. Design-level observations

- **Interior prep is baked into one description field** — outer and inner
  first looks, purpose, notable zone all concatenate into
  `location.description`, so the narrator (via the CURRENT LOCATION card or
  a matched entity card) reads the interior before the crew breaches the
  airlock. Acceptable as GM-brain prep — the narrator should pace
  revelation — but there is no staged outer/inner reveal if drift shows up
  in play.
- **No zone-position state.** Exploration depth inside a site is purely
  fictional (no "current zone" tracking). Fine for Starforged — it has no
  delve mechanic — but the dead zone tables (§3.1) suggest the richer crawl
  was the original intent.

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
