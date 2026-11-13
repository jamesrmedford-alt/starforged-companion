# Starforged Companion — Known Issues

Open bugs, workarounds, and items pending resolution. Update this file as
issues are resolved or discovered.

_Last audited against the code at the v1.7.31 cycle (2026-10 repo audit, PR
#281, and its post-merge review fixes); the flow audits below were verified
against source — full traces in `docs/flows/*.md`._

---

## Active issues

### Alpha 23 playtest part 2 (issue #354) — in progress in the v1.8.2 cycle

Fixed so far (each with a regression test; decisions.md → "Issue #354"):

| ID | Kind | Fix |
|---|---|---|
| P2-01 NO-MOVE-ANSWER | UX (forced roll) | The interpreter's reply always carried a move (fallback Face Danger), and its `confidence` was read by nothing, so a line it called "a narrative exchange" opened the roll dialog → it may answer `"moveId": null`; `readMove` returns that, or a low-confidence reading outside a fight, as `noMove`, and free-flow narrates the line with the classifier's move offered (`index.js` `narrateLineWithoutMove`); a round's reading becomes a narrative one. The confirm dialog has **No move — narrate**; a cancelled reading's notice has **Narrate it — no move** (gmRelay `notRolled.narrate`). A reply naming no move at all is a failed reading and still goes to the dialog |
| P2-02 CLASSIFIER-MOVE-DROPPED | UX (forced roll) | `router.decidePacing` returned `suggestedMove: null` on MOVE, so the interpreter read each line from scratch → the classifier's move, category and reasoning are handed on (`nominatedMove`, the interpreter's PACING READ hint). Balanced Mischief stays in kind (`keepMischiefInKind`, decided) |
| P2-03 | withdrawn | A confidence threshold would not have caught most of the unwanted rolls (four of seven scored 75–80%) |
| P2-04 CONNECTION-RULE-EVERY-NPC | UX (forced roll) | "If the addressee is a Connection … bias toward MOVE", with every NPC card listed → the classifier is told the speaker's own connections (the bond Items on their sheet) and leans toward MOVE only for a pressing or testing line to one of them; talk and everyday actions with nothing at risk are narration (decided: both narrowings) |
| P2-05 SHORT-LINE-SILENT | SILENT | `isPlayerNarration` returned false under ten characters with no notice → the minimum stays (decided) and the line's author is told on their own client, the line back in their chat box (`isLineTooShortForNarrator`, `tellLineTooShort`) |
| P2-06 INTERPRETER-NO-SPEAKER | attribution | The interpreter's context named no speaker, so it took one from the recent scene; the fellow-PC rule ran only where a move was offered → `buildContextSummary` names the speaker; `lineIsToAFellowPlayerCharacter` narrates such a line on a MOVE decision |
| P2-07 SPOTLIGHT-DEFAULT-ON | UX | Rotating Spotlight defaulted on and counts PCs, not players → default off, a stored "on" switched off once with a GM notice (`spotlightDefault.js`, decided); the block ends on whoever the last line of dialogue is spoken to and asks only what a character does |
| P2-08 YOU-CHANGES-PERSON | narrator | The spotlight block told a second-person narration to address a different PC directly → the block takes the resolved perspective (third person, by name, inside the fiction); the second-person style rule keeps "you" for the acting character |
| P2-09 BURN-NO-ASSET-REFUND | STATE | `SUFFER_METERS` had no Withstand Damage / Companion Takes a Hit, so a reverted price kept the integrity or health it took → `assetDeltas` receipts, an `assetTrack` upgrade step (restore, with a GM Retry), and the price's cards struck (`supersedePriceCards`) |

| P2-12 PRICE-ROW-NO-EFFECT | STATE | Pay the Price 89–95, "You are delayed or put at a disadvantage", carried no `sufferRoute`: nothing changed and the narration made it a mood → the row routes to Lose Momentum (-1), the suffer move its own text triggers, and its narration seed says what it cost (`resolver.priceSeedLines`). Its receipt is a momentum receipt, which a burn or an improvement already undoes |
| P2-13 DAMAGE-SHOWN-THREE-TIMES | cosmetic | One −1 integrity posted Pay the Price ("Routes to withstand_damage (-1)"), the system's change note and the module's own Withstand Damage card → the footer names the move (`STATED_SUFFER_MOVES`), and the system's note for a suffer move's write is not posted (`actorBridge.withoutSystemNotes` — its create cancelled in `preCreateChatMessage`). Not done, by decision: a Resist button (the optional resist above 0 stays a typed move, issue #330 D3) |
| P2-14 CARD-WORDING | cosmetic | Face Danger's strong hit had no outcome text; no card said what a match adds; a burn's momentum showed only as the system's "-3 momentum (now 2)"; a superseded narration kept Play/Stop; Finish the Expedition was the card's one prominent button at 2/10 → the strong-hit text; a match line under the outcome (`matchLine`); "Momentum burned: 5 → 2 (reset)." on the burned card, the system's note for it not posted; no audio controls on a superseded narration, and audio of it stops (`audio/index.js` `onNarratorCardRendered`); the button carries the progress and is muted under 4 boxes |

| P2-15 THREAT-PAGE-PER-UPDATE | STATE (duplicates) | The detector was shown threats as "<name>: <severity>" and told to copy the name, `recordThreat` matched by exact name, and `updateThreatSeverity` stored any `newValue` as the severity → the detector sees name and severity apart and returns a severity from the enum; a detected name is the recorded threat's when it is a variant of one (`resolveThreatName`); a severity is one of four (`normalizeThreatSeverity`), a sentence given for one becomes the summary and a history line; stored bad severities are read as the one they mean. `findDuplicateThreats` / `mergeDuplicateThreats`: a GM's **Merge duplicates** in the World Journal panel — asked first, the other pages closed as resolved and marked `mergedInto`, never deleted |
| P2-16 PERSON-PART-NAME / CONFIRM-ALWAYS-BONDS | UX / STATE | The draft dedupe compared whole names; a free-flow Confirm always bonded the person to the narration's PC; the system's "Added …" item note read as the PC speaking → `nameMatch.personNameMatch` (part name, near spelling) in the detection filter and the draft gate, PCs included; a person's row offers the PC by name and **No one** on every card (decided, amends #342 D3); the bond Item's creation is marked as the module's write, so its note is re-attributed as PT14's are (`actorBridge` `moduleWriteOn`) |
| P2-17 LORE-NOT-ON-ITS-ENTITY | STATE | Lore routing needed the entity's exact name → `findEntityForLoreRouting` takes the one record a name can mean (a person's part name, a place's name inside another); a player character's doings go to the Session Log (`loreIsAboutPlayerCharacter`); titles filed one way (`filedLoreTitle`) |
| P2-18 GENERATED-NAMES / LOCATION-TYPE-BLANK | cosmetic | Working labels and unnamed figures were filed as typed; a detected place had no type → `nameMatch.generatedName` for an uncharted destination's label and a draft's name; a confirmed place the narration calls a derelict or a vault is created as one (`detectedSiteType`). Not done: adding narrated facts to an existing sheet's description (P2-17's routing puts them on the record's details), renaming generator output ("Derelict Settlement II", "Precursor Vault — Incomprehensible") |
| P2-19 CONTRADICTION-NO-EVIDENCE | UX | The review card showed the subject and a pointer to the fact → `describeContradiction`: the recorded fact from the ledger, the narration's words, the subject's proper name, on the card and in the panel row |
| P2-20 LENGTH-COUNTS-SENTENCES | narrator | "in N sentences" was met with N long ones (120–200 words at Length 3) → the Length setting is a word budget with a sentence cap and a per-sentence limit (`proseVariety.lengthBudget`: 22 words a step, at most 28; 30 words a sentence, 18 with audio narration on), in the system prompt's Length line and the move, paced and round user messages. **Unmeasured:** the fixed-beat before/after the issue asks for needs a live API |
| P2-21 LEVITY-DROPS-UNDER-THREAT | narrator | The Playful / Light description sat among the standing rules; the miss and its price were the newest thing read → both descriptions say the permission holds on a miss and under threat, and it is restated with the beat's context (`formatBeatProseBlock`, [8d] THIS BEAT'S PROSE) |
| P2-22 REPEATED-IMAGE / ITALIC-SPEECH | narrator | One simile in three narrations; an NPC's lines in italics → the comparisons of the session's last six narrator cards are listed as images not to reuse (`proseVariety.recentImages`, a regex over the cards' prose — nothing stored); the DIALOGUE rule sets speech in quotation marks, plain type |
| P2-27 PROSE-ORNATE-ONE-SHAPE | narrator | Every prose role asked for "vivid, atmospheric prose"; nothing asked for economy or varied a beat's build → the roles ask for plain, concrete prose; a standing PROSE rule (at most one comparison a narration, no chains); Wry reworded to dry and understated; a shape is picked per beat by its place in the session, never the one before's (`pickBeatShape`, five shapes) |
| P2-23 CACHE-NEVER-READ | COST | The whole system prompt went as one cached block that opened with the mode's role and changed every beat: every call wrote ~9.5k tokens, none read → `buildNarratorSystemBlocks` orders the prompt `standing` / `mode` / `beat`; the request sends three blocks, the first two each on a 1-hour cache breakpoint (`narratorSystemBlocks`, `splitNarratorSystemPrompt`). The sidecar instruction moved from last to the standing block; the context closes on RESPOND NOW, a pointer to it. **Unverified against the live API:** cache reads (Narrator Usage → Cache read above zero from a session's second narration) and sidecar compliance after the move — both need a played session. The other cached callers were checked: the classifier's, interpreter's, chronicle writer's and relevance resolver's system prompts are constants; the detection pass caches a one-line system prompt that is under the cacheable minimum (a no-op marker, left as is) |
| P2-24 USAGE-LOG-GAPS | telemetry | Narrator Usage rows carried a time with no date and nothing split the output; API Log entries named the model alone → date and time, **Prose** / **Fact block** columns (the reply's characters, split at the sidecar fence, applied to its output tokens), and every `apiPost` caller passes a label the API Log prints |
| P2-26 CLOSING-VIGNETTE-LONG | narrator | The End a Session vignette ran ~8 sentences against its 3–5 → the limit is restated last in its user message, and the vignette role says the length is a limit to count to. (The focus question in the issue's first draft was withdrawn there) |
| P2-29 NEW-ENEMY-PLAN-RARE | narrator / STATE | A `threat` plan was requested only from the table row "A new enemy is revealed" (`planRequestsFromSeeds`); an enemy that entered any other way had none until detection recorded a significant threat → the sidecar's `newThreats` (`normaliseNewThreats`, at most two a narration) → `secrets.planNarratedThreat`: Character Role, Goal and Disposition rolled once, filed undecided (`createdFrom.trigger: "narrated_enemy"`), decided by the next narration under DECIDE NOW. Skipped for a subject planned under any of its names (resolved and retired plans included) and for a PC's name. **Unverified in play:** whether the narrator emits the key when it should and not for passing hazards |
| P2-30 ONE-ENEMY-MANY-PLANS | STATE (duplicates) | Plans matched their subject by exact name → `secrets.planIsAbout` (any name the subject goes by, `nameMatch.sameSubject`), a decided plan for a planned subject merged into it, no agenda or threat plan filed beside one already about the subject. Names with no word in common: a narration with a being to decide is shown ALREADY PLANNED (`skeletons.plannedBeings`) and may answer `sameAs` — a price's new enemy then files nothing, a waiting plan is retired (`planAsAnother`), and the plan it joins keeps the other name in `aliases` (read by `subjectNames`, `selectRelevantSkeletons`, `oracleConsult.planForQuestion`; shown to the GM as **Also called**). A *decided* duplicate is still a GM's to Retire |
| P2-31 ORACLE-CONSULT-PLAYER-ROLL | multiplayer | A player's `!oracle yes` ran on a client that cannot read the plans, so it was rolled at the odds given → `oracleConsult.requestPlanOdds` asks the canonical GM over the module socket (`oracleConsult.ask` / `.answer`; `registerOracleConsultSocket` at ready) and gets back the odds word only; no GM, no plan, or no answer in `CONSULT_WAIT_MS` (8 s): the player's odds stand |
| P2-25 ABILITY-SCAN-MULTI-OBJECT | SILENT | `parseHaikuResponse` sliced from the first `{` to the last `}`: a second object, or trailing text with a brace, was invalid JSON and the scan returned `[]` → every complete top-level object is read (its `matches`, or itself when it is a match), duplicates dropped, and a reply with no JSON object is logged with its text. Not done: structured outputs for this call — the tolerant parse covers the observed failure without changing the request |

Still open in this issue — not yet built on the branch (see the issue for each item's fix): **P2-10** (ask Burn / Improve / Keep before the price and narration — decided, a pipeline change). **P2-33** (scope-index row) is done. **P2-11** and **P2-28** (for a scene with a countdown) were built by issue #353. **P2-32** is a play-test checklist, not code.

### Narrative skeleton (issue #353) — residuals

| ID | Kind | Status |
|---|---|---|
| ORACLE-CONSULT-PLAYER-ROLL | ✅ fixed (issue #354 P2-31) | `!oracle yes` is rolled on the typing client (`RUN_ON.AUTHOR`). A GM's roll about a planned subject takes its odds from the plan's truth (issue #353, decided); a player's was rolled at the odds they gave. It now asks the canonical GM for the odds (`oracleConsult.requestPlanOdds`) — the roll itself still runs on the player's client. |
| SKELETON-CLOCK-RESET-REWIND | residual | When a plan's clock fills, its trigger vignette plays the next escalation step and the clock goes back to empty for the step after. A Burn Momentum or Improve Result that then rewinds the price which filled it takes the step back (the superseded vignette's plan writes are undone) but finds the clock already empty, so the step is paced again from 0 rather than from one short of full. |
| SECRET-ROLLS-CARD-XCARD | by design (residual) | When a narration reveals a plan's truth, the oracle rolls behind it are posted to the table ("The oracle, behind the scenes"). The X-Card on that narration undoes the reveal, its lore and its ledger truth, but leaves that card: the rolls are table words (a role, a goal, a disposition), not the removed beat's content, and taking a posted card back would need a new X-Card path. Revisit if a playtest shows the card spoiling a plan the X-Card put back. |
| SCENE-VOW-THRESHOLD-LINK-BY-NAME | residual | A fight linked to a vow at its threshold card carries the vow's name only (`linkedVowName`); the vow this scene serves ([2.6], `openThreads.selectSceneVow`) resolves it by an exact, unique name, so two open vows of that name give no line. An expedition's or scene challenge's link carries the vow's id (`linkedVowId`). Stamping the id at the threshold card would close it (issue #353 R3). |
| TRACK-VOW-NAME-SNAPSHOT-IN-4J | residual | [4j] OPEN PROGRESS TRACKS prints a track's `linkedVowName`, the name the vow had when it was linked, so a vow renamed since shows its old name there; [2.6] and the Progress Tracks and Session panels resolve the link by id and show the current name (issue #353 R3). |
| BACKGROUND-VOW-BY-POSITION | by design (residual) | "Is a quest in play?" (Begin a Session's no-vow check, issue #353 R3) treats a character's first vow that is not the shared inciting vow as their background vow, the foundry-ironsworn convention. A character who never wrote a background vow has their first own quest counted as it, so Begin a Session can say no vow is in play while that quest is open. The narrator's "Background vow" label is unchanged. |

### Alpha 23 playtest (issue #348) — all fourteen resolved in the v1.8.1 cycle

| ID | Kind | Fix |
|---|---|---|
| PT11 REINTERPRET-SILENT | UX / LOSE-STATE | The confirm dialog's "Re-interpret" settled it false and the pipeline returned: no re-reading, no card, no notice — and a card button's move left its card claimed ("Rolled") for a move never made → the cancel reads "Cancel — re-word" ("Cancel" for a forced move); a "Not rolled" notice is whispered to the author, the roller's players and the GMs; a typed line goes back in its author's chat box; a card's claim is written back (`sourceCard` / `releaseSourceCard`) |
| AB06 (part) CLAIMED-CARD-FORCED-MOVE-DROPPED | LOCK (dead card) | Issue #347's confirm-closed, owed-resist and inciting-⚔-at-the-lock cases: the card is handed back (the suffer card re-opened, the ⚔ re-armed) and the table told. The rest — a refused start, a failure before the dice, the GM-handover case — is fixed by issue #347's own AB06 (below), merged onto the same path: `sourceCard`, `releaseSourceCard`, the "Not rolled" notice |
| PT05 (part) CLASSIFIER-NO-RECENT-SCENE | UX | The pacing classifier saw a one-line scene frame and the interpreter the line alone, so "We're on our way" after an NPC sent coordinates was offered no travel move and named no destination → both read the last three narration cards (`getRecentSceneForReading`). Issue #348 PT05's other halves — an unknown destination as Undertake an Expedition, a time skip as travel — stay open |
| MOVE-BUSY-NOTICE | UX | A line typed while another move was narrated was refused with a toast on the canonical GM's screen only → a "Not rolled" notice is whispered to its author, and the line goes back in their chat box. Free-flow only: in Batch Mode a typed line is table talk |
| PT01 | fixed (narrator) | buildPacedNarrativeUserMessage (src/narration/narratorPrompt.js) told the narrator "Do not introduce unestablished plot elements. The narrator is continuing the scene, not advancing it." That held the story still ("not yet", "twenty minutes out"). The wording now keeps "do not decide what a move would decide", lets small developments and the time the player's line implies pass, and cuts a time skip ("wake me when we get there") to the next moment that needs the player. |
| PT02 | fixed (narrator) | move_resolution, paced_narrative and round_resolution only asked for "vivid, atmospheric prose". buildNarratorSystemPrompt now adds a "### HOW A BEAT ENDS" section for those three modes (BEAT_ENDING_RULE): each beat changes something (restating the mood does not count); it ends on something unresolved inside the story, never on a reflective line; a recurring motif changes or is dropped; it stays within the narrator permissions; and the hook is an event in the story, never a menu. ANTI_SUGGESTION_CLAUSE is unchanged and comes before it. Other modes do not get the section. |
| PT03 | fixed (narrator) | Perspective "Auto" was resolved on every call from the connected non-GM users, so a second window or player connecting mid-session flipped the narration between "you" and names. Per the maintainer's decision it is now decided once, at Begin a Session: lifecycle.js beginSession records campaignState.sessionPerspective {sessionId, perspective}. mintSession clears it, and it is in SESSION_MINT_FIELDS, which every Begin path persists. buildNarratorSystemPrompt reads it through the new sessionPerspectiveOf. A round speaking for two or more PCs stays third person (Z40). A session that was never begun still counts users per call. Field documented in schemas.js; docs/flows/narrator-context-flow.md and docs/file-structure.md updated. |
| PT04 | closed (narrator) | Closed as folded into issue #290 (prompt-contract checks), per the maintainer's decision. A "nothing happened" checker would be a second model call, or a heuristic, after every narration, so it is not trivially cheap. PT02's beat-ending rule addresses the cause in the prompt. |
| PT13 | fixed (narrator) | Narrator prose was HTML-escaped after stripMarkup, so Markdown emphasis showed literally ("*Savela*"). The paced move-hint is even asked for as *…*. A new proseToHtml in src/audio/segments.js strips <npc> markup, escapes the text and renders **bold** / *italics*; a lone asterisk with a space after it ("5 * 3") is left alone. Every narrator-prose card sink now uses it: narrator.js (move, paced, round, scene, oracle, recap), the galley, closing and inciting-incident vignettes, the clock vignette cards (clocks.js, sessionLifecycleDialogs.js) and the lore recap page (truths/generator.js). The audio render hook (audio/index.js), which rewrote the prose element's textContent, now uses it too. The stored narrationText is unchanged. |
| PT05 | fixed (travel) | PR #350 had already given the classifier and interpreter the recent scene. Added three things to src/pacing/classifier.js. (1) The CURRENT SCENE now lists the charted places (formatChartedPlaces: tracked settlements, planets and locations, the active sector's first, never an unexplored site). (2) A new TRAVEL TO AN UNCHARTED DESTINATION rule: travel toward anywhere else is at least NARRATIVE_WITH_MOVE_AVAILABLE with undertake_an_expedition, hazard or not, even when the player says "set a course". (3) A new A TIME SKIP IS NOT DOWNTIME rule, and the downtime definition now excludes a journey still to be made. A forced travel move with no destination (a paced card's Roll) now reads its destination and stat from the line and the recent scene: travel.js readForcedTravelDestination, called from movePipeline.readMove. Updated docs/flows/exploration-flow.md §0.5. |
| PT06 | fixed (travel) | New src/moves/travel.js. chartedPlaceFor uses the arrival's own name resolver (resolveCurrentLocationName, injected as a new movePipeline host helper) and never treats an unexplored site as charted. rerouteUnchartedCourse: movePipeline.readMove reads a Set a Course whose destination is not a charted, known place as Undertake an Expedition on every Mischief setting, Lawful included, and reads its stat from the line. The confirm dialog's rationale says why, the move card shows a note (resolution.courseRerouted, rendered by index.js formatMoveResult), and the existing Cancel lets the player re-word. A course named by its pin's Actor (a token drag) stays Set a Course. The interpreter prompt now describes Set a Course as a known route to a charted place and Undertake an Expedition as any journey toward a place that is not. |
| PT07 | fixed (travel) | New siteDiscovery.recordUnchartedDestination, called from index.js applyOutcomeEffects when an Undertake an Expedition begins a track whose label names no site and no tracked place. It creates three things in the existing stores: a location Actor (type 'uncharted', status unexplored); a discovery record (workingLabel: true) in the active sector's next periphery slot (new sectorGenerator.layoutDiscovery), written to the working copy that persistResolution saves (an upgrade saves `sectors` immediately); and a map pin (new sceneBuilder.addSiteToScene, which shares new siteNoteData / sitePassageData helpers with createSectorScene). It also links the track's siteId. Finish an Expedition then charts it through the existing reveal flow, docks there and posts a Site Discovered card that invites renaming; a revealed site's pin already follows renames. The interpreter now names an unnamed destination with a working label ("Archer's rendezvous — the gap"). Updated exploration-flow.md §0 and site-flow.md. |
| PT08 | fixed (travel) | index.js applyOutcomeEffects: every arrival (Set a Course and Finish an Expedition, whatever the Ship Positioning setting) appends to the narrator's MOVE OUTCOME. The line is "[ARRIVAL: The ship has ARRIVED at <place>. Open the scene there — not on the departure or the journey. …; end the beat on something unresolved there.]" (arrivalNarratorLine). A strong hit's arrival favours the crew; a weak hit's comes with a cost or a complication. Every narration of the resolution reads it: the pipeline's, a Batch round's and an upgrade's re-narration. A Set a Course naming no destination falls back to the scene's established destination (travel.js sceneDestination: the uncharted destination recorded last, PT07's location). If none, it is told it ARRIVED at its destination. |
| PT09 | fixed (travel) | index.js postSetACourseFeedbackCard now names the place: the resolved place's current name, else the destination's own words. It says "Token moved to X" only when the token actually moved; maybeUpdateShipPositionFromName gains a `report` option fed by syncCommandVehicleTokenToPosition, and the token-drag path uses moveCommandVehicleTokenToDestination's return. A charted place with no map pin says the position is set but the token did not move. When no position was written (no destination named, or no command vehicle) the card says so and points to `!at <place>`. The applied line no longer says "arrived at the destination". |
| PT10 | fixed (travel) | applyOutcomeEffects now returns the Set a Course card as an `afterMoveCard` thunk instead of posting it. movePipeline.rollMove posts it after postMoveResult. An upgrade's card is posted at once, because its roll card is already on the table. |
| PT12 | fixed (audio-art) | Pressing Play made every segment of a card before any sound: buildPlayableSegments synthesised each segment in turn, and on the audio GM also uploaded each one to the cache, before the PlaybackSession was created. Now only the first segment is made before playback starts. Later segments are made one at a time behind it; their src is a promise that PlaybackSession._playFromCurrent awaits when it reaches them. The audio GM plays a clip's bytes as soon as they are synthesised and the upload continues behind it (synthesisedBytesOnce). A stopped Play, an X-carded card, or a card another card took over makes no more segments. Synthesis still starts only on Play, so there is no pre-synthesis and no new setting (src/audio/index.js, src/audio/playback.js). |
| PT14 | fixed (audio-art) | The note "+1 momentum (now 5)" comes from the ironsworn system's change log. I confirmed this in the pinned vendor source: chat-alert.ts sendToChat posts an emote with speaker {actor}. It is posted on the client that made the change, so a change the module made read as the player speaking. actorBridge now writes through an internal moduleUpdate that marks the Actor while the write is in flight. A preCreateChatMessage hook (registerSystemNoteAttribution, registered in index.js) re-attributes the change-log line posted during that write: no Actor speaker, and the PC's name leads the line. A player's own sheet edit and the module's own cards keep their speaker. The "We're in" line shown as Gamemaster: a paced card's Roll with no PC to roll it re-posted the player's line as the person who pressed it, so a GM's press showed the player's words under the GM's name. It now keeps the speaker the line was typed under (cardActions speakerOfLine). |

### The v1.8.1 open-item sweep — issue #348 and the earlier audits' open items

At the maintainer's request (2026-11-12, "Please close out the remainder of issues 347 and 348, as well as issues identified but not resolved on previous bug audits"), every item still open in this file was re-checked against the code and fixed, closed with a reason, or deferred. Nine area passes ran in parallel, one branch each, each fix with a regression test; the maintainer's decisions: apply each item's written proposal; re-check by-design / cosmetic / not-reproduced items and fix them if real and cheap, else close them with the reason. Three stay open (deferred, kept in their lists below): FORCED-MOVE-HOLD-RELOAD, CLARIFY-ON-GM and INDEX-EXTRACTION. None of the fixes has been checked in a live Foundry world yet.

| ID | Area | Outcome | What changed / why |
|---|---|---|---|
| CHARACTER-STATE-ENTITY-UNDECODED | integration | fixed | One shared one-pass decoder, `src/system/htmlEntities.js` `decodeHtmlEntities` (named + numeric entities): actorBridge's CHARACTER STATE `stripHtml` now decodes (it decoded nothing), `narratorPrompt.stripHtml` no longer decodes `&amp;` first ("&amp;lt;" became "<"), and `notesAsCardText`, the truths dialog's `htmlText` and the World Journal panel use it in place of their own tables. Test: tests/unit/htmlEntitiesShared.test.js |
| ERROR-TEXT-BLAMES-KEY | narrator | fixed | Every narration failure said "check your API key and proxy": a move's fallback card, a round's, @scene's "Scene query failed", and the paced "not narrated" notice. Every move-pipeline exception said "Move interpretation failed. Check your API key…". A new src/narration/failureReason.js (claudeFailureReason, NO_CLAUDE_KEY_REASON, EMPTY_REPLY_REASON) names the cause: a refused key (401/403), a rate limit, overloaded (529), a server error, another HTTP refusal, a timeout, a reply cut off or empty, unreachable, or else "see the console". narrator.js passes the last failure (the retry's, when there was one) to each card, and index.js's notification uses it. |
| ROUND-CLOSED-UNNARRATED-WORDING | narrator | fixed | Two fixes in src/batch/driver.js and narrator.js. (1) A round closed unnarrated at session end, because it was waiting for a GM with a Claude key, posted a card saying "check your API key and proxy". narrateRound now takes noKeyReason, and narrateTheRound passes "the session ended while the round waited for a GM with a Claude key to narrate it". (2) A round End a Session left while the X-Card was in play stayed narrating until the next load's recovery closed it. narrateTheRound and onCampaignStateChanged now close such a round when its session is over: narrateRound posts the paused notice listing the results, and tellClosedUnnarrated tells the GMs it "was held by the X-Card". |
| PACED-ROUTER-THROW | narrator | fixed | narratePacedInput is now a wrapper that never throws: a throw outside its guarded steps posts the "That line was not narrated" notice by cause. In routePacedInput (src/pacing/router.js), a throw in the pacing check now warns the GM that the line is read as a move instead, and still falls through to the move pipeline as before. A throw while starting a narrative line's narration posts the notice through the new tellPacedLineNotNarrated, and the line is no longer handed to the move pipeline. |
| PACED-DISCARD-UNDER-XCARD-SILENT | narrator | fixed | Applied the written proposal. When the X-Card was played while a paced narration was being written, both xCard.interrupted checks in narratePacedInput returned null and posted nothing. They now post postPacedNarrationPausedCard ("That line was not narrated — say it again once a GM resumes", worded by xCardDiscardReason), as the discards of a move or an @scene question already do. |
| SIDECAR-UNFENCED | narrator | fixed | Re-checked: still real (extractSidecar returned an unfenced object as prose), and the fix is cheap. When there is no fence, extractSidecar (src/factContinuity/sidecarParser.js) now reads a trailing object that opens on its own line with a sidecar key (newTruths, stateChanges or sceneFrame) as the sidecar. A complete object is parsed; one cut off is stripped and reported as a parseError. Prose that merely contains braces is untouched. |
| CLOSING-VIGNETTE-FIRST-PC | narrator | fixed | Applied the written proposal ("the present PCs, as the galley"). End a Session's closing vignette (src/safety/sessionLifecycleDialogs.js) passed no actorIds, so its CHARACTER block was the campaign's first PC whoever was at the table. It now passes the PCs at the table (collectGalleyParticipants(cs).active), as the galley vignette does. With none present it gets no block. The narrateSessionVignette docstring, docs/file-structure.md and docs/flows/narrator-context-flow.md are updated. |
| PRIVATE-CHANNEL-NO-PINS | narrator | fixed | Applied the written proposal. buildPrivateChannelStory (narrator.js) now takes {actorId} and returns pinned: that PC's pinned Chronicle entries, read by readPinnedEntriesOf, which readPinnedChronicle now shares. buildPrivateContext's CHARACTER block (src/private-channel/context.js) lists them with the main block's wording. One assertion in private-channel.test.js that checked buildPrivateChannelStory's exact arguments now expects the new third argument. |
| PRIVATE-WINDOW-SESSION-CHANGE | narrator | fixed | PrivateChannelApp (src/private-channel/app.js) read the session's saved turns once and kept them. Left open across a session change, the window kept showing the old turns and sending them to the narrator. It now records which session its turns belong to (this.sessionId). #syncSession, called on render and before a send, starts the new session's conversation when the session has changed; the old session's page keeps its turns. A window that has not re-rendered still shows the old turns until its next render or send. |
| IRON-TRUTH-COLON | narrator | fixed | Re-checked: still real, and the fix is cheap. buildVowSwearingUserMessage (narrator.js) joined a truth's title and description with ": " even when the title ended its own sentence ("…to the Forge.: Many…"). A title ending in . ! ? or … (optionally followed by a closing quote or bracket) is now followed by a space. Other titles keep ": ". |
| TRUTHS-CUSTOM-PARSE | narrator | fixed | The World Truths dialog's save parser (src/truths/generator.js) had three problems, all fixed. (1) A custom truth reached the narrator as its first paragraph only; it now keeps every paragraph (the first as title, the rest as description). (2) A custom truth left empty was read from the category's inspiration text; that text is now recognised by its opening (new TRUTH_TABLES[id].inspiration in tables.js, taken from Datasworn your_character) and dropped, so an empty custom truth holds no truth. A last paragraph that is not the inspiration text, such as a GM's own edit, is kept. (3) A dialog in another language keyed truths by its own category names. A save holding all 14 categories is now keyed by position, since the dialog writes them in Datasworn's order, which matches TRUTH_CATEGORIES (checked against the vendor source and @datasworn/starforged). Remaining: a non-English save that skips categories keeps its own names as keys, because its headings cannot be mapped. |
| TEXT-SUBJECT-LOWERCASE | narrator | fixed | A text subject's state key is lowercased (subjectKey), and buildLedgerBlock labelled CURRENT STATE from the key ("the ember gate"). applySidecar (src/factContinuity/ledgers.js) now stores the subject as written on each state entry (subjectText, documented in schemas.js). The ledger block labels a text subject with the newest subjectText that still matches the key, else the key. promoteTextSubject drops subjectText; the demotion back to a text subject sets it to the name. factContinuityLedgerBlock.test.js had pinned the lowercase label as expected behaviour; it now expects the written case. |
| TIER-PASS-TRUNC-SILENT | narrator | fixed | When appendGenerativeTierUpdates (src/entities/entityExtractor.js) got a reply with no complete JSON object (cut off at max_tokens, or malformed), it dropped every detail, and only a console warning named the cut. It now logs a warning naming the entities and, on a GM's client, shows a notification (notifyTierFailure, matching the detection pass's own notice): "new details for <names> from this narration were not recorded — the reply was cut off or malformed". A readable reply with no updates stays silent. |
| WAYPOINT-PLACEHOLDER-LITERAL | travel | fixed | The expedition-progress executor in src/moves/sufferDialog.js (Explore a Waypoint's 'mark progress' pick with no expedition open) now imports UNNAMED_EXPEDITION_LABEL from expedition.js instead of copying the literal "Expedition". |
| WAYPOINT-ALT-AFTER-UPGRADE | travel | fixed | Applied the written proposal. resultUpgrade.reconcileChoices, which every Burn Momentum or Improve Result runs, now stamps the move card's waypoint alternative closed (waypointRewardClaimed = 'burn' or 'improve') alongside the choice cards it retires. cardActions.applyWaypointOraclePick also refuses an upgraded card whose stamp never landed, and index.js wireWaypointOracleButton titles the disabled button "The result changed…". |
| TOKEN-ANCHOR-GENERATOR-IDS | travel | fixed | sceneBuilder.placeCommandVehicleTokenIfPresent matched the position's nearestSettlementId only against the generator's settlement ids. It now finds the scene's pin by either the generator id or the Actor id (findSettlementNoteById), including a site's pin for nearestLocationId. As a fallback it checks map data by generator id or a discovery's actorId, so a ship whose record names its settlement's Actor no longer lands at the map centre. |
| OLD-SCENE-TOKEN-DOCKED | travel | fixed | factContinuity/shipPosition.formatShipPositionLine: a pre-U53 token placement record now reads "near". Such a record has `scene_token`, a settlement id and its pin's label as free text — none of which a token-drop arrival writes, since its free text is empty. A token-drop arrival still reads "docked at". Updated exploration-flow.md. |
| SECTOR-DUPLICATE-NAMES | travel | fixed | Fixes the remaining same-sector clash; the cross-sector case was already fixed by #342 Z15 and #345 AA06. sectorGenerator.generateSector keeps settlement names unique within a sector: a clash rerolls the Settlement Name table up to 12 times, then gets a numeral ("Bleakhold II", reusing the module's NAME_NUMERALS), as repeated site names already are. Two settlements of one name in a sector can no longer be generated. |
| SECTOR-CREATE-PARTIAL | travel | fixed | Re-checked first. Actors were already adopted on retry (#337 Y34), but the Scene and the Sector Record journal were created again, and the Actors were orphaned if the GM re-generated instead. sectorPanel.createSector now rolls back a failed run. It deletes the Actors it added to the working copy's settlement, connection and location id lists (plus the connection's unmarked PC bond Items), and the Sector Record journals and Scenes flagged with that never-stored sector id. A retry or a re-generated sector then makes one set. Updated the migrator.js comment. |
| SECTOR-CARD-GAPS | travel | fixed | (1) The narrator's settlement card (narratorPrompt.js CANONICAL_FIELDS_BY_TYPE.settlement) now shows Projects and Trouble. (2) sectorGenerator.applyStubsToSettlementEntities now writes the rolled-details line to every settlement Actor, including those with no narrator stub (stubs off, no key, failed call). An empty description is skipped. |
| PACING-CHARACTER-SOLO | travel | fixed | index.js getActiveCharacterForPacing fell back on the first Actor with hasPlayerOwner. It now follows the speaker rule (issue #321 U23): with no speaker it uses the one PC of a one-PC world, else none. A PC-less player at a multi-PC table no longer gets another player's character name in the classifier's prompt. |
| CUSTOM-ORACLE-TO-RANGES | travel | fixed | oracles/customOracles.js ENTRY_LINE_RE now accepts the word "to" between two numbers, case-insensitive, as a range separator. "3 to 4 Wary" is the range 3–4, "Wary"; a "to" not followed by a number stays part of the result. |
| SHIP-TYPE-IN-CONFLICT | travel | fixed | New ship.js rollSingleShipType rolls Starship Type for one ship's own type and rerolls the 95–100 "Ships in conflict" encounter row, up to 6 times, returning empty if every roll lands there. It is used by seedStarshipActor and entityExtractor's rollFreshShipSeed (a detected ship's draft Confirm). |
| XCARD-AUDIO-PLAYING | audio-art | fixed | Setting the xCarded flag re-renders the card, but onNarratorCardRendered only hid the Play button, so audio already playing went on to the end. The render hook now silences that card on every client (silenceCard): a load still in flight is cancelled, segments not yet made are not made, and a session that is playing or paused is stopped. togglePlayback also refuses to start an X-carded card. Other cards' audio is left alone (src/audio/index.js). |
| AUDIO-KEYED-PLAYER-STORAGE-REFUSED | audio-art | fixed | I applied the written proposal. handleCacheAsk now answers a keyed Player's audio.cache.ask for a clip the GM is holding after a refused upload by uploading those bytes again (synthesiseToCacheOnce with the held clip; nothing is synthesised and no key is needed). It previously answered "no clip", and the player synthesised the clip again on their own key (src/audio/index.js). |
| AUDIO-KEYED-NONCANONICAL-DUP | audio-art | fixed | A keyed client that was not the audio GM made a missing clip on its own key while the audio GM made the same clip on its own key. The keyed GM files no relayed bytes (issue #338 D10), so the GM's next Play made the clip yet again. Now, whenever a GM holding an ElevenLabs key is connected (the new gmGate.hasAudioKeyedActiveGM), a keyed client asks the audio GM to make the clip (audio.synth.request, which dedupes and caches it once). The client uses its own key only when no keyed GM is connected, or when the GM returned no clip (src/audio/index.js resolveSegmentSrc, src/multiplayer/gmGate.js). |
| AUDIO-FORGE-ORIGIN-SHARED | audio-art | closed | Closed as accepted. decisions.md already records "A clip URL's layout is not guessed". Tightening further needs a live Forge world to show the GM's own Assets Library prefix, because every Forge account shares the origin. Since the AUDIO-FORGE-ANY-WORLD fix, this residual applies only to worlds hosted on The Forge; I updated the comments in src/audio/cache.js and src/audio/index.js to say so. |
| AUDIO-FORGE-ANY-WORLD | audio-art | fixed | isCachePathFor accepted an Assets Library URL in every world, including self-hosted ones whose cache can never name such a URL. It now accepts one only when the world is running on The Forge. Detection uses ForgeVTT.usingTheForge, the pattern documented in docs/foundry-reference/foundry-api-reference.md, with a forge-vtt.com host as a fallback (internal runningOnTheForge, src/audio/cache.js). |
| PORTRAIT-TWO-GM-FIRST-GENERATION | audio-art | fixed | I applied the proposal to claim the portrait on the record. generatePortrait now writes portraitClaim {by, at, token} to the entity's record before the image is bought, then re-reads it in case another GM claimed at the same moment. Another GM's generation that finds a standing claim buys nothing and is told why. A claim stands while its GM is still in the game and for at most five minutes. The link write clears the claim, and a generation that linked nothing releases it in a finally. It also re-reads the record before buying, so a portrait linked since the caller read the record is returned instead (src/art/generator.js). |
| ENTITY-PANEL-PORTRAIT-FAILED-TOAST | audio-art | fixed | I applied the proposal for the generator to report a reason. generatePortrait and regeneratePortrait take an optional report argument and set report.told when they showed their own reason: no key, an auth error, the content filter, a refused save, a locked or spent portrait, or another GM making it. The Entities panel shows its generic "failed — check console" toast only when nothing was told (src/art/generator.js, src/ui/entityPanel.js). |
| ART-REGEN-PAGELESS-ENTRY | audio-art | fixed | A regeneration whose new page the world refused left a page-less "Art: …" entry that nothing would ever complete, because the entity is locked by then. regeneratePortrait's refusal path now deletes that entry (new storage.discardPagelessAssetEntry). The earlier portrait stays the entity's, locked (src/art/generator.js, src/art/storage.js). |
| ART-INDEX-RESURRECTED | audio-art | fixed | I applied the written proposal. persistResolution's art-index merge keeps every entry in the store, and keeps an entry that only the working copy holds only while a journal entry still holds that portrait (found by name, or by its assetId flag after a rename). A move in flight no longer writes back an entry that the X-Card's deleteEntityArtAssets dropped (src/moves/persistResolution.js mergeArtIndex). |
| REGENERATE-PORTRAIT-ORPHAN | audio-art | fixed | I applied the written proposal. regeneratePortrait now checks, after the image call, that the entity's host document still exists, as generatePortrait does. If it is gone, nothing is stored and the claim is not given back, because re-storing the claimed portrait would re-create the entry that the X-Card removal had deleted (src/art/generator.js). |
| AUTOSEED-KEYLESS-CANONICAL | audio-art | fixed | I followed the Z67 pattern, as the entry suggests. A new world setting, artKeyedGmUserIds, holds GM user ids only. Each GM advertises its OpenRouter key there on ready and through the key's onChange, and the existing registry-healing hook covers it. New gmGate functions isArtGM and hasArtKeyedActiveGM pick the GM. New src/art/portraitRouting.js: generatePortraitWhereKeyLives makes the portrait locally when this client holds a key; otherwise it asks the art GM over the module socket (art.portrait.request). The art GM's listener (registerArtSocket) reads the record itself and makes only a first portrait of an existing entity that has a source description and no linked portrait. The seeds (connection.js, ship.js) and entityExtractor.postCreationEnrichment now call it, and their three private hasOpenRouterKey gates are deleted. |
| FINALISE-PLAYER-KEY | audio-art | fixed | The entry offered two alternatives; I chose GM-only buttons, following the portrait buttons' U33 precedent. Finalise writes the GM-owned record and starts a GM-only portrait, so a player's press billed their own Claude key for a write the world then refused. ✦ Finalise and ↻ Regenerate flavour now render for GMs only, and a player's click on a button left over from before bills nothing and says the GM finalises. Envision and History are unchanged: a player's press posts its chat card on their own key, and only a GM's press also appends to Notes (src/ui/entityPanel.js). |
| KEYS-NOT-CLEARABLE | audio-art | fixed | I applied the written proposal: the About tab now shows a Clear button beside each stored Claude, OpenRouter (GM-only, like its field) and ElevenLabs key (clearApiKey action, with a DialogV2 confirmation). Clearing writes the empty key, so the key's onChange takes a GM out of the matching key registry. The save note now mentions Clear (src/ui/settingsPanel.js). |
| XCARD-ORACLE-FOLLOWUP-UNWRITTEN | xcard | fixed | When the X-Card was played while an oracle follow-up was being written, the follow-up was thrown away and no card posted. Nothing then named the raw oracle card, so its answer stayed in RECENT ORACLE RESULTS. The interrupted branch in narrateOracleFollowup now calls forgetInterruptedOracleResult, which drops that card's ring entry. On the canonical GM it writes directly on the write chain, because a relayed action inside the oracle.narrate handler would deadlock. From a player narrating on their own key it goes through a new GM relay action, oracle.forgetResult → forgetOracleResultFromRelay; only the card's author or a GM may use it. An !oracle with no follow-up at all keeps its raw answer: that is the dice roll, not narration (src/oracles/oracleFollowup.js, src/narration/narrator.js, src/multiplayer/gmRelay.js). |
| XCARD-PERSIST-WINDOW | xcard | fixed | mergeSceneLedgers (used by persistSceneLedgerFields and persistResolution) re-retracted only the X-carded narration's own ids. An X-Card or strike landing between applySidecar's read of the store and the persist's turn on the write chain let a restatement be written live. Applying the proposal, the merge now re-checks each narrator truth it adds against the store's retracted truths (findEquivalentTruth) and the session's strikes and blocks (findSessionStrike, blocked) at its turn, using a new internal restatesRetraction. GM and player truths and re-narrations of superseded facts are left alone (src/factContinuity/sceneLifecycle.js). |
| SESSION-LOG-STORY-NOT-REBUILT | xcard | fixed | Applied the maintainer's proposal of a Session Log write at the mint's catch-up. retractSessionLogSummary now marks a story it empties (narrativeXCarded). The new restoreSessionLogStory writes the regenerated summary back as "Story so far", but only for a story the X-Card emptied and only while the page still has none. It is called from rollSessionIfDue after finalizeSessionSummary, and from catchUpUnsummarisedSession when LAST SESSION is caught up later (src/world/worldJournal.js, src/session/lifecycle.js, src/narration/narrator.js). |
| UPGRADE-REGEN-IN-FLIGHT | xcard | fixed | A rolling-summary regen whose call was out when a burn or improve superseded one of its source cards was stored after the supersede. Following the proposal (a check like AA25's X-Card play count), dropSummaryOfSupersededCards now records the cards a supersede has begun on (a bounded map, kept for 2 minutes without the burnSuperseded flag). getRollingSessionSummary discards a summary whose source holds such a card, both when the reply returns and inside its chained write (src/narration/narrator.js). |
| SAFETY-GLOBAL-LISTS-CROSS-WRITE | xcard | fixed | Applied AA35's heal to the global Lines and Veils. A new updateSetting/createSetting handler, onSafetyListsWritten, runs on the canonical GM only and skips a stale page. When a campaignState write, or a write to the global Lines or Veils setting, leaves campaignState.safety.lines/veils different from the world settings, it writes them back on the write chain. A campaignState holding no safety copy at all is left to the ready-time sync; this follow-up kept the harness tests' bare-state writes clean (src/ui/settingsPanel.js). |
| XCARD-KEEPS-UNDISMISS | xcard | fixed | Applied the proposal. undismissEntityName now records an un-dismissal made by a narration (a Make a Connection on a dismissed NPC, an identity reveal onto a dismissed name) in a new store-owned campaignState field, undismissedByNarration, as {name, narrationId}. It un-dismisses nothing for a narration that is already X-carded. The X-Card's finish calls the new restoreNarrationDismissals after the connections and renames are undone. It dismisses the name again unless a record still holds it (AA55), and makes no write when nothing is logged. A dismissed row that the hit confirmed goes back to dismissed (createdFromDraft.status → reopenConfirmedDraftRow). Files: src/entities/entityExtractor.js, src/context/safety.js, src/schemas.js, src/moves/persistResolution.js. |
| XCARD-CHRONICLE | xcard | fixed | Every automatic Chronicle entry now carries its narration's narrationId. All five scheduleChronicleEntry call sites (move, move retry, paced, paced retry, round) pass it, and addableEntry and buildEntry keep it. The writer checks isNarrationXCarded before and after its Haiku call. addChronicleEntry re-checks at its turn on the actor's write chain, and the relay refuses with reason 'xcarded'. The X-Card's finish calls the new retractNarrationChronicle, which removes those entries, pinned or not, following the tier-detail rule. The recap's cache key changes with the entries, so the recap is rebuilt (src/character/chronicle.js, chronicleWriter.js, src/context/safety.js, src/narration/narrator.js). |
| XCARD-INCITING-PREMISE | xcard | fixed | The campaign premise (campaignState.incitingIncident) now records its narration's id. The pause write in applyXCardToNarratorMemory drops the premise (the new dropXCardedPremise) when the X-carded cards include its narration. A premise saved before this change has no id; it is dropped when an X-carded inciting card of its session is among the removed cards (src/session/incitingIncident.js, src/narration/narrator.js, schema comment). |
| XCARD-POST-RACE | xcard | fixed | A new canonical-GM createChatMessage hook, registerXCardLatePostHook in src/context/safety.js, is registered at ready in src/index.js. Every narrator path stands down while the X-Card is active, so a narration card (not a fallback, published reflection, contradiction, recap or draft card) created while xCardActive is set must be one that passed its check just before the play. The hook removes it the way the X-Card removes a narration, by calling applyXCardToNarratorMemory(cs, { cards: [card] }) on the write chain and then finishXCardRemoval: the card is flagged, its ledger entries are retracted, its id is kept on xCardedNarrationIds, and its capture and oracle results are undone. |
| SUPERSEDED-TRUTHS-SHARE-LIMIT | xcard | fixed | rememberNarratedTruths now marks entries for superseded truths (superseded: true). It keeps the newest 50 live entries and the newest 50 superseded entries separately, in their original order. Before this, a scene with many live truths could push out a struck narration's truths, which an X-Card on the upgraded beat then left unblocked (src/factContinuity/retractions.js). |
| DELETED-MESSAGES-KEPT | xcard | fixed | Re-checked: the issue was still real and cheap to fix. mintSession now clears deletedChatMessages, and the field is added to SESSION_MINT_FIELDS so every mint caller persists it. The X-Card's pick reads the current session's records only, so the old ones did nothing (src/session/lifecycle.js). |
| STRIKE-CHRONICLE | xcard | fixed | propagateRetraction now calls the new retractStruckChronicle. It deletes the session's automatic Chronicle entries that state the struck fact about its subject, using lore's matcher (loreStatesStrike on the entry's text). Pinned or player-edited entries stay, as a pinned tier detail does. The deletes go through the canonical GM with requestChronicleEdit's GM-only delete, so a strike made on a co-GM's client never writes the journal directly. The campaign recap's cache key changes, so the recap is rebuilt (src/factContinuity/retractions.js, src/character/chronicle.js). |
| XCARD-LATE-REVIEW | xcard | fixed | runConsistencyCheck now receives the audited narration's id from applyNarratorSidecar. It checks isNarrationXCarded when the Haiku reply returns and again before each review card. For a removed narration it posts no Narrative Review card and logs no telemetry, both of which quoted the removed prose (src/factContinuity/consistencyCheck.js, src/narration/narrator.js). |
| XCARD-STRIKE-ENDSCENE-RACE | xcard | already-fixed | Already fixed by XCARD-DURING-SCENE-END-RACE (aef883e). endScene's chained write (persistEndedScene → endedSceneRetractions) builds on the store's sessionRetractions as they stand at its turn. It overlays the store's retracted truths and re-runs retractNarrations with the live xCardedNarrationIds, so a strike the X-Card takes over during the end's awaits is kept unnamed. Added a pinning test for the exact case: a strike made in the same scene, then X-carded while the scene ends. |
| TRIGGER-VIGNETTE-POST-WINDOW | xcard | fixed | Applied the proposal. After the Pay the Price trigger vignette's card posts, the post site re-checks the clock (strikeIfRewoundWhilePosting) and strikes the card if it is no longer full. When supersedeTriggerVignettes finds a vignette still in flight, it leaves a note (noteRewindDuringVignette) carrying the upgrade's kind and resolutionId, so the struck card names the upgrade (supersededFor). A card struck before that name reached it is marked lateStruck and takes the name when the upgrade's supersede runs. The strike itself is shared as the exported strikeTriggerVignetteCards (src/clocks/payThePriceClocks.js, src/moves/resultUpgrade.js). |
| ACTIVE-SCENE-STRIKE-PLACE-BLIND | ledger | fixed | Within one scene that moved between places, a scene fact struck at Bleakhold also blocked the narrator from recording the same words at Vantage Station. A GM's `!truth set` at Vantage Station 'lifted' it, and it was listed as corrected there. `findEquivalentTruth` and `findBareStrike` now take the place the fact is asserted at (internal `truthStandsAt` -> `keptStrikeStandsAt`). They are passed that place by `applySidecar`, `setTruth`, `findSessionBlock` and the `!truth set` card (src/factContinuity/ledgers.js, chatCommands.js). The active scene's corrected lines are filtered the same way in `sessionRetractedFacts` (retractions.js). The X-Card's retraction still blocks everywhere. |
| TIER-DETAIL-NEGATION-WORDS | ledger | fixed | The duplicate check for NPC details used a fixed list of reversing words, so a reversal worded past it ('Used to run the lower docks' next to 'Run the lower docks', 'Feigned loyalty to the Compact') was treated as a repeat and the new fact was saved nowhere. A restatement may now be preceded only by the entity's own name or role words, a pronoun or filler words (internal `LEADING_NEUTRAL_WORDS` / `detailSubjectWords` in src/entities/entityExtractor.js, used by both tier writers). Any other leading word keeps the detail. 'until' and 'till' were added to the trailing reversals. |
| RETRACTION-POSSESSIVE | ledger | fixed | When a strike is propagated, a possessive counted as a mention of the struck subject, so 'Mira — Is dead' took 'Mira's husband is dead' out of canon. The lore matcher (`loreStatesStrike` via new `mentionsSubject`, src/factContinuity/retractions.js) now ignores a possessive mention unless the struck fact is itself about something of the subject's ('Her husband is dead'). This also covers the `loreRetractionHolder` lift restore. |
| END-SCENE-NEXT-SCENE | ledger | fixed | `endScene`'s final write cleared the scene fields and pacing on the latest store whatever scene it held. A scene started on another client during the end's awaits was therefore closed along with the old one. `persistEndedScene` (src/factContinuity/sceneLifecycle.js) now leaves the store's scene fields and pacing alone when the store holds a different scene, and writes only the session's kept retractions. |
| PROMOTE-SUBJECTS-CACHED-MUTATE | ledger | fixed | `promoteNewEntityLedgerSubjects` re-keyed scene facts recorded under a new entity's name directly on the GM's cached campaignState before saving, so a refused save left the change in that cache only. As proposed, the store's `sceneTruths` / `sceneState` are deep-copied at the write-chain turn, the copy is promoted and written. A caller's copy that is the cached setting itself is no longer changed in place (src/entities/entityExtractor.js). |
| SUMMARY-PERSIST-CACHED | ledger | already-fixed | Fixed by CACHE-MUTATED-BEFORE-WRITE: `getRollingSessionSummary` already writes `{ ...stored, sessionSummary }` (a copy) on `serialiseCampaignStateWrite`. `refreshRollingSessionSummary` and every other caller (End a Session, `rollSessionIfDue` callers, catch-up) pass a copy. tests/unit/cacheMutatedBeforeWrite.test.js already pins the refused-write case. |
| SUMMARY-KEYLESS-GM | ledger | fixed | The rolling summary was only regenerated on the canonical GM with that GM's key, so at a table where only players hold keys it was never generated. When no connected GM holds a key, the keyed client that wrote the narrator card now generates it (`registerRollingSummaryRefreshHook` -> `summaryFallsToThisClient`, `getRollingSessionSummary(…, { relay: true })`). It relays it via gmRelay `narrator.summary` to the new `applyRelayedSessionSummary` (src/narration/narrator.js, gmRelay.js). The GM stores it on a copy, on the write chain, only if it is this session's, covers more cards than the stored summary and none of its source narrations has been X-Carded since. A keyed GM ignores relayed summaries and makes its own. |
| CLOCK-VIGNETTE-NO-DETECTION | ledger | fixed | Maintainer's call, applied as proposed. A clock vignette is written at interaction latitude since V23, so the reason #286 D4 gave for not running detection after vignettes no longer applies to it. Both of `narrateClockAdvancement`'s capture calls now pass `detect: true, source: 'clock_vignette'` (src/narration/narrator.js). A new figure is queued on the GMs' review card with the vignette's narrationId and is never auto-created. |
| CAPTURE-HANDOVER-SCENE-ORACLE-VIGNETTE | ledger | fixed | As proposed, `scheduleSceneAnswerCapture` and `scheduleNarrationCapture` now use AA34's gate (`game.user.isGM`: the GM whose client narrated) instead of re-checking `isCanonicalGM` when the reply lands (src/narration/narrator.js). An @scene answer, oracle follow-up or vignette whose narration finished after a lower-id keyed GM joined is now captured. A player's client still runs no capture. |
| SCENE-CAPTURE-KEYLESS | ledger | closed | Closed as by design (U36) and not cheap: the capture's writes need a GM and its Claude calls need a key, so at a table whose GMs hold no key every capture path, moves included (`runPostNarrationPasses` returns on a player's client), is skipped. The answer's scene facts still reach the GM through the sidecar relay. Relaying a player's detection and tier results to the GM would be a new feature across all capture paths, not a fix. |
| STATE-CORRECTION-DURING-SCENE-END-LOST | ledger | fixed | Applied the proposal: `keepLastKnownWhereabouts` reads each subject's state values from the store while the store still holds the scene (internal `storedStateEntries`). It writes a record again, starting from the LAST KNOWN the scene end first found (`keep.bases`), when the store's values changed during the write. The late-facts pass now also re-keeps a subject whose every value was struck (src/factContinuity/sceneLifecycle.js). A `!state strike` / `!state set` made while the scene is ending now sticks. |
| ENTITY-ID-PUSHED-ON-CACHE | ledger | fixed | The main defect (the new id pushed onto the cached setting before a save that could be refused) was already fixed by issue #331 X35: save to the store first, push only once it landed. The last thing still set on the caller's object before the save was its id list being made an array; `registerEntityId` (src/entities/registry.js) now does that only after the save. The outdated 'always written because the caller's copy holds the id already' comment in `registerEntityIdInStore` is corrected. |
| CREATED-ONTO-DISMISSED-NAME | ledger | fixed | Applied 'one undismissRecordName per creator' at the step every creator shares: once a record is registered, `registerEntityId` takes its name off `dismissedEntities` (internal `registeredNameToUndismiss` / `undismissRegisteredName` -> `entityExtractor.undismissRecordName`). This covers vow-target NPCs, sector-generated settlements and connections, draft Confirms and adopted records. It adds no `await` when nothing is dismissed. The load-time `syncEntityRecordNames` (src/entities/migrator.js) now un-dismisses every listed record's name, fixing worlds already in that state. |
| KNOWN-NPC-CONNECTION-NO-TARGET | ledger | fixed | Applied the proposal: the move's `moveTarget` now flows from src/index.js through `narrateResolution` (option `moveTarget`), `runPostNarrationPasses`, `runDiscoveryDetection` and `routeEntityDrafts` (`targetName`) to the free-flow connection slot. `connectNamedFigure` (src/entities/entityExtractor.js) picks the candidate the target names when the player's line doesn't name exactly one. Before, a hit like 'I win her over' with two known NPCs in the narration got the GMs' notice instead. |
| CONN-BACKGROUND-UNWRITTEN | ledger | fixed | Took issue #287's 'or retire the fields' option: `background` and `secrets` are removed from ConnectionSchema (src/schemas.js). Nothing in production ever wrote or read them, so every new record carried two dead fields. Stored records keep the empty fields, which do no harm. The connection-flow doc line is updated. |
| SEED-OLD-RECORDS | ledger | closed | Closed as cosmetic and not cheap. The rolled goal on records seeded before W31 is also written into each seeded sheet's Characteristics and its Claude-written Notes text. A record-only migration would leave the sheet disagreeing with the record, and the Notes text can't be rewritten mechanically. Records seeded since W31 are correct, and the card still shows the narrated goal (as Motivation). |
| FACTION-CONFIRM-TWO-ENCOUNTERS | ledger | fixed | A faction Confirm called `recordFactionIntelligence` twice (the reconcile backlink and the World Journal mirror), and each call appends an encounter. `recordFactionIntelligence` (src/world/worldJournal.js) now skips the encounter when called with `encounter: false`. The backlink always uses it and only links an entry that already exists; the mirror uses it when the page already exists, so its description is the first encounter only of a page it creates (src/entities/entityExtractor.js). |
| DRAFT-CONFIRM-TWO-GMS | ledger | fixed | Applied the proposal: draft-card Confirm and Dismiss are now relayed to the canonical GM (`relayCardAction` -> gmRelay `draft.confirm` / `draft.dismiss` -> new `applyDraftConfirmFromRelay` / `applyDraftDismissFromRelay`, GM presses only). The relay queue runs them one at a time, so a second GM's simultaneous press finds the row already confirmed and does nothing (src/entities/entityExtractor.js, src/multiplayer/gmRelay.js). |
| STALE-PAGE-ACTOR-WRITES | multigm | fixed | If a page's connection dropped, a move still running on it went on to write its roller's sheet from the stale cache. Now every actor write in src/character/actorBridge.js (meters, debilities, legacies, vow/bond items, clocks, vehicle and companion tracks, momentum clamp) is refused on a stale page via refuseStaleActorWrite / staleChecked. Each writer's own refused-write path takes the refusal: persistResolution records it as a meter failure with a Retry, the {ok:false, reason:'refused'} writers return that, and the others warn. |
| STALE-PAGE-CLAUDE-COMMANDS | multigm | fixed | When a sole keyed GM's page had stood down, hasKeyedActiveGM still counted that GM as keyed (electableGMs falls back to every GM when all are stood down or loading). A RUN_ON.CLAUDE command then ran on no client and its author was not told. hasKeyedActiveGM (src/multiplayer/gmGate.js) now counts only GMs whose page can act (gmPageCanAct), so the author's client runs the command with its own key, or says the key is missing. Consumers audited: commandRouting, oracleFollowup, nativeRollNarratesHere, audio countsAsNarratorCard and batchModeKeyedGm all mean 'a keyed GM who will answer'. |
| STALE-PLAYER-PAGE | multigm | fixed | A player's page coming back from a dropped connection was never asked to reload, and its own-key narrations read the X-Card from a cache that might be missing a card played during the drop. Changes: (1) connectionWatch.js now asks every stale page to reload, with player wording. (2) narrator.js watchXCard discards any narration started on a page that is already stale, with its own discard reason. (3) The Private Channel refuses a turn up front with reason 'stale', and refuses Publish (STALE_PAGE_REFUSED in private-channel/publish.js, banner in app.js). The re-read alternative was not used: Foundry gives no supported way to re-fetch a setting from the server. |
| STALE-BANNER-WORDING | multigm | fixed | The Round window said 'No GM is connected' while the only GM's page was waiting for a reload. buildRoundView (src/batch/roundView.js) now takes ctx.gmReload (from gmRelay onlyStoodDownGMs, passed by roundWindow.js) and shows ROUND_NOTICES.gmReload instead. The window's relay-refused text for 'no-gm' uses the reload wording in the same case. |
| ROUND-CONNECTION-OTHER-LINE-CANDIDATE | multigm | fixed | An NPC named only in another player's line still counted as a round hit's connection candidate, because the candidates came from the round's joined lines plus the narration. In entityExtractor.js connectionSlots, a round hit's candidates are now the NPCs named by its own line plus the narration alone. runDiscoveryDetection in narrator.js passes the new narrationText for this. The second case in roundConnectionOwnLineNames.test.js documented the residual and was updated: the narration's one NPC is now the connection. |
| UPGRADE-WAIT-OTHER-GM | multigm | fixed | Send now waited the five-minute bound only for an upgrade running on the resolving GM's page. One running on another GM's page was kept after 60 s. claimUpgradeCard (src/moves/resultUpgrade.js) now stamps <kind>.consumedBy with the GM applying the upgrade. driver.js keepUpgrades counts an in-flight upgrade as live (upgradeHandlerLive) when it runs on this page, or when its claimant GM is connected and that GM's page can act. |
| BATCH-OFF-DIALOG-HANDOVER-WINDOW | multigm | fixed | Applied the written proposal. The toolbar switch's 'Discard the round' now relays a new GM_ACTIONS kind, batch.discardThenOff (relay.js applyBatchDiscardThenOff → driver.js requestDiscardThenOff). The canonical GM decides on its own round chain: if the round is resolving, or this GM is starting to resolve it (_startingResolution, set while its lock claim is out), it marks modeOffAfter; otherwise it turns the mode off. startResolution also refuses to begin a round once it sees the mode off after claiming the lock. |
| ROUND-ONE-OFFER-SLOT | multigm | fixed | Applied the written proposal: a per-player list of parked card moves. round.js entries now carry `parked` for card moves beyond the one offer slot. offerKept (Pass, Withdraw, and Edit, which withdraws) keeps the offer and parks the entry's own card move. offerForcedMove parks an undecided offer when a second card is pressed. takeCardMoves hands back the parked moves with the offer and clears them. driver.js incitingSwearTaken also counts parked moves. |
| ROUND-SEND-NOW-KEEPS-UNDER-XCARD | multigm | fixed | Applied the written proposal. During the upgrade step, requestSendNow (driver.js) now checks the X-Card before applying Keep for everyone, and refuses with reason 'x-card'. |
| SHEET-ROLL-KEYLESS-ROUND | multigm | fixed | Chose the proposal's fix over 'accept'. sheetRollJoinsRound (driver.js) now needs a connected keyed GM (batchModeKeyedGm), not just any GM. With none, a participant's sheet roll is narrated at once where a key lives (the roller's own client), as before Batch Mode. It is no longer held in a round that cannot narrate it. |
| CHOICE-UNSETTLED-AFTER-RELOAD | multigm | fixed | A round finished on a page that did not roll it (after a reload or a GM takeover) rebuilt its riders without the applied-ability keys, so a 'choose one (before rolling)' was offered again. rolledFor (driver.js) now rebuilds the interpretation the roll took (rebuiltInterpretation → interpretationForRoll(reading, entry.choices ?? defaultChoices(reading))). That carries applicableAbilities and appliedAbilityKeys, so settlePreRollChoices settles the choice. This meets the proposal ('keep the applied keys on the reading') without a new stored field, because the entry already stores its choices and the reading its abilities. |
| ROUND-VOW-GONE-SAYS-FULFILLED | multigm | fixed | Applied the written proposal: the refusal is now worded by the forsaken flag. selectFulfilVow and selectForsakeVow (milestone.js) report forsaken:true for a forsaken closed vow; the field appears only when true, so existing callers see the same shape. movePipeline.js readAction sets reading.blocked to 'vow-forsaken' for such a vow. driver.js refusalFor and the Round window hint now say 'was forsaken' instead of 'is already fulfilled'. |
| HELD-MOVE-RETRIES-SPENT | multigm | closed | Closed as accepted, per its only written proposal ('accept'). After five spaced retries (10 s to 50 s) the held move waits for any campaignState write that lands, and that write rolls it at once. The bounded retry was a deliberate HELD-MOVES-WAIT-FOR-WRITE decision, so a lasting refusal is not retried claim after claim (the issue #342 Z25 shape). heldMoveRetriedAfterRefusal.test.js pins that design. |
| TRACK-SAVE-ANSWERED-LATE | multigm | closed | Closed as accepted, per its only written proposal ('accept', since AB05's bounds share it). A Progress Tracks save answered after its 30 s bound has already been reported refused to its caller. Its late landing racing the next write is the same window every bounded world write has. Removing the bound would bring back the unbounded wait inside the move lock (TRACK-QUEUE-UNBOUNDED-IN-LOCK). |
| FORCED-MOVE-HOLD-RELOAD | multigm | deferred | Deferred: a large cross-area refactor. The item spans every in-memory hold queue: free-flow deferred forced moves and session holds, and re-held refused claims (index.js _deferredForcedMoves), plus Batch Mode's next-round and free-flow holds and held sheet rolls (driver.js _heldForRound / _heldForFreeFlow / _sheetRolls). Fixing it needs a stored hold record per held message (stamp, unstamp on run), a canonical-GM re-queue at ready and on GM departure, de-duplication against the AB06 hand-over relay, and re-parsing sheet-roll outcomes. That is heavy, double-roll-sensitive churn in index.js and driver.js, which other areas also edit. No proposal is written in the entry. |
| CARD-STAMP-NONOWNER | multigm | already-fixed | Both cards named are already stamped on the canonical GM. The suffer-choice card's pick relays 'suffer.pick' and the canonical GM claims and stamps `resolved` (src/moves/sufferCard.js, issue #302). The paced narrator card's Roll relays 'paced.roll' to cardActions.applyPacedRoll, which claims `rolled` on the canonical GM (PACED-ROLL-OPEN-PRESS). Covered by pacedRollButtonRoller / pacedRollHeldAtLock and gmRelay / faultMatrix tests. |
| LOCK-LOST-BY-COGM-STALE-WRITE | multigm | fixed | Applied the proposal's first alternative: the claimant restores its live claim. index.js tracks _liveMoveLockClaim, set when a claim lands and cleared the moment releasePendingMoveLock is called for it. An updateSetting handler (onLockFreedUnderLiveClaim → restoreLiveClaimOverStaleWrite) puts the claim back, on the write chain, when the lock comes back free while the claim is live and the page is not stale. Only the claimant's own release can free a live claim on a page that can act, so the release itself acts as the marker. The handler is listed in hookGates OWN_ENTRY. |
| LOCK-RESURRECTED-DEPARTED-CLAIMANT | multigm | fixed | Applied the written proposal. On any campaignState update, the canonical GM frees a lock whose claimant is not connected, or whose page stood down (releaseLockOfAbsentClaimant in index.js). It releases under that claim's own token, with one release per claim in flight. It only warns on the console, because the W25 handover already posted the 'Move lock released' card. |
| BEGIN-MINT-LINE-WINDOW | multigm | fixed | Applied the written proposal. rollSessionIfDue (src/session/lifecycle.js) now calls noteSessionBeingReplaced for every caller. Begin a Session's own mint therefore gates typed lines through the chat gate, and holds Batch rounds via sessionBeingReplaced, while its summary call runs. Begin (sessionLifecycleDialogs.js) and the Campaign Start clear the note once their write lands. |
| SESSION-PANEL-OVER-STALE | multigm | fixed | Chose the timer over 'accept'. SessionPanelApp._prepareContext schedules a re-render at the four-idle-hour mark (sessionLastSeenAt + SESSION_IDLE_HOURS, plus 1 s) for a live session. The timer is rescheduled on each render and cleared on close. |
| SESSION-MINT-RACE | multigm | fixed | The world-load mint and a Begin landing during its summary call both minted, and the load's write overwrote Begin's session id and open gate. The load's mint now runs through serialiseSessionMint, and Begin a Session and the Campaign Start's begin await sessionMintsSettled (bounded at 5 min, so a hung write cannot wedge later Begins; issue #347 AB05) before reading campaignState. Begin therefore reads the session the load minted and begins it. |
| FIGHT-CARD-IDLESS-ROLLER-VOWS | moves-a | closed | Closed as the entry proposed (accept). Only won-fight cards posted before cards carried a vow id still use the name path in linkedVowClosed. Every card since FIGHT-PAYOFF-CARD-VOWID-FLAG-ONLY carries an id, and fightCardVow finds the vow by that id (src/index.js). |
| FORGE-NAMED-BONDED-SCORED | moves-a | fixed | With `unbonded`, selectConnection's name rungs now return nothing when the name is a bonded connection's, the same as the id rung. enrichProgressTicks marks such a forge `alreadyBonded`, and rollMove posts the not-rolled card ('is already bonded') with a `refusedReason`. A Batch Mode round's refusal now uses that reason instead of 'deleted or finished' (src/batch/driver.js). Files: src/moves/developRelationship.js, statEnrichment.js, movePipeline.js, src/index.js postTrackGoneCard. |
| LEGACY-SHEET-DECREASE | moves-a | fixed | addLegacyTicks now records the ticks it marks against the working copy (legacyTracks.markLegacyOnCopy). persistResolution applies those marks to the stored track (legacyTracksWithCopyMarks) instead of keeping whichever record was further along. A track lowered on a sheet during the move stays lowered, and a concurrent !bond mark is added alongside the move's mark instead of being lost. mergeLegacyTrack had no remaining callers and is deleted. Files: src/moves/legacyTracks.js, persistResolution.js, src/index.js. |
| AID-ALLY-UPGRADE | moves-a | fixed | The move's targets now carry allyActorId on every Aid Your Ally outcome; before, it was only there on a hit. Burn and Improve Result split the outcome's momentum by beneficiary (resultUpgrade.momentumShares / upgradeAllyId): the roller's reset or delta excludes the ally's share, and the ally gets what the recorded hit did not already pay. The upgraded outcome's effects now see the ally too, so the ally gets the +1 on their next move and the in-fight position. Files: src/moves/movePipeline.js, resultUpgrade.js, burnMomentum.js, improveResult.js. |
| BOND-DEVELOP-UPGRADE | moves-a | fixed | The pipeline's develop branch is now movePipeline.applyDevelopRelationship. The upgrade path's applyOutcomeEffects (src/index.js) also runs it, for what the upgraded outcome adds (developRelationship.developmentAdded): the bonds ticks beyond the recorded outcome's, saved through writeLegacyTicks with their box XP, and a match's rank raise. Before, a bonded Develop Your Relationship burned to a strong hit marked nothing. |
| TEST-RELATIONSHIP-DEVELOP-ROLL | moves-a | fixed | Per the rules, a Test Your Relationship hit means Develop Your Relationship, which for a bonded connection is its own roll +rank. applyDevelopRelationship now makes that roll (rollBondedDevelop, using !bond's dice; a negative momentum cancels the die) and pays its outcome. The develop card shows the roll. Before, the test's own +heart roll was used. An upgrade from a miss develops at that point. Files: src/moves/movePipeline.js, src/index.js postDevelopRelationshipCard. |
| NEXT-MOVE-BONUS-PIPELINE-ONLY | moves-a | closed | Re-checked; still by design. The +1 has to be claimed on the canonical GM's campaignState write chain before the dice (issue #342 Z52). !bond rolls on the typist's client, and the vendor sheet rolls outside the module, so neither can claim it first. The bonus stays pending for the next pipeline roll and is never lost. |
| BOND-COMMAND-FALLBACK | moves-a | fixed | handleBondCommand now resolves a typed name with selectConnection's `strict` ladder (issue #321 U14). `!bond Vexx` at a one-bond table now warns 'no bonded connection matched' and rolls nothing. Before, it rolled with the table's one bond. Files: src/moves/bondCommand.js. |
| DEEPEN-LINK-FALLBACK | moves-a | fixed | findOpenConnection, used by deepenLinkedConnection and the payoff-failure description, now matches a vow's linked name with the `strict` ladder, and a null name matches nothing. A link to a connection that was severed or renamed now reports not-found, which goes on the GMs' payoff card. Before, it deepened the sole bonded or active connection. Files: src/index.js. |
| TDA-COST-DOUBLE-ROLL | moves-a | fixed | buildOracleSeeds now takes a `rollsDecisiveActionCost` option and rolls no cost when the result rolls one. postDecisiveActionCostCard returns the cost it rolled, and the pipeline seeds the narration with it (resolver.withDecisiveActionCostSeed), the same pattern as issue #321 U03. Files: src/moves/resolver.js, movePipeline.js, src/index.js. |
| FRAY-SOLE-FIGHT-FALLBACK | moves-a | fixed | Applied the proposal (name only). Enter the Fray's half is fixed as in ENTER-FRAY-SOLE-FIGHT. For the expedition half, selectExpeditionTrack gains `soleFallback`; applyExpeditionProgress turns it off when a destination is named. A new destination now begins its own expedition, which is what the issue #321 U16 decision already describes; an unnamed Undertake still marks the one open expedition. Files: src/moves/expedition.js. |
| ENTER-FRAY-SOLE-FIGHT | moves-a | fixed | Applied the proposal. selectCombatTrack gains `soleFallback`, and Enter the Fray turns it off in three places: the threshold check, the move's fight lookup (which also skips the roller-fight rung), and applyCombatProgress when beginsFight. A new foe with one fight open now gets its threshold card, its opening position rides that card instead of landing on the old fight, and entering begins a second track. Files: src/moves/combat.js, src/index.js. |
| DELAYED-CHOICE-IDENTITY | moves-a | fixed | Applied issue #309 N04's rule to both choice cards. The fray's choice card carries `thresholdResolutionId`. While that threshold card waits, the pick is stashed on it (combatThreshold.findThresholdCard / stashPositionOnThresholdCard, moved out of index.js). Once the fight is entered, the pick lands on the fight that card began: applyCombatThresholdChoice now stamps `frayTrackId` on the card, a new key that has a reader, unlike the retired `thresholdTrackId`. If a way out was taken, nothing is positioned and the card says so. Explore a Waypoint's card carries `expeditionTrackId`, resolved at roll time, and marks that expedition or reports it over or gone. Cards with neither key keep the old click-time reading. Files: src/moves/sufferDialog.js, sufferCard.js (reason texts), movePipeline.js, cardActions.js, combatThreshold.js, src/index.js. |
| VOW-CLOCK-REWIND-PER-COPY | moves-a | fixed | revertVowClocksForBurn now uses the same per-vowId lockstep as the advance (issue #321 U55). The first copy is rewound one segment, and each later copy is set to that value; a copy the sync hook already moved is left alone. A refused entry carries the value it is owed (`target`), which is serialised on the GMs' card and checked in the Retry. The reversal card now says 'rewound' once per vow. Files: src/character/actorBridge.js, src/moves/resultUpgrade.js. |
| BOND-ITEM-NAME-STALE | moves-a | fixed | Added actorBridge.setBondItemName and connection.renameBondItems. These rename the bond Items that bondItemsFor finds, looked up by the record's id or, for an unkeyed Item, by the old name. They run from updateConnection when the name changes, and from syncEntityRecordNameOnUpdate when the GM renames the NPC card in the sidebar (canonical GM). Files: src/character/actorBridge.js, src/entities/connection.js, src/index.js. |
| CLARIFY-ON-GM | moves-a | deferred | Still real: ClarificationDialog.prompt runs inside rollMove on the canonical GM (src/moves/movePipeline.js). Putting it on the mover's client needs a new GM-to-player prompt protocol (request, answer, timeout, reconnect, all while holding the move lock), and none exists; the confirm dialog beside it is also the GM's by design. The Batch Mode variant needs the pick added to the Round window's reading, which is batch-area UI work. Too large for this batch, and it would conflict with the batch/multigm agents. |
| PACED-CARD-OLD-MOVE-NAME | moves-a | fixed | applyPacedRoll's build now maps the card's suggestedMove through toMoveId. A display name such as 'Gather Information' rolls its move key, and a name that is no move rolls nothing and leaves the card unclaimed. Files: src/moves/cardActions.js. |
| SWEAR-PLAN-DEAD-BRANCH | moves-a | fixed | Removed buildSwearVowPlan's unreachable `!isGM` branch and the `queueTargetDraft` field it set, which nothing read; the plan is only built on the canonical GM (swearSharedVowForAll). Removed the plan's `isGM` input and its two tests of the dead branch, and replaced them with a test that the plan carries no draft field. Files: src/session/swearVow.js. |
| SUPPLY-TWO-PC-TIE | moves-b | fixed | With two PCs and one sheet left behind by a refused mirror write, the two values tie. The shared-supply sync gave the tie to the edited sheet, so after a GM reload (which loses the in-memory last pass) an edit on the lagging sheet set the crew's supply from it. Each sync pass now stores the crew's supply on campaignState (new schema field `crewSupply`, written on the campaignState chain), and a tie goes to that stored value while a sheet still holds it. A majority still decides when there is one (src/multiplayer/sharedSupply.js, src/schemas.js). |
| COMPANION-TRIGGER-SWAP-UNCUED | moves-b | fixed | (a) A companion ability with a general trigger ("When you make a move by sending/commanding the rockhorn…, roll +its health") names no move, so only the model's pass offered its swap, and never when another ability linked the move. New abilityScanner.companionTriggerMatches is a structured rule: on an action move whose line names the companion (asset name or given name) the ability is offered, and extractStatReplacement reads its bare "roll +its health" as the swap. (b) When two checked abilities offered "+its health", no asset was stamped and the healthiest companion was rolled. The confirm form now gives each companion its own radio (`stat@assetId`); readMoveAbilitiesForm returns pickedStatAssetId, the confirm dialog stores it, and movePipeline.substitutingAssetId rolls that companion. |
| SUPPORT-VEHICLES-UNLISTED | moves-b | fixed | Applied the first proposal: the interpreter is now told the roller's support vehicles. readMove passes the roller to interpretMove, and buildContextSummary lists the roller's support vehicles (noting that the command starship is null) and companions (with a companion's given name), so a Withstand Damage of "the hoverbike" can name it as moveTarget (src/moves/interpreter.js, src/moves/movePipeline.js). |
| COMPANION-GIVEN-NAME-UNREAD | moves-b | fixed | Companion Takes a Hit's companion_health roll and Heal's companion matched only the asset's name ("Glowcat"). New actorBridge.companionGivenName reads the vendor asset's "Name" field (`system.fields`), and statEnrichment's namedOnce now matches a companion by either name (src/character/actorBridge.js, src/moves/statEnrichment.js). |
| UNPREPARED-RETRY-NO-MOMENTUM | moves-b | fixed | When the world refused a burn/improve reversal's unprepared clear, the GMs' Retry cleared the mark but never gave back the momentum it had held down. The refused `unprepared` upgrade step now carries `momentumBack` (the receipt's momentumClamped for the PCs still owed, burner excepted). Its Retry gives that momentum back once the PC is no longer unprepared, a refused momentum write keeps the PC owed, and the GMs' card line says so (src/moves/resultUpgrade.js). |
| OUTCOME-CHOICE-CARD-NO-UPGRADE-HINT | moves-b | fixed | Applied the proposal. persistResolution now gives an outcome's own choice card (for example a weak hit's) the "burn momentum or improve the result first" hint while upgradeOpenFor says the move still offers an upgrade. New resultUpgrade.dropUpgradeHints removes the hint from the move's open choice cards when the upgrade closes another way: a choice on another card (closeUpgradesForChoice) or the roller's later move (closeUpgradesForLaterMove). keepPriceCard reuses the same withoutHint helper. |
| STARSHIP-ASSET-CONDITIONS-UNSYNCED | moves-b | fixed | The STARSHIP asset's own Battered/Cursed conditions (vendor `system.conditions`) were a second store beside the canonical native impacts, and nothing kept them in step. They are now a write-through mirror. updateShip writes through via actorBridge.setCommandVehicleConditions. A canonical-GM hook (ship.registerStarshipConditionSync, wired at ready in index.js) copies a starship-sheet impact toggle onto the asset, and writes a box ticked on the asset card to the impacts through updateShip (cursed can only be set, never cleared). The mirror's own writes are flagged so the hook does not send them back. |
| SOJOURN-PTP-ADVISORY | moves-b | fixed | Sojourn's miss seeded the narration with an advisory Pay the Price, but "No relief — Pay the Price" only posted a "Trigger: pay_the_price" reminder, so the price later paid with !ptp was a different roll. resolveMove now rolls the price once (resolver.rollChoicePrice, used when a miss's Pay the Price is one of its choices): the narration seed and the option (`option.price`) carry that same roll. Picking the option pays it through index.js payChosenPrice: the Pay the Price card, its suffer routes on the roller, and the clock advance. The result is re-read from the table by roll number. The card's resolved summary reads "the price paid". |
| MOMENTUM-BASE-DRIFTED | moves-b | fixed | Applied the maintainer's-call proposal as an explicit repair command: `!reset-momentum [name \| all]` sets a character's base momentum max and reset back to 10 / +2 through new actorBridge.resetMomentumBases. Only differing fields are written, momentum itself is untouched, and a card lists what changed. It acts on the typist's own character, a named one, or all. A player can reset only a character they own (it is their sheet); a GM can reset any. Added a README row and a sample in the routing matrix test. The help-journal Chat Commands row is left for integration. |
| SUFFER-RETRY-WHOLE-AFTER-METER | moves-b | fixed | Re-checked: since D3 Endure Harm/Stress mark no impact, but their second write (the overflow taken as momentum) has the same shape. So do Sacrifice Resources' unprepared mark and the companion/vehicle overflow. Each executor's second write now runs on its own (sufferExecutor afterMeter). If refused, the call's result is ok:false with `retryCall` (just that write). The card shows the meter as applied and that write as not applied, and the GMs' `suffer` Retry runs only the retryCall. A `mark` of unprepared marks the whole crew via markUnprepared (sufferCard notAppliedLines/summarizeSufferResults/reportRefusedCalls, sufferDialog runSufferCall). |
| MOMENTUM-MIN-REDIRECT-MANUAL | moves-b | fixed | Applied the proposal. Any loss that the -6 floor stops loseMomentum from taking (its own loss, or a harm/vehicle/companion overflow) now posts the "make a suffer move" picker for that amount, with Lose Momentum excluded. The picker adds a "Clear progress: <track>" button for each open progress track that has ticks; it clears one rank's mark through the new sufferDialog `clear-progress` call, validated against the card's `clearTracks`. The picker is bound to the move's resolution (overflowToMomentum and lossPastZero now pass their opts). Card lines say to choose on its card. |
| SUFFER-EXECUTOR-ASSET-SCHEMA | moves-b | fixed | companionTakesAHit and withstandDamage read and wrote system.condition/health/integrity on an asset Item, and the any-picker passed no item id, so they posted "not found". They now write through the consequence card's writers: actorBridge.applyCompanionHealthChange (with no id, the move's companionItemId, else the character's only companion), applyVehicleAssetIntegrityChange for a support vehicle, else ship.changeIntegrity for the command vehicle (the STARSHIP asset's track). A loss past 0 is taken as momentum (AA15), the at-0 vehicle-damage d100 is kept, and a refused write throws so the card reports it with a Retry. |
| RIDERS-IGNORE-UNCHECKED | moves-b | fixed | Applied the proposal. applyMoveConsequenceRiders now filters the extracted riders by the confirm's appliedAbilityKeys (new consequenceRiders.dropUncheckedRiders). It keeps AA12's case: an unchecked "choose one (before rolling)" ability still offers its other options. With no confirm read at all, every rider stands. To avoid silently dropping riders on abilities that have no add, the pre-roll pass stamps `hasRiders` on any ability it extracted riders from, and the confirm form and Batch Mode's defaultChoices pre-check it. Four Batch Mode tests that confirmed with explicit empty choices now confirm with the rider ability checked. |
| PTP-PCLESS-CLOCKS-ADVANCE | moves-b | fixed | Applied the proposal (maintainer's call). handlePayThePriceCommand now skips the payThePrice.advanceClocks relay when there is no payer, for both routed and narrative prices, so a refused !ptp fills no tension or vow clock and fires no trigger vignette (src/index.js). Updated the vow-flow doc. |
| PTP-ANY-ROUTE-PICKER-REFUSED-SILENT | moves-b | fixed | Applied the proposal. If the world refuses the "any" picker posted by dispatchPayThePriceSufferRoute's "any" route (used by Take Decisive Action's cost and relayed !ptp routes), the GMs now get a payoff failure card with a `choiceCard` step, whose Retry posts the picker once (src/index.js). |
| SCENE-CHALLENGE-ADD-ORPHAN-CLOCK | moves-b | fixed | addProgressTrack creates a scene challenge's tension clock before writing the track. If the track write is refused, it now removes that clock (removeClock) and rethrows, so a retry no longer leaves extra clocks behind (src/ui/progressTracks.js). |
| JOURNAL-MERGE-DIFFERING-ENTRY | panels-docs | fixed | There were three gaps in the split-journal merge card (src/world/journalSplitMerge.js). (1) An entry both copies hold, with different page text in the other copy, was never listed. Merge now lists these entries when the copy's version is newer, or when the age is unknown (flag updatedAt / _stats.modifiedTime). A copy that only holds such entries still gets a card. Merge keeps the live text and says the other version stays in the renamed copy. It uses the new worldJournal.journalEntryMatch export. (2) There was no keep-separate option. A new 'Keep separate' button sends the same gmRelay kind 'journal.merge' with keep:true. It stamps each copy journalMerged {keptSeparate:true}, leaves name and entries untouched, and marks the card 'kept', so no later load asks again. (3) A merged copy could become the live journal. findJournal (worldJournal.js), findTracksJournal (progressTracks.js) and the interpreter's readOpenTrackLabels (moves/interpreter.js) now skip journalMerged copies, so a deleted live journal no longer falls back to the retired copy. |
| TRACKS-JOURNAL-SPLIT-NOT-MERGED | panels-docs | already-fixed | Fixed by 9ca699c (in #351): src/world/journalSplitMerge.js has the GM-confirmed merge card at load, and the fix is already recorded in the thirteenth-audit fixed table of docs/known-issues.md. Its entry in the open AA-residuals list (docs/known-issues.md, ~line 586) is stale and should be struck through at integration. The follow-ups found while fixing it are covered by JOURNAL-MERGE-DIFFERING-ENTRY above. |
| WJ-PAGE-BY-TITLE | panels-docs | fixed | Pages inside World Journal journals were found by exact page title (findPageByName), so a page the GM renamed was missed. The next record created a duplicate page, and promotions, severity changes, !journal rulings and the World Journal panel's Dismiss/Review buttons missed it. findPageByName (src/world/worldJournal.js) now matches the name the page's own entry flag gives first: loreEntry.title, threatEntry.name, factionEntry.factionName or locationEntry.locationName. It then falls back to the page title. The faction key fallback and the merge identity (journalEntryMatch/journalHoldsEntry) read the flag name too. The panel (src/world/worldJournalPanel.js) uses the new export findEntryPage. |
| LORE-JOURNAL-BY-NAME | panels-docs | fixed | When the campaign linked no truths journal, writeLoreRecapToJournal and callLoreRecapNarrator (src/truths/generator.js) took any journal named 'World Truths'. A GM's own notes were then summarised as the truths, linked as worldTruthsJournalId, and given a 'The Story So Far' page. Both functions now find a truths journal by what it is: the module's own (entityType flag), or a system dialog save (the system's title). A journal holding truths is preferred. A linked journal that is none of these is no longer read or written; that covers a journal an earlier !lore linked by name. |
| CHRONICLE-OPENER-V1-BRING-TO-TOP | panels-docs | fixed | openChroniclePanel (src/character/chroniclePanel.js) called the v1 bringToTop?.() and returned. ApplicationV2 has no bringToTop, so a press while the panel was open did nothing, and a press for another actor left the open actor's chronicle showing. It now applies AA66's opener: showActor(resolvedId), render({force:true}), bringToFront?.(). ChroniclePanelApp gains showActor(actorId). |
| POSITION-BADGE-GM-FIRST-PC | panels-docs | fixed | The entry's proposal is applied: per-character badges. The Progress Tracks panel (src/ui/progressTracks.js) now shows one position badge per character the viewer plays, built by viewerCharacters, which replaces viewerCharacter. The order is the viewer's resolved PC first, then every other PC they own: all PCs for a GM, a player's own PCs. Each badge is named when there are several and carries data-actor-id, which #onToggleCombatState sends. The canonical GM still checks the presser owns that actor (positionMirrorActor). A viewer who plays no character gets the one fight-wide badge as before. Small CSS addition in styles/starforged-companion.css. For integration — help 'Progress Tracks' page sentence: REPLACE "The position badge on the combat row in this panel shows your own character&rsquo;s position (each character in a fight has their own; its tooltip names whose it shows)" WITH "The position badges on the combat row in this panel show the position of each character you play &mdash; one badge each, named when there are several (each character in a fight has their own; a badge&rsquo;s tooltip names whose it shows)". |
| ENTITY-PANEL-ASSET-TRACK-STALE | panels-docs | fixed | The entry's proposal is applied. A command vehicle's integrity is its STARSHIP asset's Integrity track, an embedded Item (AA20). The Entities panel only re-rendered on Actor and journal hooks, so marking the track on the sheet did not update it. src/ui/entityPanel.js adds a local updateItem hook. It re-renders the open panel when system.track changes on the STARSHIP (Command Vehicle) asset of a recorded entity Actor; the check is internal itemUpdateShowsInPanel, via actorBridge.getCommandVehicleAsset. The hook is listed as LOCAL_ONLY in tests/unit/hookGates.test.js. |
| CHRONICLE-FIRST-PC | panels-docs | fixed | The automatic writer (src/character/chronicleWriter.js resolveActorId) sent every entry to characterIds[0] or the first player Actor. Credit the roller: narrateResolution and narratePacedInput (src/narration/narrator.js, 4 call sites) now pass actorId: character?.actorId. narrateRound passes characters: [{actorId, name}] for its acting entries. For a round with more than one character, the scribe's user message lists them and asks for a 'character' field; the named character is used, else the round's first acting character. An actorId that is not a player character (an NPC card) is not credited. The first PC is now only the fallback when a narration names no PC. |
| HELP-DECK-PLAN-OFF-BY-DEFAULT | panels-docs | fixed | Re-checked: Generate Ship Deck-Plan Maps (shipMapEnabled, src/index.js) is registered with default: true, but the help's Shipboard Combat page says it is off by default. The help text was not edited here (the file is shared); integration must apply this one replacement in src/help/helpJournal.js (the sentence occurs once). REPLACE "It is <strong>off by default</strong>; turn on <em>Generate Ship Deck-Plan Maps</em> in settings to build one automatically when your command vehicle is created or finalised, or run <code>!shipmap</code> at any time (and <code>!shipmap rebuild</code> to regenerate)." WITH "It is <strong>on by default</strong>: one is built automatically when your command vehicle is created or finalised (switch off <em>Generate Ship Deck-Plan Maps</em> in settings to stop that), and you can run <code>!shipmap</code> at any time (and <code>!shipmap rebuild</code> to regenerate)." |
| README-COST-FIGURES | panels-docs | fixed | README.md 'Cost and API usage' had v1.2.7-era per-session and per-call dollar estimates and a token breakdown. It also claimed every long-lived prompt is cached, the narrator's included, but the narrator system prompt is rebuilt for every call, so its cache-read share is near zero. The section is rewritten. It names the code's defaults: Claude Sonnet 5.5 for narration and the Chronicle writer (which follows the Narration Model setting), and Claude Haiku 5.5 for the interpreter, classifier, detection, relevance, !lore and the Private Channel. It gives their published rates: $2/$10 and $0.10/$0.50 per million tokens, Haiku $0.50/$2.50 beyond 100K-token prompts. It says which prompts are cached and which are not. The stale estimates are dropped, with a pointer to the Narrator Usage page; the OpenRouter art rows are kept. |
| QUENCH-ONLY-HELPERS | panels-docs | fixed | isIronswornAvailable / _resetIronswornAvailabilityCache (src/system/ironswornAssets.js) and listCanonicalEncounters (src/system/ironswornPacks.js) had no production caller and are deleted (reachability: delete, wire, or mark UNWIRED). Their unit tests (tests/unit/ironswornAssets.test.js, ironswornPacks.test.js) and Quench tests (src/integration/quench.js) went with them. docs/flows/unreachable-code-audit.md is updated. A new whole-tree deadscan test fails on any QUENCH-ONLY export other than the documented getLastJournalCommandPromise seam. |
| INDEX-EXTRACTION | panels-docs | deferred | Deferred: moving the move pipeline (the inline createChatMessage handler, about 1,000 lines) and the chat-card button wiring out of src/index.js is a large refactor. Nearly every area edits index.js, so in this parallel batch it would conflict with every other agent. Do it in a batch of its own. |

### Thirteenth bug audit (issue #347) — all twenty-four fixed and the three decisions built in the v1.8.1 cycle

Found by the thirteenth bug audit (2026-11-11) of `53b4150` (the merge of PR
#346, the twelfth audit's fixes) — serious bugs, stalls and locks — with a
probe per finding (`tests/probes/` on branch
`claude/codebase-bugs-locks-review-pa7aft`; the report is
`docs/testing/bug-audit-13-2026-11-11.md` there): 24 findings AB01–AB24
(AB01 the one high: a Make a Connection hit held the table's move lock for
the new NPC's portrait) and 3 decision rows D1–D3. The maintainer asked for
issue #347 to be addressed on 2026-11-11 and took option A on all three
(decisions.md → "Issue #347 audit" names where each is recorded). One commit
per row; each carries regression tests converted from the probes, which fail
with the fix taken out (`docs/testing/fix-sensitivity.md`).

Run against this branch, the original probes pass 84 of their 97 tests (83
before the open items below were fixed: AB19's probe passes since the
stand-down — its pause now stands). The 13 others assert what a fix changed: D1's lock free while
the prompt is open (option A asks before the dice, where the lock is held as
at the confirm); AB18's two (they pin `resolverId` staying the first GM's);
AB05's summary probe's "nothing stored" setup check (the later refresh now
stores one); AB23's control (its Scene has no settlement pin at the
destination, which the check now requires); AB24's second case (both moves now wait for a write that lands, as
AA48 decided, rather than the younger rolling first); AB06's resist probe's
"Applied: … rolled to resist" setup check (the card is now put back live);
AB02's audio probe (real timers; the deadline is 120 s — the converted test
uses fake ones); AB22's (it deletes the card without the `deleteChatMessage`
hook Foundry fires); D2's (it reuses the original resolution id for the
re-narration, which a burn gives a new one plus `upgradeOf`); and AB12's
three (they press by the retired `data-index`). Each converted test asserts
the fixed or decided behaviour.

None has been checked in a live Foundry world yet. The ones to try first: a
second GM — lower id, keyed — opening the world while another runs the table,
with a player's `!x` and a typed move during the load (AB03; it rests on
`user.active` being true before `ready`); the network dropped under a move's
lock claim, a Begin / End a Session and a Private Channel exchange (AB05); the
confirm dialog closed on a ⚑ Mark Progress press, and the inciting ⚔ pressed
while a move narrates (AB06); a GM's connection dropped mid-narration, free
flow and in a round (AB19, AB17); a Make a Connection hit with an OpenRouter
key (AB01); ▸ on a new character's Legacies tab (AB07 — it rests on
`preUpdateActor` options reaching the other clients' `updateActor`); a
starship damaged under v1.8.0 (AB08); and a line implying someone, before the
dice (D1).

Choices for the maintainer to confirm: D1 classifies a hybrid line naming
nobody before the dice on every such move (one Haiku call on a miss too), and
the GM's pick stands on a miss; AB03 accepts a one-socket-hop window in which
a GM whose page just became ready and the GM it replaces both count
themselves canonical, and two GMs whose loads overlap presume each other
ready; AB05's bounds (30 s for a write of the module's own, five minutes for
Begin / End and a summary refresh) — an End or Begin that resumes after its
bound runs beside the one that went ahead; AB06's inciting ⚔ is re-armed, not
held (Y36) — and a handed-back resist roll now opens its move's Burn again
(RESIST-BURN-STAYS-CLOSED, below); AB07 moves the
shared track by a sheet edit's change — an edit without the stamp still sets
it; AB08 takes the lower of record and sheet; AB10 connects no one when the
narration names several NPCs and the line names none; AB13's 60 s grace
before Send now keeps an upgrade still in flight; AB17 asks a GM whose
connection dropped to reload; D3 keeps the fallback only for a table whose
keyed-GM list names no GM, and refuses a keyless GM's Send now on a round
waiting for a keyed GM; AB24's held moves wait for the next write that lands.

| Code | Class | Defect → fix |
|---|---|---|
| AB01 MAKE-CONNECTION-LOCK-HELD-FOR-PORTRAIT | LOCK | the capture awaited the new NPC's portrait (image request, upload) inside the move lock — the record, the bond and every other move waited → the portrait is started once the card and bond exist, not awaited |
| AB02 UPLOADS-UNBOUNDED | STALL | four FilePicker uploads had no deadline (sector creation, an audio clip, a portrait, the deck plan) → `withFilePickerDeadline` (120 s) on every FilePicker request; a timeout takes each site's failure path |
| AB03 READY-GM-STANDS-DOWN-FOR-LOADING-GM | STALL | `isCanonicalGM` elected among active GMs, and a GM is active before its `ready` → a GM whose connect a client saw is passed over until it announces its page (`registerGmReadiness`) |
| AB04 STALE-LOCK-HOLDER-RELOADED-NOT-CANONICAL | LOCK | a co-GM's earlier page's lock was freed by neither reset when it loaded beside the canonical GM → a non-canonical GM's `ready` releases its own earlier page's lock (`releaseOwnStaleLockAtReady`) |
| AB05 WRITE-NEVER-ANSWERED-WEDGES | LOCK | four waits on a write of the module's own had no bound → `multiplayer/settleWithin.js`: the lock's claim and release (30 s), Begin / End (5 min), the rolling summary, a Private Channel page write |
| AB06 CLAIMED-CARD-FORCED-MOVE-DROPPED | LOCK (dead card) | a claimed button's forced move the pipeline did not roll left its card claimed; a held move was stranded on a GM handover → handed back (`sourceCard`, the path issue #348 PT11 built too — merged into one) with a "Not rolled" whisper; held moves follow the canonical GM (`forcedMove.hold`) |
| AB07 LEGACY-TRACK-RESET-BY-LAGGING-SHEET | LOST-UPDATE | a sheet edit set the crew's track to the sheet's value → the editing client stamps the value before (`preUpdateActor`), the track moves by the change; a new PC gets the crew's tracks |
| AB08 SHIP-INTEGRITY-UPGRADE-LOSS | DATA-LOSS | AA20's mirror erased integrity recorded before it → an unreconciled record reads the lower of record and sheet, written to both at the canonical GM's load, the GM told |
| AB09 MAKE-CONNECTION-DUPLICATE-NPC | DUPLICATE | the capture's dedup read the move's campaignState copy → it reads the stored entity lists |
| AB10 MAKE-CONNECTION-WRONG-PENDING-NPC | WRONG-TARGET | the first pending row named anywhere was bonded, before a known NPC → `connectNamedFigure`: the player's line decides; several and none named → no one, the GMs told |
| AB11 SCENE-END-DROPS-FACT-INSIDE-OLDER-DETAIL | LOST-UPDATE | `tierHasDetail` matched substrings → whole words, and a negation or reversal never dedupes |
| AB12 SAFETY-LINE-REMOVED-BY-INDEX | WRONG-TARGET | the ✕ filtered by list position at press time → by the row's text, disabled while its write is out |
| AB13 ROUND-EARLY-BURN-DROPPED | WRONG-DETAIL | a consumed card whose entry was undecided was skipped → an upgrade in flight is waited for (60 s grace before Send now keeps it) |
| AB14 INTERRUPTED-MOVE-SILENT-AT-RELOAD | LOST-UPDATE | the ready reset cleared a lock in silence → both ready resets whisper W25's "may be incomplete" card |
| AB15 LAST-SESSION-LOST-AT-MINT | LOSE-PLOT | the mint's summary finalise was fail-open and never retried → the mint marks the session (`unsummarisedSession`); `catchUpUnsummarisedSession` makes LAST SESSION on a keyed canonical GM |
| AB16 WORLD-JOURNAL-SPLIT-FLIPS-TO-STALE | LOSE-PLOT | the first flagged journal won → among several flagged, the default-named one (World Journal and Progress Tracks) |
| AB17 ROUND-NARRATED-TWICE-AFTER-TAKEOVER | DUPLICATE | a late reply posted and closed the round over the next → `narrateRound`'s `stillNarrating` check; the dropped GM's page writes nothing and is asked to reload |
| AB18 RETURNING-RESOLVER-FINISHES-ROUND-TOO | DUPLICATE | a takeover did not re-stamp `resolverId` → it does (`claimNarration` names the narrating GM) |
| AB19 XCARD-MISSED-BY-RETURNING-GM | SAFETY | a narration across a dropped connection posted under a missed X-Card → discarded (`multiplayer/connectionWatch.js`); partly — see AB19-STALE-CACHE-WRITES below |
| AB20 ROUND-ENTRY-ROLLED-TWICE | DUPLICATE | rolled-already was known only from the result card → the entry is stamped rolling, with its resolution id, before anything applies; recovery reports it |
| AB21 PACED-NARRATION-FAILURE-UNTOLD | UX | a failed no-roll narration posted nothing → "That line was not narrated" |
| AB22 XCARD-AFTER-DELETED-NARRATOR-CARD | WRONG-TARGET | the X-Card answered the newest card → it reads chat as it was, deleted narrations included (remembered per page) |
| AB23 TOKEN-DRAG-PAYLOAD-UNCHECKED | SECURITY | `tokenDragSetCourse` was trusted whole → `checkedTokenDragCourse`: a sector Scene, the command vehicle's token, a settlement pin |
| AB24 HELD-MOVES-ROLLED-OUT-OF-ORDER | INCOMPLETE-FIX | a held move's own refused claim drained the move behind it → that refusal drains nothing (`claimPendingMoveLock({ heldMove })`) |
| D1 CLARIFY-HOLDS-LOCK-AFTER-ROLL | LOCK; option A | the clarification was awaited after the roll, under the lock → asked before the dice; the line classified once (`classificationCache`); the pick stands on any outcome |
| D2 XCARD-AFTER-BURN-KEEPS-STRUCK-CAPTURE | SAFETY; option A | an X-Card after a burn removed the re-narration only → it takes the struck narration's capture too, and its facts are blocked |
| D3 KEYLESS-TAKEOVER-NARRATES-FALLBACK | LOSE-PLOT; option A | a keyless co-GM's takeover closed the round behind the fallback → it waits for a keyed GM, the GMs told |

### The thirteenth audit's open items — fixed in the v1.8.1 cycle, with those found while fixing them

The items found while fixing issue #347 and left open were fixed at the
maintainer's request on 2026-11-12 ("Please fix residuals"), each in its own
commit with a regression test (`docs/testing/fix-sensitivity.md`). The
maintainer chose: for AB19-STALE-CACHE-WRITES, a page that dropped stands
down and asks to reload; for TRACKS-JOURNAL-SPLIT-NOT-MERGED, a GM-confirmed
merge at load; GM-ELECTION-HOP-WINDOW is left as it is (below).
ROUND-DROP-CHECK-KEYLESS-COGM needed no code: the stand-down makes its wait
for the reload the design (a test pins that the reload narrates the round).
None has been checked in a live Foundry world yet. The ones to try first: a
GM's network dropped for a few seconds mid-narration with a co-GM connected,
then with none — the reload prompt, the co-GM taking over, a player's X-Card
saying it was not recorded; two Safety-list ✕ in quick succession; a supply
◂ on a character made mid-session; a journal split merge card's Merge.

| Code | Class | Defect → fix |
|---|---|---|
| AB19-STALE-CACHE-WRITES | SAFETY | a GM page back from a dropped connection saved its move's record and freed its lock from a cache that missed the writes made meanwhile — an X-Card pause was written away → the page is stale until it reloads (connectionWatch.js pageIsStale): never the canonical GM, writes no campaignState or round, tells the table (GM_PAGE_STALE_KIND) and asks its GM to reload; the canonical GM takes over its lock and round (noteGmStoodDown), also for a drop the server never saw; relays to a stood-down sole GM are refused honestly (hasActiveGM / gmPageCanAct), the X-Card's card saying it was not recorded |
| ROUND-DROP-CHECK-KEYLESS-COGM | STALL | with only a keyless co-GM the dropped keyed GM's round reply was discarded and the round waited for its reload → settled by the stand-down: the stale page posts nothing and is asked to reload, and its reload narrates the round once (roundDropBesideKeylessCoGm.test.js) |
| ROUND-WAITS-FOR-ABSENT-KEYED-GM | STALL | a round waiting for a keyed GM who did not come back stayed narrating; End a Session did not close it → End a Session closes it, its card listing each result, the GMs told why |
| ROUND-ENTRY-THROW-BEFORE-DICE | WRONG-DETAIL | an entry whose roll threw before its dice was reported, not rolled again → stamped rolling from rollMove's awaited onDiceRolled, after the dice; a refused stamp stops the move with nothing applied |
| UPGRADE-IN-FLIGHT-GRACE | WRONG-DETAIL | Send now kept an upgrade still in flight for 60 s from the rolls' end → waits up to five minutes while it runs on the resolving GM's page |
| ROUND-CONNECTION-LINE-JOINED | WRONG-TARGET | a round's connection hit was settled by all its lines joined → by the roller's own line |
| TIER-DETAIL-NEGATION-LIST | LOST-UPDATE | a reversal phrased past the fixed negating words deduped as the same NPC detail → the list takes gave up / quit / broke with / turned against and dis- / un- forms |
| SAFETY-LIST-EDITS-ONE-ROUND-TRIP | LOST-UPDATE | two ✕ — or two Adds — inside one round trip lost one edit → this client's Safety-list edits run one at a time, each reading its list once the one ahead has landed (bounded at 30 s); a stale GM page writes no Lines or Veils |
| TRACKS-JOURNAL-SPLIT-NOT-MERGED | LOSE-STATE | a World Journal or tracks journal split in two copies read one, the other never merged → a GM card at load lists what the unused copy holds; Merge (gmRelay journal.merge) copies it into the live journal and renames the copy "(merged)" |
| PACED-NARRATION-THROW-BEFORE-CALL | UX | an exception while a paced narration's prompt was built only logged → the same "That line was not narrated" notice |
| DELETED-NARRATION-MEMORY-PAGE-ONLY | WRONG-TARGET | the deleted-message memory lasted the page; after a reload the X-Card answered the newest card again → kept in campaignState (deletedChatMessages, the newest 20) |
| XCARD-STRUCK-FACTS-AFTER-SCENE-END | SAFETY | a struck narration's facts could not be blocked once the scene had ended → superseded truths' ids go on the session list at scene end |
| SUPPLY-LAGGING-SHEET | LOST-UPDATE | a sheet edit's supply value was taken as the crew's, so a lagging sheet set everyone to its own → the editing client stamps the sheet's value before the edit (preUpdateActor) and the GM moves the crew's supply by the change; a PC created mid-session starts at the crew's supply |
| TRACK-QUEUE-UNBOUNDED-IN-LOCK | LOCK | the Progress Tracks write queue, awaited inside the move lock, had no bound → the write ahead and each write's own journal creation and save are waited on for at most 30 s; a save not answered is refused |
| HELD-MOVES-WAIT-FOR-WRITE | STALL | after a held move's claim was refused the held moves waited for the next write that landed → also retried after 10 s × the attempt, five times |
| RESIST-BURN-STAYS-CLOSED | UX | a resist press closed its move's Burn and Improve; handed back unrolled, they stayed closed → reopened (reopenUpgradesForUndoneChoice) while no consequence of the move is chosen |

Accepted, the maintainer's call:

- **GM-ELECTION-HOP-WINDOW** (DUPLICATE, low; AB03). For one socket hop at a
  lower-id GM's `ready`, both GMs count themselves canonical; two GMs whose
  loads overlap presume each other ready. Left as it is (maintainer,
  2026-11-12).
- **PORTRAIT-UPLOAD-LATE-ANSWER** (cosmetic; AB02). Foundry's upload cannot
  be aborted, so one answered after its deadline may still store its file
  (same path, overwritten).
- **SHIP-RECONCILE-NOTICE-FROM-CLIENT** (cosmetic; AB08). A ship first
  written by a non-canonical client before the canonical GM's load finishes
  is reconciled the same way, but that client posts the whisper.

### Found while fixing the thirteenth audit's open items — open

Each with a proposed fix (none filed as an issue yet).

Existing entries the fixes touch: "Accepted limitations → No ack channel"
— AB03 removes the two-GM case (a ready GM no longer stands down; the
one-GM case, the only GM loading, stands); FORCED-MOVE-HOLD-RELOAD stays
open (a reload still loses a hold; AB06 covers a GM joining);
KNOWN-NPC-CONNECTION-NO-TARGET now goes through AB10's `connectNamedFigure`;
SHEET-ROLL-KEYLESS-ROUND is reworded for D3 (below).

### Twelfth bug audit (issue #345) — all seventy fixed and the seven decisions built in the v1.8.1 cycle

Found by the twelfth bug audit (2026-11-10) of `22bdbeb` (the merge of PR
#343, the eleventh audit's fixes — tag v1.8.0), with a probe per finding
(`tests/probes/` on branch `claude/sleepy-curie-2c88x6`; the report is
`docs/testing/bug-audit-12-2026-11-10.md` there, with its area notes and
refuter pass): 70 findings AA01–AA70 (AA01–AA03 the three high-severity
rows: an X-carded oracle answer kept as established, the empty Private
Channel window, its Private Lines read from the store) and 7 decision rows
D1–D7. The maintainer asked for issue #345 to be addressed on 2026-11-10
and took the recommended option on every decision row: D1, D3, D4, D5, D6 and D7 option
A, D2 option B (decisions.md → "Issue #345 audit" names where each is
recorded). One commit per row (AA16 and AA49 share one; AA32 has a docs
follow-up); each fix carries its own regression tests, converted from the
probes, which fail with the fix taken out (`docs/testing/fix-sensitivity.md`).
Run against this branch, the original probes pass 239 of their 254 tests.
The 15 others assert what a fix changed: AA41's control that the retired
fields are stored; AA18's World Journal page keeping the old name (it now
follows the rename); D5's pre-fix store state (the line now lands before the
narration); AA29's "no classifier call" (stricter than the design, both
refuters — the converted test asserts the call happens); D2's option C;
AA12's outcome prompt (with the +1 taken the momentum applies and no prompt
opens); AA70's two README checks quoting the old text; AA65's three (the
setting was retired, not wired); AA69's three (the help now says what
happens; annotation is not built; a GM's page edit is the decided
page-mirror behaviour, decisions.md V31); and AA15's "Applied: integrity -1"
wording (the card now states the momentum lost). Each converted test asserts
the fixed or decided behaviour.

None has been checked in a live Foundry world yet. The ones to try first:
AA02's window above all — open ✦ Private Channel once (its conversation,
text box, Send and Publish should show; a line being typed should survive a
"not saved yet" refresh); then a Fulfill Your Vow rolled on the sheet while
a Batch Mode round collects, and again while one resolves (D1); Withstand
Damage on a starship with its Starship asset, then integrity marked on the
sheet before the next one (AA20); a faction journal, the Progress Tracks
journal and a World Journal journal renamed in the sidebar, and an NPC card
renamed onto a dismissed name (AA18, AA62, AA63, AA55); a second keyed GM
joining while a Make a Connection narrates (AA34), and two GMs loading at
once with Private Lines set (AA35); Trader's +supply on Compel, a Rover's
+integrity and Gunner's Pin them down on the move confirmation (AA10, AA12);
a player at 0 health and 0 spirit owing both resist rolls when the next
round opens (AA08); the X-Card during a round's Burn / Keep step (AA43); an
open World Journal panel while a contradiction card posts (AA66); a narrator
audio upload the world's storage refuses (AA61). Two Quench checks need that
run too: AA02's opens the real window, AA44's reads the installed move pack.

Choices for the maintainer to confirm: D4 also refuses a player's `!truth
set` of the wording a GM replaced — in its own scene too, as over a GM's
strike (drop `isReplacedOriginal` from `findSessionBlock`'s active-scene
filter to allow it there); AA05 keeps a Replace's original blocked for the
session (a GM's later set of the old wording is recorded but lifts nothing);
AA28 filters an earlier scene's scene-fact strikes by place, narrowing the
2026-07 "no scope-filtering CORRECTED" decision, with a loose place match
(either place unknown, or one's words naming the other: "Bleakhold" ~ "the
Bleakhold docks") — the X-Card's blocks stay place-blind; AA34's capture
runs on the GM that narrated rather than re-checking `isCanonicalGM` when
the reply lands (CLAUDE.md's single emitter is the narration's lock claim);
AA07 caps pinned Chronicle entries at the five newest, 300 characters each
(the help says "always appear"); AA14 takes a support vehicle only when the
interpreter names it (a null target is the starship, so a line about the
hoverbike depends on the model naming it); AA16 / AA49 ask "Which vow?"
rather than fall back to the roller's sole vow for a name none of theirs
answers to, and never forsake a crewmate's vow, even named outright; AA19 /
AA55 un-dismiss a name when a known NPC is connected or a record is renamed
onto it (a dismissed connection row is confirmed as the roller's); AA20
makes the STARSHIP asset's track canonical and the ship flag its mirror;
AA18 makes the host journal's name canonical, and leaves a World Journal
Factions page that already holds the new name alone (no merge by a guess);
AA65 retired the "Require a sidecar" setting rather than wire it; AA33 runs
the tier pass after a clock vignette but still no detection
(CLOCK-VIGNETTE-NO-DETECTION, below); D1's choices for the cases the ruling
did not name (an action already written set aside as the next round's
draft; a displaced card move, or a sheet roll beside an owed roll or
another sheet roll, held for the next round; held while a round resolves;
narrated on its own if the mode turns off first; a non-participant's, or
one with no GM connected, narrated at once; Withdraw / Pass / Edit
refused); D2's rule that the description and the narration's clauses
together must name exactly one acting PC (a description naming one PC and a
clause naming both goes to the card; a description no clause contradicts
still places the figure); AA36 narrows the "Discard the round" window
rather than closing it (BATCH-OFF-DIALOG-HANDOVER-WINDOW, below); AA59
keeps End enabled for a session over after four idle hours; AA12 drops a
rider in the choice that names no option when the add was taken (never
doubled, but it can under-apply); AA10 adds a reading field
(`statSubstitutedAssetId`) and labels a swap with the Stat row's label
("Substitute +Heart", "Keep listed (+Edge)") instead of the slug; AA11
applies an aided Secure an Advantage / Gain Ground ability's outcome effects
to the roller on a hit (the move's own benefits still go to the ally);
AA24 empties the summary a supersede made stale (the re-narration gets no
STORY SO FAR until the refresh after it); AA57 keeps regenerations
discarded for the session while a card the X-Card removed could not be
flagged; AA58 keeps a refused load mint's gate shut ("No session has
begun") until a Begin mints; AA61 holds an unsaved clip's bytes in memory
(newest 32, lost on reload); AA46 posts Improve's reversal card before its
momentum lands; AA43 holds a round entering its narration under the X-Card
in "narrating" (its rolls are not held); AA48 makes every held move wait
for the next landed write once a handed-back claim is refused; AA64 shows a
GM the first PC's own position; AA68 enables the ⬡ at no progress only for
a scene challenge whose clock is full.

| Code | Class | Defect → fix |
|---|---|---|
| AA01 XCARD-ORACLE-MEMORY-KEPT | SAFETY | an X-carded oracle follow-up's answer (or a move narration's Pay the Price) stayed in RECENT ORACLE RESULTS, "must not contradict", beside the redirect → ring entries carry their card's id (`cardId`) and a follow-up names its oracle card (`oracleCardId`); `applyXCardToNarratorMemory` drops what the X-carded cards told, by card id and by a move's (or a round card's entries') `resolutionId` (`dropOracleResultsFor`, Z11's mechanism generalised) |
| AA02 PRIVATE-CHANNEL-WINDOW-RENDERS-NOTHING | UX | `PrivateChannelApp` had no `_replaceHTML` — the only module window without one — so in Foundry it opened empty → `_replaceHTML` through `replaceKeepingInput` (a typed line survives Z66's refresh; Send empties the box first); a source sweep fails on any direct ApplicationV2 subclass without one; a Quench check opens the real window |
| AA03 PRIVATE-CHANNEL-LINES-FROM-STORE | SAFETY | the Private Channel read its player's Private Lines from campaignState only, so a line added with no GM online was missing → `formatOwnSafetyContext`: the campaign's Lines / Veils and the user's own lines from their client setting on their own client (shared with `formatNarratorSafetyContext`'s player branch) |
| AA04 XCARD-BLOCK-READ-FROM-MOVE-SNAPSHOT | SAFETY | `applySidecar`'s re-assertion checks read the move's pre-confirm working copy, missing an X-Card or strike made while it waited → `applySidecarSideData` hands it the store's scene ledgers as they stand (`ctx.storedLedger`; the store's truths only while on the narration's scene), read beside the copy's |
| AA05 REPLACED-FACT-UNBLOCKED-NEXT-SCENE | LOSE-STATE + SAFETY | a scene end kept bare strikes and X-Card retractions, not a Replace's original → kept on the unnamed `sessionRetractions.blocked` (never named, never lifted); a strike a `!truth set` lifted (`correctedTo` a truth restating it) is told apart and not kept |
| AA06 SIDECAR-SUBJECT-OLDER-SECTOR-NAMESAKE | WRONG-TARGET | the narrator's resolvers read `collectAllEntities` in creation order, the older sector's namesake first → it carries `sectorId` and leads each shared name with the active sector's entity (`activeSectorNamesakeFirst`, Z15's helper, moved to relevanceResolver.js and shared) |
| AA07 CHRONICLE-PIN-UNREAD | PRODUCED-BUT-DEAD | the pin was saved and read by nothing (AUDIT-DEAD-SURFACE deleted `getChronicleForContext`) → wired: `buildNarratorExtras` reads each PC's pinned entries (newest five, one line each, 300 characters) and every CHARACTER block ends with its PC's; the help's "recent entries in every packet" line corrected |
| AA08 OWED-PAIR-HELD-LOOPS | DUPLICATE (an endless loop) | `joinHeldMoves` drained with `while (length) shift()`, and the second owed roll was handed back and re-held forever → it takes the moves held as the round opens; one handed back or re-held waits for the next round; a round's held moves join it once (`_heldJoinedRoundId`) |
| AA09 ROUND-HIT-CONFIRMS-UNNAMED-PENDING-ROW | ATTRIBUTION | a round's hit confirmed a pending row because its figure was the roller's alone → the round's lines or narration must also name the row, whole words (free-flow's W23) |
| AA10 ASSET-METER-STAT-SUB-DROPPED | RULES | the scanner offered swaps to the five stats only → `extractStatReplacement` and the Haiku pass take supply / spirit / integrity / companion health ("+its / +their health"); the checked ability's asset is stamped (`statSubstitutedAssetId`) and statEnrichment rolls that vehicle's or companion's own track |
| AA11 AID-YOUR-ALLY-ABILITIES-UNKEYED | RULES | the scan matched "Aid Your Ally" alone → `assetMatchMove`'s `madeAs` (Gain Ground in a fight, else Secure an Advantage) for the scanner, the Haiku pass and rider extraction; `movePipeline.aidMadeInFight` shared with the roll |
| AA12 CHOOSE-BEFORE-ROLLING-TAKES-BOTH | RULES | the add was pre-checked and every option offered again after the roll → the scanner marks an add that is one option's (`preRollChoice`), riders name their `option`, and `settlePreRollChoices` keeps a checked option's riders (no longer a choice) and drops the others; unchecked, that option's are dropped |
| AA13 SELF-MEND-HEALS-NAMED-CREWMATE | WRONG-TARGET | `resolveHealPatient` read the patient from the stat alone (+wits = Provide care) → from the interpreter's `healSituation`; the stat only when none was read |
| AA14 WITHSTAND-STARSHIP-HIT-TAKEN-BY-MENTIONED-VEHICLE | WRONG-TARGET | a null `moveTarget` let the narration name any support vehicle it mentioned (a Z53 regression) → the support vehicle is the one the target names; a null target is the command starship (the prose fallback dropped) |
| AA15 VEHICLE-COMPANION-MISS-FREE-AT-ZERO | RULES | "-1 integrity / companion health" at 0 was clamped to nothing → the card's write takes what the track could not as the roller's momentum (`lossPastZero` → `overflowToMomentum`) and the card says so |
| AA16 FORSAKE-UNNAMED-CLEARS-NOTHING | RULES | an unnamed Forsake with two open copies table-wide cleared nothing while its card said "Vow cleared." → `selectForsakeVow`: the roller's own vows — unnamed, their one open vow; several, or no match, post "Forsake Your Vow — which vow?"; none found, the card says so and offers no costs |
| AA17 FIGHT-CARD-ACTS-ON-ANOTHER-VOW | WRONG-TARGET + DOC-DRIFT | ⚑ / 🏁 found their vow by name → by the card's vow id across every PC (`fightCardVow`): the holder's open copy; fulfilled or gone, both retire (titled why); an id-less card keeps the name path |
| AA18 FACTION-JOURNAL-RENAME-NOT-FOLLOWED | DUPLICATE + WRONG-DETAIL | the rename sync covered Actor hosts only → the host journal's name is written through to the record and a faction's World Journal page (`followEntityJournalRename`, `renameFactionEntry`), live on the canonical GM (`updateJournalEntry`) and at load (`syncEntityRecordNames`) |
| AA19 MAKE-CONNECTION-KNOWN-NPC-NOTHING-MADE | RULES + LOSE-STATE | the auto-create took only new or pending NPCs → `connectKnownNpc`: the known NPC the narration names becomes the roller's connection (an active listed card gets the bond; a dismissed connection row is un-dismissed and confirmed); several named → a GM whisper |
| AA20 COMMAND-VEHICLE-INTEGRITY-OFF-SHEET | WRONG-DETAIL (mirror drift) | integrity lived in `flags.ship` and the STARSHIP asset's track, never synced → the asset's track is canonical (actorBridge `readCommandVehicleIntegrity` / `setCommandVehicleIntegrity`), the flag its write-through mirror; `withSheetNotes` overlays it for every reader |
| AA21 LAST-SESSION-MISSES-SESSION-END | LOSE-PLOT | the mint finalised only an ended summary with no text → `finalizeSessionSummary` for every closing session, no call when every card past the coverage is End's own closing vignette |
| AA22 EXPEDITION-ARRIVAL-IGNORES-LABEL | WRONG-TARGET | a no-site arrival read the line's target, not the completed expedition → `expeditionArrival` returns the track's label: its place first, then the line's; the placeholder label (`UNNAMED_EXPEDITION_LABEL`) names nothing |
| AA23 ARRIVAL-NAME-INSIDE-WORD-DOCKS-SHIP | WRONG-TARGET | `resolveCurrentLocationName` ended in a raw substring rung → `wholeWordsFit` (W30's rule, either way) |
| AA24 SUPERSEDED-NARRATION-KEPT-IN-SUMMARY | WRONG-DETAIL | a supersede left the summary already made from the card → `dropSummaryOfSupersededCards` empties a covering summary (a regen due) before flagging (`summaryCoversCards`, shared with the X-Card) |
| AA25 SUMMARY-XCARD-CHECK-OFF-CHAIN | SAFETY | the summary's chained write never re-checked the X-Card → it compares the play count at its turn and writes nothing when it moved; the caller's copy gets only a kept summary |
| AA26 TRUTH-SET-STRIKE-EXACT-TEXT | GM-GATE + WRONG-DETAIL | `findBareStrike` compared exact lowercase text → `normaliseFactText`, as the other guards |
| AA27 XCARD-AFTER-END-SESSION-LOG-KEEPS-BEAT | SAFETY | the X-Card took only the Session Log's beats → `retractSessionLogSummary` empties the page's story when its summary was dropped and takes off lore titles whose entries are all retracted |
| AA28 KEPT-SCENE-STRIKE-BLOCKS-OTHER-PLACE | WRONG-DETAIL | a kept scene-fact strike was matched by the bare "scene" key and fact → it keeps its place, and `keptStrikeStandsAt` gates the write block, the lift and CORRECTED alike; the X-Card's blocks keep no place |
| AA29 PACED-LINE-UNDER-XCARD-SILENT | UX | `narratePacedInput` returned null under the X-Card → it posts the "Narration paused" notice (`postPacedNarrationPausedCard`, no narrator card); the line is still classified |
| AA30 SCENE-PCLESS-ASKED-AS-FIRST-PC | ATTRIBUTION | `interrogateScene` and `narrateOracleFollowup` fell back to the first PC → Z50's guard: no speaker, no character |
| AA31 GALLEY-CHARACTER-ABSENT-PC | WRONG-DETAIL | `narrateSessionVignette` took the first PC → Begin passes the present PCs (`actorIds`): one is the CHARACTER block, two or more each get one (third person), none none |
| AA32 REFLECTION-COUNTS-AS-FIRST-NARRATION | LOSE-PLOT | `sessionStartRecap` counted a published reflection as the session's first narration → it counts narrations only |
| AA33 CLOCK-VIGNETTE-NO-TIER-PASS | LOSE-PLOT | no capture ran after a clock vignette → `narrateClockAdvancement` schedules the tier pass (`scheduleNarrationCapture`, stamped with the narration id) after its still-triggered check |
| AA34 CAPTURE-DROPPED-ON-CANONICAL-HANDOVER | LOSE-STATE | the move / round capture re-checked `isCanonicalGM` when the narration landed → it runs on the GM whose client narrated (`game.user.isGM`); a player's client runs none |
| AA35 PRIVATE-LINES-TWO-GM-LOST-UPDATE | SAFETY (race) | two writes of the list in one round trip dropped an entry → every client re-syncs its own entry when a campaignState write misstates it (Z68's heal; one stored form) |
| AA36 TOGGLE-OFF-DIALOG-STALE-ROUND | RACE | the switch read the round before its dialog → re-read after Discard; a round resolving by then takes Z04's path (`turnOffAfterRound`) |
| AA37 CARD-MOVE-ENTRY-DROPPED-BY-PASS | LOSE-STATE | Pass / Withdraw / Edit reset the card move's `readAs` → `passEntry` / `withdrawEntry` keep it as the offer (`offerKept`) |
| AA38 SEND-NOW-OUTLIVES-ITS-ROUND | RACE | a module-level Send now flag outlived its round → `_sendNowRoundId`: a Send now for that round only |
| AA39 REFUSED-SEND-THEN-OFF-STILL-TURNS-OFF | UX | `modeOffAfter` was marked before the send's checks → marked once the send is accepted, on the round it named |
| AA40 ROUND-NARRATION-CLAIM-REFUSED-SILENT | UX | the narration's and a re-entered roll's claims handled only a busy lock → `lockNotClaimed`: a refused claim stops the round and whispers the round-stopped notice |
| AA41 ROUND-READING-FIELDS-WRITE-ONLY | PRODUCED-BUT-DEAD | `decision` and `combatPosition` were stored and never read → retired; Z37's field check sweeps an entry's `reading` and `choices` too |
| AA42 ROUND-READING-LOST-ON-CANONICAL-LEAVE | RACE | a GM leaving ran only the advance pass → `recoverRound("gm-left")` restarts the lost readings |
| AA43 XCARD-DURING-UPGRADE-STEP-ROUND-CLOSED-UNNARRATED | LOSE-PLOT | the upgrade step began the narration under the X-Card and the round closed unnarrated → neither the upgrade step nor the narrating phase begins it while the X-Card is in play; the lift resumes |
| AA44 CANONICAL-MOVE-TEXT-UNREAD | PRODUCED-BUT-DEAD | `buildCanonicalMoveBlock` read fields the system's move documents lack → `system.Text` (links reduced to labels, tags stripped); the test fixture is the vendor shape |
| AA45 COMPANION-HIT-RENARRATE-NOTICE-FALSE | UX | the pick never read the narration → the companion the target, else the line, names (`namedOnce`); the healthiest is the fallback and its notice says to name one |
| AA46 UPGRADE-UNPREPARED-CLAMP-MOMENTUM | RULES | the unprepared mark's momentum clamp outlived the reverted price → `momentumClamped` on the supply receipt, given back by `revertPayThePrice`; the burnable momentum adds it back, capped at the pre-mark maximum; Improve reverts before its meter write |
| AA47 PRICE-REDIRECT-PICKER-CLOSES-BURN-UNHINTED | UX | W16's redirect picker had no hint → "burn or improve first" while the move's upgrade is open (`upgradeFirstOwed`), on the picker and the Sacrifice Resources card |
| AA48 REFUSED-CLAIM-DRAIN-DROPS-HELD-MOVE | LOSE-STATE | a handed-back held move refused again got "Try again" and was dropped → re-held at the front (`reholdRefusedForcedMove`) with a GM notice; held moves wait for a landed write |
| AA49 FORSAKE-CREWMATE-EXACT-BEATS-OWN | WRONG-TARGET | the global ladder put a crewmate's exact-name vow ahead of the roller's whole-word one → the roller's own vows only (`selectForsakeVow`, `ownOnly`); a crewmate's is never forsaken |
| AA50 FORGE-PICK-ROLLED-AFTER-CONNECTION-GONE | RULES | the track-gone guard skipped the "connection" source, and the id rung ignored `unbonded` → both fixed; the card says severed, removed or bonded |
| AA51 RECOMMIT-FORSAKEN-SAID-FULFILLED | WRONG-DETAIL | the recommit's and the milestone picker's refusals said "already fulfilled" → worded by the `forsaken` flag (`readVows` exposes it) |
| AA52 REWARD-PROMISED-ON-FINISHED-VOW | LOSE-STATE | a pick on a vow closed on every copy was set → refused, the card closed (`rewardChosen` "vow-fulfilled" / "vow-forsaken"), the presser and GMs whispered |
| AA53 MILESTONE-PICK-GONE-VOW-CLOSES-PICKER | LOSE-STATE | a gone vow was found after the claim, which closed the picker → refused before the claim with a short card; the picker resolves only when no vow it offers is open |
| AA54 ART-CACHE-PAGELESS-ENTRY | DUPLICATE | a refused page left a flagged page-less entry, and the retry made a second → the next store completes it (`completeAssetEntry`; entries flagged `assetEntityType` / `assetEntityId`); `deleteEntityArtAssets` takes one |
| AA55 DISMISSED-NAME-HIDES-RENAMED-RECORD | WRONG-DETAIL | a record renamed onto a dismissed name left the name index → every naming hop un-dismisses it (`undismissRecordName`): the identity reveal, the Actor and journal sidebar renames, the load-time repair |
| AA56 MODULE-PIN-DESCRIPTION-EMPTY | WRONG-DETAIL | `description ?? requirement` never passed "" → a non-empty description, else the enabled abilities' text (`readAssetAbilityTexts`, shared with `readAssets`), else the requirement |
| AA57 XCARD-ACTIVE-AT-MINT-LOSES-LAST-SESSION | LOSE-PLOT | a summary reply was discarded while any X-Card stood → only on a play during the call or a source card the X-Card removed (`isNarrationXCarded`) |
| AA58 LINE-NARRATED-DURING-LOAD-MINT | RACE | Z24's being-replaced state gated rounds only → moved to session/lifecycle.js (`noteSessionBeingReplaced` / `sessionBeingReplaced`), read by the chat gate and the held-move drain too |
| AA59 PANEL-BEGIN-DISABLED-IDLE-SESSION | UX | the panel read the session gate alone → `over` (gate open and `sessionNeedsMint`): "Over — four hours without chat", Begin enabled, End still enabled |
| AA60 BEGIN-DIALOG-COUNTS-PRIVATE-FLAGS | SAFETY | the heading counted every flag → the flags the viewer is shown |
| AA61 AUDIO-UPLOAD-FAIL-REBILLS | DUPLICATE | a refused upload dropped the clip, so every retry synthesised it again → the audio GM keeps unsaved clips (newest 32, in memory) and uploads them on the retry; `unsaved: true` on the done signal; the GM told once |
| AA62 PROGRESS-TRACKS-JOURNAL-BY-NAME | LOSE-STATE | every reader found the journal by name → by its `tracks` flag (`findTracksJournal`; the interpreter likewise); the name only for a journal no track was saved to |
| AA63 WORLD-JOURNAL-BY-NAME | LOSE-PLOT + PRODUCED-BUT-DEAD | the `worldJournalCategory` flag had no reader → it is the lookup key (`findJournal`, `findWorldJournal`); the name only for an unflagged journal, which is then stamped |
| AA64 PANEL-POSITION-BADGE-NOT-CLICKERS | WRONG-DETAIL | the badge showed the fight's last-set position → the viewer's own (`combatPositionFor` with `resolveUserActorId`'s PC), titled whose |
| AA65 SIDECAR-REQUIRED-SETTING-DEAD | PRODUCED-BUT-DEAD | only the panel read it → retired (key, registration, getter, panel box, help row; a stored value stays unread); the missing-fence warning stays unconditional |
| AA66 WJ-PANEL-NEVER-REFRESHES | UX | no hook re-rendered it, and its opener called v1 `bringToTop` → local page and contradiction-card hooks re-render an open panel; the opener re-renders it |
| AA67 CLOCKS-PANEL-ODDS-DEFAULT-SMALL-CHANCE | WRONG-DETAIL | the odds select had no selected option → drawn on `DEFAULT_ADVANCE_ODDS` (likely), shared with `createClock` and `!clock new` |
| AA68 FINISH-SCENE-ROLL-BLOCKED-AT-ZERO | RULES | the ⬡ needed `ticks > 0` → `canRollProgress`: a scene challenge whose tension clock is full rolls at no progress; every other track keeps the guard |
| AA69 WJ-HELP-ANNOTATIONS-DELETED | DOC-DRIFT | the help promised annotations and editable entries → "Editing entries": the narrator reads the record, a page edit is replaced (V31), corrections through `!journal` |
| AA70 README-STALE-CLAIMS | DOC-DRIFT | Private Lines "visible only to you and the GM", the deleted `ContextPacketSchema.tokenBudget`, vows / connections / legacies in the Progress Tracks panel → the help's privacy boundary; "Narrator prompt size" with the caps that exist; the panel's three track types |
| D1 SHEET-ROLL-NARRATED-OUTSIDE-ROUND | UX; option A | a participant's sheet progress roll was narrated at once, mid-round → the roller's entry, ready (`READING_KIND.SHEET_ROLL`, the parsed outcome), never rolled again; held when no round collects; narrated alone if the mode turns off first; a non-participant's at once |
| D2 ROUND-FIGURE-OWNER-RUNG-ORDER | ATTRIBUTION; option B | the description rung outranked the narration's clause → after the roller's own line, the description and the clauses together must name one acting PC, else D3's card (#342) asks |
| D3 XCARD-CLEARS-KEPT-FRAME | LOSE-STATE; option A | the X-Card cleared the frame its narration wrote → a frame keeps a bounded `previous` chain of its scene, and `retractNarrations` restores the newest no removed narration wrote (an upgrade's supersede too) |
| D4 PLAYER-TRUTH-SET-OVER-XCARD | SAFETY; option A | a player's `!truth set` of an X-carded fact was recorded → refused (`findSessionBlock`: the active scene's X-Card retraction or Replace original, or a kept block where it stands); a GM's still recorded |
| D5 PRIVATE-LINES-QUEUED | SAFETY; option A | the sync waited behind a Claude-calling relay → in `UNQUEUED_ACTIONS` beside `xcard.activate` (one read-and-set on the write chain) |
| D6 SESSION-PANEL-INCITE-SKIPS-KEYED-GM | UX; option A | a GM's press ran on their own client → it posts the presser's `!incite` line (RUN_ON.CLAUDE) |
| D7 VERSION-PIN-RULE-MINOR-BUMP | DOC-DRIFT; option A | the v1.8.0 help notes were headed v1.7.37 and the rule's repair would have filed them under v1.8.1 → headed v1.8.0, `[Unreleased]` promoted to `[1.8.0]`; the rule renames a passed heading to the tag that shipped it |

### Found while fixing issue #345 — open

Left open by the fixes above, each with a proposed fix (none filed as an
issue yet). Existing open items the fixes touched are noted after the list.

Existing open items the fixes touched: SUFFER-EXECUTOR-ASSET-SCHEMA stays
open (AA15 takes the at-0 loss as momentum in the consequence card's own
write, not through those executors, and since AA20 the starship's integrity
is its STARSHIP asset's track, which their write misses too); AA06 extends
SECTOR-DUPLICATE-NAMES' cross-sector rule to the narrator's own resolvers (a
same-sector clash still resolves to the first); FORCED-MOVE-HOLD-RELOAD
holds two more in memory (D1's held sheet roll — its payoff already applied,
so a reload loses its narration — and AA48's re-held move);
RIDERS-IGNORE-UNCHECKED's proposed fix must keep AA12's unchecked "choose
one (before rolling)" case; XCARD-CHRONICLE and STRIKE-CHRONICLE are
sharpened by AA07 (a pinned entry reaches every narration's CHARACTER
block); SAFETY-001 loses its Private Channel half (AA03); SESSION-MINT-RACE
sits beside BEGIN-MINT-LINE-WINDOW; AUDIO-FORGE-ORIGIN-SHARED's forged "no
clip" can now also say storage refused it (AA61's `unsaved`); and "Private
Lines are private by convention" holds for a GM-only flag too (AA60 stops the
count, but `campaignState.safetyFlags` is world data a console can read).

### Eleventh bug audit (issue #342) — all seventy-four fixed and the eight decisions built in v1.8.0

Found by the eleventh bug audit (2026-11-06) of `8a4ae3b` (the merge of
Batch Mode, PR #341), with a probe per finding (`tests/probes/` on branch
`claude/jolly-franklin-9ngysm`; the report is
`docs/testing/bug-audit-11-2026-11-06.md` there, with its area notes and
refuter pass): 74 findings Z01–Z74 (Z01 the one high-severity, safety row)
and 8 decision rows D1–D8. The maintainer asked for issue #342 to be
addressed on 2026-11-06 and took the recommended option on every decision
row: D1, D2, D3, D5, D7 and D8 option A, D4 option A narrowly, D6 option B
(decisions.md → "Issue #342 decisions"). One commit per row (Z03 and Z20
share one); each fix carries its own regression tests, converted from the
probes, which fail with the fix taken out (`docs/testing/fix-sensitivity.md`).
Run against the integrated branch, the original probes pass 214 of their
254 tests. The 40 others assert what a fix changed: 17 check the defect's
own mechanism in a setup line, or cascade from one in the same file (the write order Z01 and Z17 change, Z64's
unpaid momentum during the summary call, Z30's two held swears, the old
rider hold in Z03's), 3 are "draft cleared on Sent" controls (Z31 keeps
the draft), 13 assert an option not taken or a retired surface (D6's
`isNewSessionStart`, D2's optional offer, BATCH-D1's option B for D3,
Z37's "written and read", a told refusal for Z27, Z43's other fix), 5 rest
on a harness shortcut or read a round after it moved on (Z29's
`speaker.actor`, PIPE-1's scripted narration restating the refused fact,
SESS-5's PC made after boot, MP-5 and BATCH-14), and 2 are doc-row controls
quoting the old text (Z69, Z72); each converted test asserts the fixed or
decided behaviour.

None has been checked in a live Foundry world yet. The ones to try first:
a player's X-Card, Set a Flag or Take a Break with the GM's game idle for ten
minutes and then a chat line (Z01); a refused save on a chat line's
narration (Z02); Batch Mode with two players — an "Apply asset effects"
prompt left open, then the next round and Send now (Z03); switching the mode
off while a player chooses Burn (Z04); a card's move pressed after Confirm
(Z05) and the 🛡 resist roll at 0 health beside a written action (D2); a
Round window re-rendered mid-reading (Z06); a round with a Make a Connection
miss first, and one where two players each meet an NPC (Z08, Z09, D3's
whose-connection buttons); a GM's PC acting beside one player (Z40); burn a
miss whose price ran the supply out (D4) and one whose price advanced a clock
another player's price then filled (Z46); finish an expedition toward a
derelict, and one to a settlement in a sector with one unexplored site (Z14,
D7); `!at` a derelict whose name another sector shares (Z15); a co-GM holding
the only ElevenLabs key (Z67); a player's console-made look-alike narrator
card with a keyed GM connected (D8). Choices for the maintainer to confirm:
Z56 makes the move card's 🤝 / 🔗 picker the card's roller's to press (a
crewmate types their own Develop Relationship); Z05 leaves an offer standing
through Withdraw / Edit / Pass (only Keep mine drops one) and holds a
card-move entry the round doesn't roll; D2 puts the written action back as
the author's draft (not auto-submitted); Z31 keeps a submitted action as the
author's draft until the round takes it (a table-talk line typed meanwhile no
longer becomes the draft); Z09's attribution ladder auto-creates no NPC two
PCs could own (it waits on D3's card); D3's "whose connection" is buttons on
the row, with No one creating the NPC unbonded; Z43 keeps a promoted tier
detail through a strike (whether a strike should also take the GM's promoted
Notes line is open); Z67 adds a world setting, `audioKeyedGmUserIds`, and
the audio-serving GM rule (`isAudioGM`); D8 drops the Play button from an
honest card a player's own game narrated once a keyed GM connects, and a
player card over the cap does not count at all; Z64 pays the momentum before
the summary call (a narrower window remains while the momentum writes
themselves land); D6's recap needs the load's own mint (a Begin a Session
that mints without a reload posts none); Z12 restores the token's own spot
whenever one is recorded; Z14 arrives at the expedition's site even when its
label names a place; D7's "Unexplored Site" rule lives in the matching
ladder, so an unlinked track made before this version still charts the lone
site; Z53 needs the interpreter to name the support vehicle (prompt guidance,
model-dependent) — since issue #345 AA14 the whole mechanism: a null target is
the command starship (SUPPORT-VEHICLES-UNLISTED, in issue #345's open items).

| Code | Class | Defect → fix |
|---|---|---|
| Z01 ACTIVITY-STAMP-REVERTS-RELAYED-WRITE | SAFETY | the canonical GM's activity stamp wrote { ...cached campaignState, lastSessionTimestamp } on a due message (a relayed handler's own card) and landed after, undoing, the handler's write → the stamp is its own world setting sessionActivity { sessionId, at }; idleMs / sessionLastSeenAt read the later of it and the mint's lastSessionTimestamp |
| Z02 PACED-NARRATES-ON-CACHED-STORE | LOSE-STATE | routePacedInput and swearSharedVowForAll handed the narrator the cached campaignState → each narrates on a deepClone (X09 / Y04 shape) |
| Z03 RIDER-PROMPT-HOLDS-NEXT-ROUND | UX | finishRound awaited each finishMove (rider DialogV2) and the held free-flow moves inside the one advance pass, so every later advanceRound only queued → riders run on their own chain off the pass, one round after another; held moves are drained off the pass, one drain at a time |
| Z04 MODE-OFF-FORCES-KEEP | RULES | the switch's batch.sendNow+modeOffAfter ran keepUpgrades(null) in the upgrade step → requestSendNow only marks modeOffAfter on a resolving round; Keep-everyone stays a GM's own Send now |
| Z05 BATCH-CARD-MOVE-OFFER-DROPPED | RULES | an offer beside a Ready entry was outrun by readyToResolve / Send now / an unresolved close, and the claimed card's move was lost; Keep mine was a no-op on Ready → offer and card-move entry carry messageId; takeCardMoves (at fixActing and closeCollectingRound) hands untaken offers and non-acting card-move entries to holdForNextRound; confirmEntry on Ready clears the offer |
| Z06 ROUND-WINDOW-RERENDER-WIPES-PICKS | LOSE-STATE | _replaceHTML rebuilt the reading form from its defaults → picks carried across a re-render for the same submission (data-submission-id) |
| Z07 BATCH-FINISH-SCENE-TWICE | RULES | an ended challenge scored 0 → rollMove's track-gone guard covers scene_challenge by id; noteReadTrack notes finish_the_scene's challenge (selectSceneChallengeTrack) so refusalFor refuses it "ended earlier in this round" |
| Z08 ROUND-CAPTURE-LEAD-CONNECTION-MISS | LOSE-PLOT | runRoundNarrationPasses led the round's one capture with entries[0]; a Make a Connection miss lead returned before any pass (scope §9) → a miss takes no part in the capture (neither lead nor class); only its own auto-create is withheld |
| Z09 ROUND-CAPTURE-CREDITS-FIRST-ROLLER | ATTRIBUTION | the round's capture auto-created the reply's first connection (any player's NPC) with the first hit's roller, seed and bond → connectionRollers: one auto-create per hit, the figure roundFigureOwner gives that roller (own line → detected description → narration clause; amended by issue #345 D2: after the own line, the description and the clauses together must name one acting PC, else D3's card), own seed and bond; unplaced figures queued; the pending-row fallback is per roller |
| Z10 ROUND-TIER-PASS-SKIPS-UNROLLED-ENTRIES | LOSE-PLOT | the round's tier pass ran over rolled moves' relevance only, and only at an interaction widest class → it runs whatever the class (roundTierRefs): an unrolled entry brings the prompt's matched set (paced rule), a rolled interaction move its own relevance (move rule) |
| Z11 UPGRADE-KEEPS-REVERTED-PRICE-IN-ORACLE-MEMORY | WRONG-DETAIL | a reverted price's oracleMemory stayed in RECENT ORACLE RESULTS → the move price's memory carries resolutionId; revertPayThePrice drops it (dropOracleResultsOf) on the write chain |
| Z12 XCARD-RESTORE-TOKEN-STAYS-ON-REMOVED-PIN | SAFETY | the restore synced the token only onto a pin, so a deep-space or no-position ship kept its token on the removed destination → a narration's position record carries tokenBefore {sceneId, tokenId, x, y} (null from every other writer — the flag-merge rule) and the restore moves the token back to the oldest removed narration's spot, else syncs as before |
| Z13 FACTION-LANDSCAPE-OLDEST-FIRST | LOSE-PLOT + DOC-DRIFT | [4e] listed records first in factionIds (creation) order, capped at 4, so no fifth record or WJ-only faction ever reached the narrator; faction-flow.md claimed every stance and a rotating block → mergeFactionLandscape ranks records and every WJ faction by recency (later of record/WJ updatedAt; a record still wins its key; ties keep input order); getFactionLandscape takes { limit } and the narrator passes Infinity (detection keeps 3); flow doc corrected |
| Z14 EXPEDITION-ARRIVAL-BY-LABEL-NOT-SITE | WRONG-TARGET | the finish arrived by the track's free-text label → it arrives by the expedition's site's location Actor (selectExpeditionSite: track siteId, else the unexplored site the label names, never a guess); no site → by name as before |
| Z15 ARRIVAL-BY-NAME-OTHER-SECTOR-NAMESAKE | WRONG-TARGET | both name resolvers took the older sector's namesake → active sector first on each rung; !at docks the ship by the resolved id |
| Z16 TRUTHS-JOURNAL-BY-NAME | LOSE-STATE | the edit hook required the system title; the reconcile preferred the newest journal by title over the linked one → hook by linked id only; the reconcile keeps the linked journal unless a titled save is newer (_stats.createdTime) |
| Z17 ORACLE-MEMORY-LOST-TO-NEXT-WRITE | LOSE-PLOT | the oracle capture's whole-object write was followed inside its round trip by the PtP clock advance / the !oracle follow-up's scene start, built from the cache without it → one per-client campaignState write chain (multiplayer/campaignStateChain.js serialiseCampaignStateWrite) for the capture, every clock write, persistCampaignStateFields and persistSceneLedgerFields |
| Z18 ROUND-WRITE-REFUSED-LOSES-RECORD | LOSE-STATE | markRolled threw before recordMove; the pass's catch was console-only; Send now did nothing while rolling → recordMove runs regardless (markRecorded∘markRolled carries the stamp); advanceRound's catch whispers the GMs (batchRoundStoppedNotice); requestSendNow re-enters a rolling/narrating round; a roll recorded on this client isn't reported "may be incomplete" |
| Z19 ROUND-LOCK-RELEASE-NO-RETRY | RACE | the driver dropped releasePendingMoveLock's false → releaseRoundLock retries once; refused again it tells the GMs (batchLockNotice), and claimRoundLock takes back this client's own unreleased claim instead of waiting on it |
| Z20 ROUND-CLOSE-REFUSED-RIDERS-TWICE | DUPLICATE | a refused close still ran the riders, then the loop's retry ran finishRound again → closeRoundHere: only the call whose transition closes the round runs the riders and opens the next; a refused close is retried once, then throws |
| Z21 ROUND-CARD-REFUSED-UNTOLD | UX | narrateTheRound's catch was console.error only → the resolving GM gets V09's notification; other GMs get a whisper (batchNarrationUnpostedNotice) |
| Z22 HANDOVER-NEXT-ROUND-NOT-OPENED | RACE | the closer was no longer canonical and the driver ignored batchMode.round writes → onBatchSettingWrite: a closed round heard on the canonical GM (mode on, not modeOffAfter) runs openRoundIfDue("round-closed") |
| Z23 RESOLVING-ROUND-CLOSED-BY-RECOVERY | LOSE-PLOT | recoverRound closed any open round of an ended session on every trigger → a resolving one is closed only on ready / resolver-left (CLOSES_RESOLVING_ROUND); otherwise it finishes first |
| Z24 BATCH-IDLE-ROUND-RECOVERED-LIVE | RACE | the ready recovery read the idle session as live before its mint landed → _sessionBeingReplaced (set at the canonical GM's ready when sessionNeedsMint) makes recoverRound treat it as over and openRoundIfDue refuse it until currentSessionId changes |
| Z25 ROUND-CLAIM-INVISIBLE-TO-FREE-FLOW | RACE | claimPendingMoveLock's copy write left this GM's cache free during its round trip → _moveLockClaimInFlight, consulted by onMessage's lock check, claimPendingMoveLock and drainDeferredForcedMoves |
| Z26 UPGRADE-WAITS-ON-GONE-ROLLER | UX | "roller left = Keep" was only an event during the step → advanceOnce's UPGRADING case keeps (silently) the undecided offers of rollers not connected (keepUndecidable) |
| Z27 UPGRADE-OFFER-IGNORES-CHOICE | UX | upgradeOffers checked only consumed and nothing revisited an offer → upgradeOffers offers only what the GM handlers accept (upgradeOpen: resultUpgradeBlocker, laterMoveFollows, consequenceChosen); keepUndecidable keeps offers whose card has since closed (not a card being burned or improved); an updateChatMessage hook (canonical GM) advances the round when an offer's move card or choice card changes |
| Z28 ROUND-UPGRADE-RIDER-PICKER-SUPERSEDED | LOSE-STATE | redirectSupplyLoss bound the picker to the burned original resolution → posts upgraded:true when upgradeKindFor(resolutionId) at post time |
| Z29 HELD-CARD-MOVE-LOST-ON-MODE-OFF | LOSE-STATE | _heldForRound was never drained when the mode turned off (modeOffAfter or direct) → onBatchModeSwitched(false) moves them onto _heldForFreeFlow and runs them (free-flow's session gate still holds them before Begin) |
| Z30 BATCH-INCITING-SWORN-PER-PRESSER | DUPLICATE | one held post or entry per press rolled the swear per presser → takeForcedMove / joinHeldMoves drop a press when the card is sworn or its swear is already an entry, offer or held; the swearPressDropped whisper re-arms the presser's ⚔ (swearVow.js) |
| Z31 UNROLLED-ACTION-TEXT-LOST | LOSE-STATE | the draft was cleared on Sent, leaving the round entry as the only copy → the draft is kept until the round takes the action (its entry acts, or the round card's roundEntries name the line, also checked at load); a closed round's unrolled text and setAside are restored on change and at load; a failed reading's box falls back to entry.text |
| Z32 ROUND-WINDOW-XCARDED-NARRATION-SHOWN | SAFETY | the window re-rendered on the pause write before the xCarded flag landed → newestNarration also checks isNarrationXCarded; refresh compares the latest narration too |
| Z33 ROUND-NO-GM-BANNER-FALSE-PROMISE | UX | the banner promised a send nobody makes and never re-rendered on connection → reworded; refresh on userConnected and on the keyed-GM registry's create/updateSetting; a stale no-GM refusal is cleared |
| Z34 ROUND-SEND-AGAIN-STALE-ROUND | UX | the pending submission kept its dead roundId → dropped once its round is no longer the one collecting; an over-long draft is refused locally |
| Z35 ROUND-ENTRY-PC-GONE-FIRST-PC | ATTRIBUTION | rollMove / persistResolution fell back to the first PC → rollEntry refuses (card plus markRefused); startReading records ENTRY_ERROR.CHARACTER_GONE and the window says so |
| Z36 ROUND-NAMES-FROZEN-AT-OPEN | WRONG-DETAIL | names copied at round open, roster filtered by name → roundNarrationEntries names by actor id; buildNarratorExtras / buildPartyContext take actingActorIds (actingNames retired) |
| Z37 ROUND-FIELDS-WRITE-ONLY | PRODUCED-BUT-DEAD | sceneId and resolverClaim (and rolled.isMatch) were stored and never read → retired; beginResolution's doc corrected; the field check now covers the round (an entry's reading and choices too since issue #345 AA41) |
| Z38 ROUND-ROLL-INSTEAD-NO-TARGET | RULES | suggestedTargetId was written, never read → rereadEntry carries readAs.moveTargetId; readAction forces it |
| Z39 BATCH-SCENE-VARIANT-AFTER-FINISH | RULES | the variant rule ran at read time only → rollMove applies moveOutsideSceneChallenge before rolling |
| Z40 ROUND-SECOND-PERSON-TWO-ACTORS | WRONG-DETAIL | "auto" counted active non-GM users only (W21), so a GM-PC + one-player round was second person over two CHARACTER blocks → resolveNarrationPerspective takes actingCharacters (the round's CHARACTER blocks): 2+ → third person; an explicit setting still wins |
| Z41 XCARD-AFTER-END-LOSES-LAST-SESSION | LOSE-PLOT | an X-Card on End's closing vignette emptied the finalised summary; rollSessionIfDue finalised only unended sessions → the mint also finalises an ended session whose summary has no text (since issue #345 AA21, every closing session whose summary is behind, End's own closing vignette aside) |
| Z42 SESSION-STRIKE-RENDER-ONLY | WRONG-DETAIL | a kept strike (sessionRetractions) blocked no re-assertion and !truth set couldn't lift it after a scene boundary → kept entries carry truthId/subjectKey/retractedBy/asserter; findSessionStrike blocks applySidecar's re-assertion (by subject key, else name) and setTruth lifts it (dropped on the store via persist onto, lore restored by truthId; a player's set over a GM strike refused) |
| Z43 STRIKE-LEAVES-PROMOTED-NOTE | SAFETY | dropTierDetails dropped a promoted tier entry and left its Notes paragraph, severing D7's link → a strike keeps a promoted entry as it keeps a pinned one |
| Z44 XCARD-DURING-PROMOTE-LEAKS-NOTES | SAFETY | the X-Card's undo dropped a not-yet-promoted entry during the Promote's Notes write; the Promote kept its line with no entry → the Promote refuses an X-carded narration's detail and, after its Notes write, takes the line back (withoutPromotedParagraphs, now exported) when the entry is gone or its narration X-carded |
| Z45 ENTITY-PANEL-SHEET-NOTES-STALE | SAFETY | actorUpdateShowsInPanel ignored system.notes / system.pronouns, so the X-Card's D7 strip (written after the record) stayed on the open panel → re-render on those paths for an entity Actor (local only) |
| Z46 BURN-REWINDS-CLOCK-ANOTHER-PRICE-FIRED | LOSE-PLOT | D8's supersede keyed on the burned receipt's triggered → revertTensionClocksForBurn (inside its queued write) and revertVowClocksForBurn report clocks taken from full; those vignettes are superseded |
| Z47 KEPT-PRICE-FOLLOWUP-CARD-SUPERSEDED | RULES | a kept picker's pick posted its resist card without upgraded → keepPriceCard marks executorOpts.upgraded; postSufferChoiceCard stamps upgraded from it; postResistRoll forwards it |
| Z48 BURN-GONE-ROLLER-BURNS-FIRST-PC | ATTRIBUTION | resolveActor fell back to the first PC; a receipt naming a gone PC refunded the upgrader → the card's PC or nobody (no-actor); a receipt naming a PC refunds that PC or nobody |
| Z49 PTP-PCLESS-NARRATIVE-PRICE-NARRATED | ATTRIBUTION | noPayer required a suffer route → keyed on the payer alone: no oracleMemory / oracleNarration / follow-up, the no-character notice |
| Z50 PACED-PCLESS-NARRATED-AS-FIRST-PC | ATTRIBUTION | narratePacedInput's getActiveCharacter fell back to the first PC → no speaker resolved, no character (option A) |
| Z51 BURN-PRICE-STANDS-MOMENTUM-REFUNDED | RULES | the burn reset refunded a kept price's momentum receipt → priceStands subtracts priceMomentumTaken from the target (burnMeterChanges keptPriceMomentum) |
| Z52 BREAK-ADD-USED-BEFORE-CLAIMED | DUPLICATE | added from the working copy, then cleared (refusal warned) → consumeNextMoveAdd claims on the store first; takeNextMoveAdd / clearPersistedNextMoveAdd folded into it |
| Z53 WITHSTAND-DAMAGE-COMMAND-VEHICLE-ONLY | WRONG-TARGET | an integrity roll always read and changed the command vehicle (enrichInterpretationStatValue → getCommandVehicleActor) whatever vehicle was named → the interpreter names a support vehicle as withstand_damage's moveTarget; the roller's named asset is the roll's vehicleItemId, its choices write its Integrity track (actorBridge.applyVehicleAssetIntegrityChange), its Battered condition gates the +1 |
| Z54 REWARD-CLAIM-SKIPPED-NO-VOWID-FLAG | DUPLICATE | grantLinkedVowReward's claim and Forsake's lost flip keyed setSharedVowReward on item.flags.vowId (undefined when the stamp never landed), so the status never flipped → both key it by the new actorBridge.vowCopyId (the flag, else the Item id); payoffVowCopies matches by isVowCopy |
| Z55 REWARD-PICK-NO-FLAG-NAMESPACE-THROWS | LOSE-STATE | vowRewardStatuses read item.flags[MODULE_ID].reward unguarded on a namespace-less Item that isVowCopy found by id — a TypeError out of every pick → optional chaining on the namespace |
| Z56 CONNECTION-SUGGESTION-NOT-ROLLERS | ATTRIBUTION | the picker named no roller, so its pick spoke as the presser → the picker carries the move card's actorId and its pick uses cardRollerPc; the suggestion press is the roller's player's or a GM's, as ⚑ |
| Z57 FORGED-BOND-ITEM-NOT-MIRRORED | WRONG-DETAIL | forgeBond set bonded on the record only → setBondItemForged writes system.completed through bondItemsFor; CHARACTER STATE names a completed bond "bonded" |
| Z58 RECOMMIT-REFUSED-UNTOLD | UX | write-refused and nothing-to-do outcomes were GM-console only → cardActions.tellRecommitOutcome: a refused write is whispered to the presser and GMs (press again), a target gone, finished or bonded since gets Y10's short card |
| Z59 VOWLESS-NAMESAKE-COPIES | WRONG-TARGET | collectVowCopies fell back to every PC's exact-name vow when the primary had no vowId flag → copies are isVowCopy(vowCopyId(primary)) only; a vow with no flag is its own only copy |
| Z60 RELIST-CONFIRM-SKIPS-CREATION | LOSE-STATE | a refused faction Confirm whose journal the load listed took U25's exists path on retry: no seed, WJ stance/backlink/mirror, ledger promotion; the bare record hid the WJ stance in [4e] from the listing on → exists path runs completeListedEntity (reconcileConfirmedFaction: seed-once + attitude reconcile + backlink unless linked; mirrorConfirmedFaction while unlinked; portrait when none; promoteNewEntityLedgerSubjects), creation path shares the two faction helpers; mergeFactionLandscape shows a record at "unknown" its WJ attitude's mapped stance |
| Z61 TAINTED-WORLD-GENERIC-ICON | WRONG-DETAIL | iconForPlanetType mapped 10 of 11 classes; Tainted World drew icons/svg/circle.svg though the vendor ships its tokens → Tainted row added |
| Z62 CHRONICLE-PAGELESS-JOURNAL | LOSE-STATE | a refused page creation after the journal landed left a flagged page-less journal that every later write found and failed on, for good → writeChronicleNow first gives it its page (completeChroniclePage); a page refused again leaves that write unsaved, logged |
| Z63 BEGIN-CLOCK-TRIGGER-RETRY-UNNARRATED | LOSE-PLOT | a refused Begin clock trigger was narrated against the store, dropped as rewound (stillTriggered), and the Retry's applyClockAdvances fill narrated nothing → Begin narrates no unsaved trigger (owed); applyClockAdvances fires the trigger vignette for each clock its saved fill fills, after the write lands |
| Z64 END-SESSION-MOMENTUM-AFTER-CLAUDE | LOSE-STATE | the noted-focus momentum was paid after endScene and the forced summary Claude call; a GM leaving mid-call lost it and the N08 correction said "taken" → paid right after the gate write |
| Z65 SECTOR-TROUBLE-THREAT-SHARED-BY-NAME | WRONG-DETAIL | the threat was named by the trouble text alone → named "<trouble> — <sector>" |
| Z66 PRIVATE-UNSAVED-LINE-NOT-RENDERED | UX | the line was computed only at render → transcript notifies each flip (onTranscriptUnsavedChange); the open window re-renders (PrivateChannelApp.refresh) |
| Z67 AUDIO-KEYLESS-SYNTH-ON-KEYLESS-CANONICAL | UX | keyless audio requests were served by the canonical GM only → GMs advertise their ElevenLabs key into audioKeyedGmUserIds (ids only); isAudioGM (lowest-id active GM listed, else canonical) serves requests, asks and relayed clips |
| Z68 KEYED-GM-REGISTRY-LOST-UPDATE | RACE | concurrent read-modify-writes dropped one GM's id → every GM re-advertises on each write of either key registry (writes only when its own entry is wrong; converges) |
| Z69 SETTINGS-REFERENCE-BATCH-MODE-MISSING | DOC-DRIFT | Batch Mode's two settings (the switch, the Round window's draft) had their table at the end of the Batch Mode page, which pointed at itself; the Settings Reference named neither → a "Batch Mode (Toolbar → Batch Mode)" section of the Settings Reference; the Batch Mode page points there |
| Z70 I18N-DEBILITY-KEYS-UNRESOLVED | PRODUCED-BUT-DEAD | all 13 keys were IRONSWORN.<Name> → IRONSWORN.IMPACT.* (IRONSWORN.DEBILITY.* for encumbered/maimed/corrupted), checked against the vendor's en.json |
| Z71 SCOPE-INDEX-293-STALE | DOC-DRIFT | scope-index.md showed Phone Play (#293) 🔄 IN PROGRESS though the issue was closed completed → ✅ COMPLETE, the remaining phone checks pointed at PHONE-LAYOUT / PHONE-PINCH-MAP |
| Z72 FILE-STRUCTURE-TOGGLE-MIRROR-STALE | DOC-DRIFT | file-structure.md's progressTracks.js row described the position toggle as W56's bug (game.user.character) and listed track types the panel doesn't show → resolveUserActorId's PC, its own position; PANEL_TRACK_TYPES (fights, expeditions, scene challenges) |
| Z73 CONNECTION-FLOW-SIDEBAR-PATH | DOC-DRIFT | connection-flow.md §1 listed a "Manual sidebar creation" fifth path → four paths; the createActor hook seeds a card a creator made, and a sidebar-made character is a PC to the module |
| Z74 FLOW-DOC-BARE-AT-CLEARS-SHIP | DOC-DRIFT | exploration-flow.md said a bare !at clears the ship position → it clears the current location only; the ship stays |
| D1 UNPREPARED-ENUMERATED-SACRIFICE-GREYED | RULES; option A | isOptionAvailable greyed the option while unprepared → open; the executor's W16 picker redirects the cost (the "any" picker still greys it) |
| D2 ROUND-DROPS-OWED-RESIST-ROLL | RULES; option A | the owed resist roll became an optional offer that Keep mine / Edit / Withdraw / Pass dropped → the resist post is flagged owedMove; offerForcedMove makes it the entry (written text in entry.setAside, restored as the author's draft; a displaced card move or a second owed roll held); submit / withdraw / pass / reread refused "owed"; the window shows Confirm only |
| D3 ROUND-DRAFT-BOND-HOLDER | ATTRIBUTION; option A | a round's draft card carried the first entry's PC and Confirm bonded it → the card carries every acting PC (flags.actorIds); a connection row's Confirm is a button per acting PC + No one, the pick checked against actorIds (draftConfirmPick), the bond on the pick or none (draftBondHolder) |
| D4 BURN-REFUND-LEAVES-CREW-UNPREPARED | RULES; option A, narrowly | the reversal refunded supply but kept the route's marks → the receipt carries unpreparedMarked / alliesMarked (markUnprepared's alliesMarkedIds); cleared once the supply is above 0, an "unprepared" upgrade step with a Retry |
| D5 FIGHT-CARD-FULFIL-AS-WINNER | ATTRIBUTION; option A | the 🏁 rolled as the card's roller (the winner) whoever held the vow → rolls as resolveVowHolderActor(vowName, actorId), the winner when they hold a copy; the miss's recommit offer follows |
| D6 SESSION-GAP-SETTING-NOT-THE-BOUNDARY | UX; option B | the gap setting gated only the ready-time recap, apart from C4's boundary → recap posts when the load started a new session after an earlier one; setting key/registration/getter/panel field+hint+save, isNewSessionStart, its tests and help row/wording retired; a stored value stays unread |
| D7 FINISH-REVEALS-SITE-OF-UNRELATED-EXPEDITION | WRONG-TARGET; option A | the finish's reveal kept the sole-site guess → requireLabelMatch at the finish; under it the pin's own "Unexplored Site" names the active sector's one unexplored site (stamp and finish); !reveal-site keeps the guess |
| D8 AUDIO-SYNTH-BOUND-ANY-AUTHOR | SECURITY; option A | any author's narrationText counted → countsAsNarratorCard gates the Play button, auto-play, the synthesis bound and the cache write: GM-authored only while hasKeyedActiveGM; otherwise a player's counts if ≤ Narration Max Tokens × 4 characters |

Found while fixing the eleventh audit: fifteen items, all fixed since at the
maintainer's request — see the next section.

### The eleventh audit's open items — all fifteen fixed in v1.8.0, with the fourteen found while fixing them

The fifteen items found while fixing issue #342 and left open (listed in the
section above until now) were fixed at the maintainer's request on
2026-11-06, each in its own commit with a regression test that fails with
its fix taken out (`docs/testing/fix-sensitivity.md`), and so were the
fourteen found while fixing those. GENERATE-PORTRAIT-AFTER-REGEN was not
reachable as filed (a test pins the cap; REGEN-LINK-REFUSED-SECOND-REGEN's
claim later needed the guard it proposed, and has it); FOUNDRY-REF-SETTING-HOOKS
is a reference section; END-SESSION-STALE-ENDSCENE (below) is closed by
XCARD-DURING-SCENE-END-MIGRATES and STRIKE-DURING-SCENE-END-LOST, whose
checks run before every one of a scene end's migration writes, End a
Session's included. None has been checked in a live Foundry world yet. The
ones to try first: the X-Card played while an oracle answer is being saved,
and while `!scene end` (or End a Session) is closing a scene — what it
removed must stay off the NPC's card, out of lore and LAST KNOWN, and stay
blocked in the next scene; a `!truth strike` made while a scene closes; two
GMs pressing a portrait's ↻ Regenerate together, and Generate pressed while
a seed's portrait is still being made; a Set a Course to "Bleak"; an
expedition toward a site the GM renamed. Choices for the maintainer to
confirm: the X-Card's pause jumps the write chain, so a chained write already
sent when it is played lands first and the pause takes back that change (an
oracle answer, a round claim in flight — a carried-back lock release is put
back); an X-Card block lasts the session (the next session may state the
fact) — a GM's own `!truth set` of the fact is still recorded and a player's
is refused, as the maintainer confirmed in issue #345 D4;
FREE-FLOW-RELEASE-REFUSED-TWICE also retries once for a move stopped before
its early release; the regeneration claim reuses `regenerationUsed` (a
refused save keeps the earlier portrait, locked, the regeneration spent); a
second first-portrait Generate waits for the first and gets its portrait;
ROUND-LOCK-WAIT-MARKED-LATE is practically unreachable in Foundry (shown
through the driver's host seam) and has no changelog line.

| Code | Class | Defect → fix |
|---|---|---|
| FREE-FLOW-RELEASE-REFUSED-TWICE | RACE | free-flow's finally dropped a second refused release, and a move stopped before its early release tried only once: the lock stayed held, nobody told → the finally retries once when the early release never ran; refused twice it whispers the GMs (postMoveLockNotReleasedCard), as Z19's releaseRoundLock does |
| FREE-FLOW-DEFERRED-AFTER-REFUSED-ROUND-CLAIM | UX | a refused claim writes nothing, so a forced move held behind the round's in-flight claim (Z25), or a free-flow claim, waited for the next lock-freeing write → a refused claim drains the held moves (drainDeferredForcedMoves, the pipeline kept in _heldMovePipeline) |
| ROUND-LOCK-WAIT-MARKED-LATE | RACE | the round marked _waitingForLock after its busy claim's answer, missing a release landing in between → waitForLock() marks it, re-reads the lock through the host's moveLockFree (index.js isMoveLockFreeHere: the store free and no claim of this client's in flight) and goes round again when free |
| CAMPSTATE-CHAIN-PARTIAL | RACE | read-and-set writers off Z17's chain read the cache inside another write's round trip and put its fields back → on serialiseCampaignStateWrite: the lock's claim (one path, claimPendingMoveLock, free-flow too), release, put-back and ready reset; clearXCardRedirect; clearXCard; Set a Flag; Take a Break; Begin / End a Session; persistResolution; the world truths, !lore and Campaign Start (writeOwnedFields); the next-move claims and grant; the spotlight. The X-Card's pause jumps the chain (runCampaignStateWriteNow): written at once; chained writes not yet started wait ≤10 s for it |
| ART-INDEX-WRITE-OFF-CHAIN | RACE | registerArtAssetInStore and deleteEntityArtAssets' index writes read the cache off the chain → both on serialiseCampaignStateWrite; storing an asset the index already names writes nothing (decided on the store at the write's turn) |
| ROUND-WAIT-AFTER-REFUSED-CLAIM | RACE | a round waiting behind a free-flow claim on its way was never woken when that claim was refused (no write) → claimPendingMoveLock's refusal calls the driver's noteMoveLockFreed (resumes a waiting round when moveLockFree()), beside drainDeferredForcedMoves |
| CACHE-MUTATED-BEFORE-WRITE | LOSE-STATE | the rolling-summary persist (stored.sessionSummary = record) and handleDraftDismiss (campaignState.dismissedEntities = list) set their field on the cached campaignState before a refusable write, off the chain → both write a copy of the latest store on serialiseCampaignStateWrite; refreshRollingSessionSummary hands getRollingSessionSummary a copy |
| CAMPSTATE-CHAIN-REST | RACE | 27 more read-and-set campaignState writers were off Z17's chain (!at, !sector, !pace, !roll, !bond, Private Lines sync, custom oracles, sites, sector persist, entity registration, the migrator, setSharedProgress, the Entities panel, the recap cache …) → all on serialiseCampaignStateWrite; campaignStateChainSweep.test.js fails on any production campaignState write outside a chain call (or a helper only such a call reaches), unless allow-listed in OFF_CHAIN (empty) |
| ROUND-CHARACTER-BLOCK-GONE-PC | WRONG-DETAIL | narrateRound built each entry's CHARACTER block with getActiveCharacter, which falls back to the first PC for an actor id that no longer resolves → blocks only for entries whose actor is still a PC (the driver's entryCharacterPresent rule) |
| ROUND-DETECTION-NULL-MOVE | WRONG-DETAIL | runRoundNarrationPasses' lead fell back to captured[0], so a round with no rolled move sent "Move: null." / "Outcome: null." (or a refused move's id) → no rolled lead → the paced sentinel (PACED_NARRATIVE_MOVE_ID / OUTCOME: "no move was rolled", no Outcome line); refused-only rounds too |
| ROUND-VARIANT-TWO-CHALLENGES | RULES | Z39 converted a variant only with no challenge open; with another open, a variant whose own challenge ended earlier in the round stayed the variant and scored on the other challenge → noteReadTrack notes the variant's challenge (reading.variantChallengeId); rollEntry converts once it has ended (moveOutsideSceneChallenge(moveId, tracks, { trackId })) |
| PACED-VARIANT-ROLL-ENDED-CHALLENGE | RULES | readMove's and rollMove's variant rule looked only for any open challenge, so a paced Roll naming its ended challenge by id was rolled as the variant and its scoring found the challenge over → both pass the move's moveTargetId to moveOutsideSceneChallenge ({ trackId }) |
| UPGRADE-RETRY-REWIND-NO-SUPERSEDE | LOSE-PLOT | retryUpgradeStep ran applyUpgradeStep with no report, so a Retry's landed tension or vow clock rewind superseded no trigger vignette → it passes a report and supersedes what its rewind took out of full (vowClocksUntriggered, shared with revertPayThePrice); a clock step's record keeps the upgrade's kind and each vow copy's vowId |
| XCARD-RETRACTION-SCENE-SCOPED | SAFETY | an X-Card retraction blocked re-assertion only via its sceneTruths entry, which endScene clears; the takeover of a kept strike dropped its block; loreRetractionHolder stopped counting it → the scene's X-Card retractions are kept on an unnamed sessionRetractions.blocked (cap 50); a kept strike the X-Card takes over moves there; applySidecar reads it (findSessionStrike(…, { blocked: true })); CORRECTED, the summary's leave-out list and the lift never read it |
| XCARD-ENDED-SCENE-TRUTHS-UNBLOCKED | SAFETY | an X-Card on the newest narration whose scene had ended retracted no ledger truth (migrated; Y01 took back the copies), so nothing blocked their re-assertion → endScene keeps each live narration truth it closes on an unnamed sessionRetractions.narrated (by truth id, cap 50); retractNarrations moves the X-carded narration's into blocked |
| XCARD-DURING-SCENE-END-RACE | RACE | endScene wrote its copy's sessionRetractions whole after its awaits, losing an X-Card played meanwhile (a taken-over strike named again; X-carded truths kept live) → endScene's own chained write (persistEndedScene) adds the scene's strikes, X-Card retractions and narration truths onto the store's list at its turn, through the store's xCardedNarrationIds |
| XCARD-DURING-SCENE-END-MIGRATES | SAFETY | endScene migrated from its copy across awaits; an X-Card played meanwhile took back what had landed, then the copy's later writes filed the removed fact as a tier detail, confirmed lore and LAST KNOWN → each migration write checks isNarrationXCarded right before it writes (LAST KNOWN through the X-Card view) and takes back a copy written as the card landed (retractNarrationCapture by narration id) |
| STRIKE-DURING-SCENE-END-LOST | LOSE-STATE | a !truth strike or Replace landing during endScene's awaits was lost: the copy archived the struck fact as confirmed lore and kept it live → migrateSceneTruth re-reads the stored entry before its write (skip) and after it (takeBackCorrected); endedSceneRetractions overlays the store's retracted entries while the store holds the scene |
| FIGHT-PAYOFF-CARD-VOWID-FLAG-ONLY | WRONG-TARGET | postFightVowMilestoneCard and the fulfil payoff-failure card took vowId from the flag alone (null for a sheet vow whose stamp never landed), so after a rename 🤝 Deepen deepened twice and a Retry found no vow → both stamp vowCopyId(item) |
| EXPEDITION-STAMP-SITE-NAME | WRONG-TARGET | the Undertake's stamp ran selectSectorSite over the records' generated names, the finish over the location Actor's: a renamed site was linked to nothing, or (a type keyword in its new name) to another site, which the finish then charted → the stamp goes through selectExpeditionSite (Z14) |
| ARRIVAL-LOCATION-PHRASE-SPLIT | WRONG-DETAIL | the arrival docked the ship by inferShipPosition's word scan but set currentLocationId by resolveCurrentLocationName (whole label inside a name) → when the id and name lookups both miss, the current location is the place the position record just written names |
| ARRIVAL-FRAGMENT-SHIP-FREE-TEXT | WRONG-DETAIL | the arrival resolved its two stores separately — the current location by prefix ("Bleak" → Bleakhold), the ship as free text "Bleak" → it takes the current-location pick first (destination id, else the name) and docks the ship by its id, as !at does since Z15 |
| FACTION-PAGELESS-JOURNAL | LOSE-STATE | a refused page creation in createFaction left a page-less faction entry, unseen by adoption and the load listing, so the retry made a second journal → adoptUnlistedEntityJournal takes opts.page(entityId): an unlisted page-less entry of the type, matched by its name, gets the creator's page before registration |
| CREATURE-PAGELESS-JOURNAL | LOSE-STATE | createCreature had createFaction's shape → it passes its page to adoptUnlistedEntityJournal (the FACTION-PAGELESS-JOURNAL completion) |
| GENERATE-PORTRAIT-AFTER-REGEN | DUPLICATE | not reachable as filed: regeneratePortrait wrote regenerationUsed and locked together, and generatePortrait refuses a locked portrait first → pinned by portraitRegenerationCap.test.js; the guard the entry proposed (generatePortrait returns the unlocked portrait the record names) came with REGEN-LINK-REFUSED-SECOND-REGEN's claim, which makes it reachable |
| REGEN-LINK-REFUSED-SECOND-REGEN | DUPLICATE | regeneratePortrait marked nothing until its new portrait was linked, and linkPortraitToEntity swallowed a refused write, so the record stayed on an unmarked portrait (Regenerate offered and billed again); a second GM's press meanwhile bought a second image → linkPortraitToEntity reports whether it landed; the regeneration is claimed (regenerationUsed) before the image is bought, given back only when the image could not be made; a refused store or link keeps the earlier portrait, locked, and tells the GM |
| PORTRAIT-LATE-FIRST-GENERATION | DUPLICATE | generatePortrait checked its caller's copy of the record before the image call and linked its image unchecked → a per-entity, per-client in-flight slot (claimed before the call, released in a finally) makes a second generation wait for the first; a portrait the record linked meanwhile stands and the late image is not stored |
| FIRST-PORTRAIT-LINK-REFUSED | DUPLICATE | generatePortrait attached its image to the Actor whatever the record write did and reported it generated; the next Generate / seed / Finalise bought another → the Actor gets the portrait only once the link lands; a refused link tells the GM, and the next first generation links the newest stored, unsuperseded portrait for the entity (storage.findEntityPortrait) instead of buying one |
| FOUNDRY-REF-SETTING-HOOKS | DOC-DRIFT | foundry-api-reference.md had no section on the createSetting / updateSetting hooks the setting watchers rely on → a Settings subsection (a world setting is a Setting document; first write create, later update, on every client; which watchers listen to both; what is not verified), read from the v13 type declarations (foundryvtt.com does not resolve from the build container) |

Found while fixing those and left open (each with a proposed fix):

- PROMOTE-SUBJECTS-CACHED-MUTATE and MIGRATE-STALE-WRITE (both below) are on
  the write chain now (CAMPSTATE-CHAIN-REST) but still edit the cached object
  in place / write the migration's whole snapshot; their proposed fixes stand.

### Tenth bug audit (issue #335, part 1 of 4) — all fourteen fixed in the v1.7.36 cycle

Found by the tenth bug audit (2026-11-05) of `8fb7bfa`, with a probe per
finding (`tests/probes/` on branch `claude/compassionate-knuth-vrg7se`; the
report is `docs/testing/bug-audit-10-2026-11-05.md` there): the three X-Card
safety findings (Y01–Y03 — Y01 the audit's one high-severity row) and the
eleven medium ones (Y04–Y14). The maintainer asked for issues #335–#338 to be
addressed on 2026-11-05. Each fix carries its own regression tests,
converted from the probes, which fail with the fix taken out
(`docs/testing/fix-sensitivity.md`); every probe file of the four issues is
converted (the probe branch keeps the originals). Run against the
integrated branch, the original probes pass 166 of their 184 tests; the 18
others assert what a decision changed (D6's untouched connection, D4's
hand-made ship, D3's retired `unpreparedAtZeroSupply`, Y27's wording ×2,
Y11's roller-less card), read a record after the X-Card removed it (Y02 ×2,
Y03), model a step the fix changed (Y05's write hold, Y06's last card, Y16's
error log, Y34's load passes, Y39's hook arguments, Y40's remedy, D8's card
without a clock id, Y44's deleted write) or lack a harness method (D6's
`game.messages.get`); each converted test asserts the decided behaviour.
None has been checked in a live Foundry world yet. The ones to try: `!scene end` (or End a Session), then
the X-Card on the narration still on screen, and the NPC's card, ESTABLISHED
LORE and LAST KNOWN (Y01); the X-Card on a narration that named a new faction
(Y02) and on a published Private Channel reflection (Y03); Begin a Session
with an advancing campaign clock and the galley vignette on (Y05); a
player's End a Session while the world refuses the write (Y06 — the fault
matrix's refused write); a second GM loading the world while a move is
narrated (Y07); a paced card's Roll pressed during another player's move
(Y08); burn a Battle miss to a weak hit whose price harmed a character at 1
health (Y09); a GM pressing 🚪 Find another way on a crewmate's threshold
card (Y11); ↻ Regenerate flavour on an NPC with a ⤴ promoted detail, and ✦
Finalise on an unseeded NPC card with Notes typed in (Y12); correct an NPC's
pronouns on the sheet, then read the narrator's card (Y13); drag the ship
token onto a charted derelict's pin, and `!at` that derelict (Y14). Choices
for the maintainer to confirm: Y14's sync also follows a record naming a site
not yet charted (the charting Finish an Expedition records its arrival before
its reveal), and a drop on a site pin is still not a Set a Course; Y05's 10 s
/ 60 s bounds; Y07's live-lock case is the two-GM path the harness models
with leave / join; Y12's first Regenerate on a card seeded before this
version keeps the old (unmarked) introduction below the new one.

| Code | Class | Defect → fix |
|---|---|---|
| Y01 XCARD-AFTER-SCENE-END-KEEPS-MIGRATED-FACTS | SAFETY | an X-Card after !scene end / End a Session left the migrated tier detail, archived Lore page and LAST KNOWN (all unstamped) on every later prompt → the migration carries the truth's narrationId and LAST KNOWN keeps narrationId + the values it superseded; retractNarrationCapture undoes all three |
| Y02 XCARD-FACTION-SURFACE-UNSTAMPED | SAFETY | routeEntityDrafts got no narrationId, so the faction auto-surface page (and a placeholder rename) survived the X-Card and FACTION LANDSCAPE handed the faction back → both detection passes pass the id; the surface page is stamped (deleted by the X-Card) and a rename carries renamedBy (reverted unless renamed since) |
| Y03 XCARD-REFLECTION-CAPTURE-UNSTAMPED | SAFETY | a published reflection's card and its tier pass carried no narrationId, so its detail survived the X-Card on it → publishToMainChat stamps newNarrationId() and the hook hands it to the capture |
| Y04 NARRATION-CACHED-STORE-SIBLINGS | LOSE-STATE | galley/closing vignettes, !incite / Session panel / Campaign Start phase 5 and the native progress-roll hook handed the narrator the cached campaignState; a refused write left the GM alone holding the minted scene and sidecar facts → each narrates on a deepClone working copy (X09 shape) |
| Y05 CONCURRENT-SCENE-MINT | LOSE-PLOT (RACE) | two narrations one command fires (Begin's clock+galley vignettes, !ptp's trigger vignette+follow-up) each minted a scene inside the first start's round trip; the loser's facts dropped → startScene serialised per client (bounded wait, then adopt); galley after clock vignettes, follow-up after trigger vignette (bounded) |
| Y06 RELAYED-SESSION-WRITE-REFUSED-SILENT | GM-GATE / UX (LOSE-STATE) | a player's End a Session / Set a Flag / Take a Break posted its card before the canonical GM's write, which the world refused with only a console line on the GM → on a relayed request the refused write posts the GM's note where the card is (X13's shape; a private flag's note whispered, without its text) and still throws |
| Y07 READY-RESET-RELEASES-LIVE-LOCK | RACE / LOSE-STATE | a second GM's world load reset a connected GM's live move lock as stale → the ready reset clears only a lock no other connected user holds (W25's rule), only while the store still holds that claim, and writes nothing when the load changed nothing |
| Y08 PACED-ROLL-DROPPED-AT-LOCK | LOSE-STATE (UX) | The paced Roll and the "Which fight?" pick stamped their card and posted without deferWhileBusy, so a press during another move (or before a session) was dropped → both posts carry deferWhileBusy: held by the lock and the session gate, rolled when they can be |
| Y09 PRICE-STANDS-RETIRES-OWED-ROLL | RULES | A burn to a weak hit that keeps the Pay the Price retired the price's resist card and redirect picker with the superseded outcome's cards → price cards are stamped priceCard and kept as the upgraded outcome's; the move card says their roll or choice is still owed |
| Y10 VOW-RECOMMIT-ON-FULFILLED-VOW | WRONG-DETAIL (LOSE-STATE) | an armed vow recommit pressed after the vow was fulfilled lowered its track and raised its rank on every copy → refused as vow-completed with a short card, the offer closed; completed copies are never written |
| Y11 WAY-OUT-BATTLE-AS-FIRST-PC | ATTRIBUTION (WRONG-TARGET) | a GM's way-out pick or Battle on a crewmate's threshold rolled the first PC → the threshold's roller rides onto both cards; the roller's player or a GM presses, as that roller |
| Y12 REGENERATE-ERASES-PROMOTED-CANON | LOSE-STATE | ↻ Regenerate rewrote an NPC's/ship's Notes tab whole (portrait alone kept), erasing a ⤴ promoted canon detail from the tab, panel and narrator card → seeds replace only their own marked introduction, the rest kept (D4 A) |
| Y13 NPC-PRONOUNS-SHEET-EDIT-IGNORED | WRONG-DETAIL (mirror drift) | every NPC surface read the record's pronouns, which a sheet correction never reached; Finalise wrote the record's/rolled set over the sheet's → the sheet's Pronouns field is the card's pronouns (getter overlay, panel reads through it, seed prefers it, portrait prompt lead follows it) |
| Y14 SITE-PINS-NOT-POSITION-ANCHORS | WRONG-DETAIL | A charted site's pin anchored neither way: a token on it recorded "deep space", and an arrival there (nearestLocationId) never moved the token — the sync and the X-Card restore read settlements only → a charted site pin records nearestLocationId ("near"); the sync and the restore follow nearestLocationId to its pin; an undiscovered pin names no place |

### Tenth bug audit (issue #336, part 2 of 4) — all nineteen fixed in the v1.7.36 cycle

Found by the same audit (the report and probes as above): the low findings
Y15–Y33 — moves, pipeline, upgrades and rules; cards and payoffs; narration,
fact continuity and the World Journal. None has been checked in a live
Foundry world yet. The ones to try: Combat Bot on a Clash (Y15); a pressed
🏁 before Begin a Session, from the player's client (Y17); the 🛡 resist card
on a weak hit that still offers a burn (Y18); a rider's supply cost while the
crew is unprepared (Y19); a reward pick on a vow deleted from the sheet
(Y27); `!recap session` after an NPC-voiced narration with audio on (Y29);
Replace… in Correct Active Scene Facts while a player plays the X-Card (Y30);
a faction named "the Iron Syndicate" and "Iron Syndicate" (Y31). Choices for
the maintainer to confirm: Y10 stamps no `resolutionId` on a recommit offer
(its move is a progress roll — nothing can burn or improve it); Y16's GMs'
card reads "Move not fully saved"; Y20's GM press retires a gone-PC card;
Y23 skips an NPC card's sheet roll entirely (not narrated); Y33's remedy
names ✦ Envision again (which rolls a new incident).

| Code | Class | Defect → fix |
|---|---|---|
| Y15 COMBAT-BOT-CLASH-ADD | RULES / WRONG-DETAIL | One ";"-joined sentence's add was read for both moves it names: Combat Bot's Strike +1 offered pre-checked on Clash → extractAdds splits a sentence into clauses at ";" and before a mid-sentence "if you <Move>"; an add belongs to the clause whose link names the move, a clause naming none continuing the one before |
| Y16 REFUSED-METER-WRITE-LOSES-RECORD | LOSE-STATE | A refused meter write threw before the move's record — the arrival / legacy mark / site lost under "check your API key" → the meter writes are caught, the record still written, the refused meters a Retry step on the GMs' persist card; the notice names the cause |
| Y17 SESSION-GATE-HELD-PRESSER-UNTOLD | UX | a relayed, claimed button's forced move held by the session gate whispered only its author (the GM) → the notice also whispers the speaking PC's players, and the held move's line says "Held — no session has begun" until the drain hands it back |
| Y18 RESIST-CARD-CLOSES-BURN-UNHINTED | UX | The resist card — the roller's next move, which closes the move's burn — carried no D2 hint → the card and the executor's line carry it while the move still offers an upgrade (upgradeOpenFor; the pipeline's upgradeOffered before the move card posts) |
| Y19 RIDER-SUPPLY-LOSS-WHILE-UNPREPARED | RULES | An asset rider's "-1 supply" while unprepared wrote 0 → 0 and was summarised as applied → not written: the W16 picker, bound to the move, and the rider reported not applied with a line; a Retry that finds the PC unprepared posts the picker and settles the step |
| Y20 SUFFER-PICK-GONE-PC-FIRST-PC | ATTRIBUTION | A pick on a suffer card whose PC was deleted applied, unchecked, to the world's first PC → a player is refused (no-actor); a GM's press applies nothing and the card says its character is gone; the first-PC fallback is gone |
| Y21 SUFFER-MISS-TABLE-SEEDED-UNROLLED | RULES / WRONG-DETAIL | Every Endure Harm / Stress / Withstand Damage miss seeded the narration with a mortal-wound / desolation / vehicle-damage roll whatever the meter held → no seed; the at-0 choice card's roll is the one, its card carrying it (oracleMemory) into RECENT ORACLE RESULTS |
| Y22 NON-NUMERIC-ABILITY-ADDS-LOST | RULES / WRONG-DETAIL | "add +heart" / "add +its health" read as no add — surfaced unchecked, the bonus lost → the scan resolves "+<stat>" from the roller's snapshot and "+its health" from the companion asset's track, offering the number (labelled) on the confirm dialog; a value from a general clause counts only when the ability names the move nowhere; "+cargo" / "that amount" stay text |
| Y23 NATIVE-PAYOFF-NPC-CARD-SPEAKER | WRONG-TARGET (ATTRIBUTION) | a vow rolled on an NPC card's sheet paid the crew's sole open vow, offered a recommit for the NPC and was narrated as the GM's first PC → both native-roll hooks act only on a player character's roll |
| Y24 CLAIM-AFTER-EFFECT-REFUSED-STAMP | DUPLICATE (RACE) | a refused stamp after the effect left the connection and milestone pickers and the won-fight ⚑ live for a second effect → the pickers claim first (released on a failed effect); the won-fight mark is recorded per card on the vow's payoff ledger |
| Y25 VOW-RECOMMIT-SOLE-OPEN-FALLBACK | WRONG-TARGET | a recommit rewrote the sole open journal vow, or from a journal vow's miss the crew's one open Item vow → Item by id or the roller's exact name only (ownOnly), twin by id or byNameOnly; a journal-only vow recommits from its own ticks |
| Y26 RECOMMIT-EPIC-RANK-TEXT | WRONG-DETAIL (cosmetic) | the Recommitted card said an epic rank "rises to epic" → says it stays epic |
| Y27 REWARD-PICK-VOW-GONE-NOTICE | UX | a reward pick or Link for a vow nobody holds said "choose / link it again" → the writers report refused vs no-copy; a vow nobody holds closes the card and says why |
| Y28 CARD-NAME-UNESCAPED | WRONG-DETAIL (HTML sink) | The !at card, the !sector list / switch cards and the Companion Takes a Hit / Withstand Damage bodies printed a document's name raw → escaped (escapeChatHtml / the executor's escapeHtml) |
| Y29 SESSION-RECAP-NPC-MARKUP | WRONG-DETAIL | !recap session quoted narrationText with escaped <npc> markup → stripMarkup before the sentence split |
| Y30 REPLACE-AFTER-XCARD-REFILES-REMOVED-FACT | SAFETY (RACE) | a Replace saved after the X-Card relabelled its retraction 'gm' and filed the removed fact live; the merge preferred the correctedTo copy → strike/replace refuse an already-retracted entry ("already retracted"); the merge keeps an X-carded store truth and drops a stale correction's replacement |
| Y31 FACTION-PAGE-IDENTITY-BY-EXACT-NAME | WRONG-DETAIL (DUPLICATE) | "The Iron Syndicate" vs the "Iron Syndicate" record made a second page and missed the canonical stance → one faction identity key (case, spacing, leading article) for the record, the Factions page, the entity gates and the landscape dedup |
| Y32 LIFT-RESTORES-LORE-ANOTHER-STRIKE-STILL-RETRACTS | WRONG-DETAIL (LOSE-PLOT) | a lift restored a lore entry another standing strike still stated (the entry remembered one strike) → restoreStruckLore consults loreRetractionHolder (other strikes — entry handed on — X-Card retractions, earlier scenes' strikes) |
| Y33 INCITING-PREMISE-REFUSED-SILENT | UX | a refused premise write was a console line only → a whispered "Premise not saved" card to the asker and the GMs naming the remedy |

### Tenth bug audit (issue #337, part 3 of 4) — all sixteen fixed in the v1.7.36 cycle

Found by the same audit: the low findings Y34–Y49 — entities; sessions and
clocks; sectors, oracles and truths; multiplayer, audio and logs; panels,
help and developer docs. None has been checked in a live Foundry world yet.
The ones to try: a refused draft Confirm, then Confirm again (Y34); the
inciting ⚔ pressed before Begin, then again after (Y36); + twice quickly on a
clock one segment from full (Y37); edit the saved Setting Truths page, then
an `@scene` (Y39); a player's Private Channel with no GM connected (Y41); type
a track or clock name while a player's move updates the panel, and edit a
Chronicle entry while a narration posts (Y45). Choices for the maintainer to
confirm: Y40 tells the GM to reload (confirmed since: v13 fires no
client setting's onChange for an unchanged value — the Foundry reference); Y42 accepts the world's exact audio slot and,
on The Forge, any Assets Library URL ending in the clip's file (the origin
is shared — see AUDIO-FORGE-ORIGIN-SHARED below); Y45's add forms keep their
selects after Add.

| Code | Class | Defect → fix |
|---|---|---|
| Y34 REFUSED-REGISTRATION-ORPHAN | LOSE-STATE / DUPLICATE | a refused id-list registration left an unlisted Actor: a retried Confirm made a second card, a sidebar ship's refusal was a console warn and no load pass listed it, a refused art index left the portrait unlinked (billed again) → creators adopt the unlisted Actor of their type/name/sector, the GM is told, the canonical GM's load lists flagged unlisted Actors, a refused art index leaves the portrait linked |
| Y35 PROMOTE-RACE-DROPS-CAPTURE | RACE | the sheet-notes Promote wrote the record built before its Notes await, dropping a tier detail the capture appended meanwhile → re-read the record after the Notes write |
| Y36 INCITING-SWEAR-DISABLED-AFTER-GATE | UX / LOSE-STATE | the inciting ⚔ pressed before Begin was dropped by the gate ("press the button again") while the press disabled its button for good → the gate's notice names the dropped post and the presser's client re-arms its button |
| Y37 CLOCK-FULL-CHECK-OUTSIDE-QUEUE | DUPLICATE | Two presses on a clock one segment from full each read it as not full before the W53 queue: two TRIGGERED cards and vignettes → the full check runs inside the queued write (mutateClock reports before/after; a full clock is not written); the second press posts "already triggered" |
| Y38 LORE-REPAIR-CACHED-MUTATION | LOSE-STATE | !lore set the repaired worldTruthsJournalId on the cached setting before the refusable write → set after writeTruthsLink resolves |
| Y39 TRUTHS-PAGE-EDIT-NOT-REPARSED | LOSE-STATE (mirror drift) | Only the truths page's creation was read; an edit left worldTruths on the pre-edit text until the next load while !lore read the page live → an updateJournalEntryPage hook (canonical GM) re-records a text edit of the linked journal's page (recordSystemTruths); the Quickstart's own journal is not re-read (its flag is the store) |
| Y40 ADVERTISE-REFUSED-SILENT | UX / GM-GATE | the claudeApiKey onChange swallowed a refused keyed-GM registry write (.catch(() => {})) → warned as the ready path is, and the GM is told to reload to register it |
| Y41 PRIVATE-TRANSCRIPT-NO-GM-SILENT | LOSE-PLOT / UX | a flush with no journal (no GM to create it, or none answering) kept the turns in memory with only a console line → the player is told once, the window says so while it lasts, and "saved now" when a write lands |
| Y42 AUDIO-DONE-PATH-UNBOUNDED | SECURITY | A keyless player played any audio.synth.done / audio.cache.found path ending in /<hash>.mp3, so a forger's URL replaced the narration → only a path the GM's cache could name is played (cache.isCachePathFor: the world's own slot, or a Forge Assets URL); anything else is no answer and the waiter waits on |
| Y43 PTP-PCLESS-REFUSED-SILENT | UX / GM-GATE | a PC-less player's !ptp route was refused on the GM with a console line only, under a card naming the route → refused on the typist's client before the card: the footer says "not applied" and the player and the GMs are whispered why |
| Y44 THRESHOLD-TRACK-ID-DEAD | PRODUCED-BUT-DEAD | Enter the Fray wrote thresholdTrackId on the threshold card and nothing read it → the write is deleted (X50 precedent) |
| Y45 PANEL-RERENDER-WIPES-INPUT | UX | A hook re-render of the Progress Tracks / Clocks panels wiped a half-typed add form, and the Chronicle lost an in-place edit (no blur fires on removal) → replaceKeepingInput carries the form values, the focused entry's changed text, and focus |
| Y46 README-COMMANDS-DRIFT | DOC-DRIFT | README lacked eleven routed commands and sub-commands, the clock rows' (GM), and !bond's syntax → rows added; a test compares README with the routes and gates |
| Y47 HELP-FIRST-SESSION-ABOUT-GM-ONLY | DOC-DRIFT | The First Session walkthrough called Companion Settings → About "GM only" → every player enters their own keys there and the OpenRouter key is the GM's; helpRoleClaims checks every page |
| Y48 FACTION-FLOW-PANEL-EDIT-CLAIM | DOC-DRIFT | faction-flow.md said the Entities panel edits a faction's stance → it names !journal faction as the manual stance correction |
| Y49 PLAYKIT-PUNCH-LIST-STALE | DOC-DRIFT | The play-kit coverage doc listed as open what the tree had fixed (3.1.1–3.1.3, 3.2, 3.3.1/4/6, 3.4, 3.5), restated in Part 2 → each marked "— FIXED (where)" (3.1.3 as the vendor's rule), 2.2 / 2.4 / 3.5 rows updated, 3.6 recap and maintenance footer bumped; a unit test reads the doc |

### Tenth bug audit (issue #338, part 4 of 4) — the ten decisions built in the v1.7.36 cycle

The ten rows that needed the maintainer (D1–D10), each with a probe that
asserted the recommended option. The maintainer took the recommended option
on every row on 2026-11-05 (decisions.md, "Issue #338 decisions"); D6's and
D9's probes were rewritten to the option taken. Each change carries its own
regression tests, which fail with the change taken out. None has been
checked in a live Foundry world yet. The ones to try: a crewmate pressing
another player's ⚔ Attempt to Finish the Fight (D1 — refused; each button
works once per card); a Face Danger and a Secure an Advantage while a scene
challenge is open (D2); a Sacrifice Resources at supply 1 while unprepared,
and a crewmate's Resupply (D3); ✦ Finalise on a hand-made ship with Notes
(D4); `!oracle fleet` in an Expanse sector (D5); the X-Card on a Make a
Connection narration, before and after the table uses the connection (D6);
burn a miss whose Pay the Price triggered a clock (D8); push-to-talk with a
half-typed line (D9).

| ID | Decision | What changed |
|---|---|---|
| D1 UNRELAYED-FOLLOWUP-NONOWNER | A | a crewmate could press ⚔ Finish the Fight / 🗺 Finish the Expedition / ⚔ Swear it on another player's card and roll that player's move, once per client → relayed (tda.attempt, expedition.finish, vow.swearRoll): the roller's player or a GM, claimed once, posted as the roller |
| D2 SCENE-CHALLENGE-VARIANT-MOVES | A | Within a scene challenge the ordinary Face Danger / Secure an Advantage marked no progress and filled a segment only via Pay the Price, never two → two interpreter-typable moves scored against the open challenge (applyOutcomeEffects → scoreSceneChallenge), the price's advance skipping that clock, upgrades from the clock receipt; Begin the Scene named as missing (the panel's Add) |
| D3 SACRIFICE-WHILE-UNPREPARED-ABOVE-ZERO | A + the crew-wide clear | A PC unprepared above 0 supply paid a loss of resources from the supply (redirect and greyed option keyed on 0) → keyed on the impact (sufferExecutor.isUnprepared): picker at any supply, Sacrifice Resources greyed; unpreparedAtZeroSupply retired; Resupply's clear is the crew's (clearUnprepared — fixes UNPREPARED-CLEAR-ONE-PC) |
| D4 SEED-REWRITES-HAND-NOTES | A | Finalise on an unseeded NPC card replaced the GM's Notes/Characteristics; a hand-made ship with Notes was only stamped, leaving Regenerate (which replaced them) the only way to its identity → marked `sf-seed-intro` introduction, the rest kept, prepended on an unmarked tab; Characteristics keep non-seed lines; X34 narrowed to a ship with a rolled identity |
| D5 MISSION-REF-REGION-BLIND | A | Fleet's "Starship Mission" and Starship Type's "Multipurpose" refs named the Terminus mission table in every region → !oracle passes the active sector's region and a regional ref rolls that region's table (Terminus with none) |
| D6(i) XCARD-DRAFT-ROWS | A | an X-carded narration's draft rows stayed pending (Confirm minted the NPC from the removed beat; the name blocked re-detection) → the card carries its narrationId and the X-Card marks its pending rows xCarded (re-rendered, not dismissed) |
| D6(ii) XCARD-AUTO-CREATED-CONNECTION | A, narrowed | an auto-created connection outlived the X-Card on its Make a Connection narration (roster, ENTITIES IN SCENE, live bond) → stamped createdFromNarrationId; the X-Card deletes it with its bond Items while unused, else whispers the GMs once naming it |
| D7 XCARD-PROMOTED-DETAIL-STAYS-IN-NOTES | A | the X-Card dropped a promoted tier entry but its copy on the Notes tab stayed → the entry keeps { narrationId, promotedText } and the X-Card strips that paragraph (Notes tab, else the record's notes) |
| D8 BURN-REWINDS-FIRED-CLOCK-KEEPS-ITS-VIGNETTE | A | A burn/improve that rewound a fired clock left its trigger vignette live with binding truths, and the superseded narration's ledger entries stood → trigger vignettes carry clockId; the reversal strikes the clock's newest trigger vignette (burnSuperseded) and both narrations' entries are retracted by narrationId (retractedBy "superseded") |
| D9 PTT-OVERWRITES-DRAFT | B | Push-to-talk into a chat box holding a draft adds the transcript after it and does not submit; an empty box still auto-submits |
| D10 AUDIO-CACHE-PREFILL-KEYED-GM | A | A canonical GM with an ElevenLabs key files no relayed clip (it makes its own); the relay still serves a keyed player at a keyless GM's table |

Found while fixing — fixed in the same cycle:

- ~~**XCARD-CONNECTION-SHEET-USE**~~ (SAFETY) — fixed (`0900b88`). D6(ii)'s
  delete path judged a connection "used" by its record alone, so a GM's
  paragraph on the NPC card's Notes tab (the card's notes since X12) or a
  line in its Characteristics was deleted with the card → with D4's marked
  introduction, Notes text outside the seed's block and the portrait, or a
  Characteristics line the seed did not write, counts as a use
  (`sheetWrittenByTable`).
- ~~**ORACLE-FOLLOWUP-WAIT-IMPORT**~~ (test, timing) — fixed (`2bfc9d3`). Y05's
  wait for a trigger vignette was reached through a dynamic `import()`, a
  module load no promise queue sees, so on the integrated branch two
  `oracleFollowup.test.js` cases saw the narration late → imported
  statically.
- ~~**UNPREPARED-CLEAR-ONE-PC**~~ (WRONG-DETAIL, from the issue #315 cycle) —
  fixed (issue #338 D3, the maintainer's call on the rule): Resupply's "clear
  unprepared" cleared the roller alone, so an ally stayed unprepared above 0
  → `clearUnprepared` clears the roller and every ally sharing the supply
  (`supplyAllies`), and a card names them.

Found while fixing — fixed in the same cycle. The maintainer asked for the
open items to be fixed (2026-11-05); each fix carries regression tests that
fail with it taken out (`docs/testing/fix-sensitivity.md`), and four more
found while fixing them are fixed too (HOVERBIKE-WEAK-AS-MISS-UNAPPLIED,
SCENE-VARIANT-ABILITIES-UNKEYED, PACED-VARIANT-NO-TARGET,
FACTION-SECTOR-GEN-CLAIM). None has been
checked in a live Foundry world. The ones to try: play the X-Card just after
a narration that names a new NPC and a faction (XCARD-LATE-CAPTURE); two GMs,
the second joining while a move is narrated, then the next move
(LOCK-RESURRECTED-BY-COGM-STALE-WRITE); a crewmate pressing another
player's paced Roll (PACED-ROLL-OPEN-PRESS, RELAY-REFUSED-PRESS-UNTOLD); the
Hoverbike's afterburner on a Face Danger (HOVERBIKE-WEAK-AS-MISS-UNAPPLIED);
a narration's Roll during a scene challenge (PACING-ROLL-NO-SCENE-CHALLENGE).

| Code | Class | Defect → fix |
|---|---|---|
| XCARD-AFTER-STRIKE-STILL-NAMED | SAFETY | a GM strike of an X-carded narration's truth kept retractedBy "gm" (named under CORRECTED and in the leave-out list, liftable by !truth set) → the X-Card relabels the bare strike "xcard" and drops its sessionRetractions entry (kept with narrationId); !truth set restores struck lore only after a persisted lift |
| MAKE-CONNECTION-PENDING-CONFIRM-UNSTAMPED | SAFETY | a Make a Connection confirming an earlier pending draft was unstamped, so the X-Card kept the NPC and the row stayed confirmed → stamped with the narration and the row; the X-Card deletes it while unused, reopens the row, and returns promoted ledger facts to the name |
| XCARD-CONNECTION-PORTRAIT-ORPHAN | LOSE-STATE | D6(ii)'s delete left the portrait's Art: entry and artAssetIds entry → deleted with the card (canonical GM, index written on a copy, refusal logged) |
| XCARD-LATE-CAPTURE | SAFETY | a capture still running when the X-Card was played wrote lore, beats, a faction page, a stamped draft card, a connection and tier details after the undo had run → every capture write checks the stored xCardedNarrationIds first (isNarrationXCarded); passes check on entry (no Claude call); a portrait of a vanished entity is not stored |
| SHIP-POSITION-FLAG-MERGE | LOSE-STATE | setFlag merges, so a sidecar move's narrationId/previous survived later !at/course/expedition/token moves and an X-Card reverted the GM's move → every position record writes narrationId/previous (null unless a narration set them) |
| LOCK-RESURRECTED-BY-COGM-STALE-WRITE | RACE | A co-GM's ledger persist, built before the old GM's release reached her, landed after it and carried the lock back → the lock fields are the lock's own paths' (the !roll spend and !migrate-entities take them from the store); the claimant remembers released claims and puts the lock back — free, or its later move's claim |
| PTP-PCLESS-NARRATED-AS-FIRST-PC | WRONG-DETAIL | A PC-less player's refused !ptp was narrated with no speaker (the first PC) and remembered as established → a price nobody pays carries no oracleNarration/oracleMemory and asks for no follow-up |
| TRIGGER-VIGNETTE-LATE-POST | RACE | A trigger vignette posted after its Claude call landed live for a clock rewound meanwhile; the burn found no card, or struck an earlier trigger's → narrated only while the clock is still full when its reply comes in (stillTriggered, all three sites, before the sidecar applies); the burn strikes nothing for a clock whose vignette is in flight |
| ERROR-TEXT-BLAMES-KEY (remainder) | LOSE-STATE | A refused suffer-choice card post inside persistResolution was swallowed — cost unpaid, nobody told → a choiceCard step: record still written, the GM told by cause, the GMs' Retry posts it (refused once the move is upgraded) |
| END-ON-ENDED-SESSION-WORDING | UX | The GM's own End on an ended session with the focus correction refused read "+1 momentum … could not be ended" → "already ended, so nothing was ended; the focus was not recorded"; a failed End promises no momentum |
| PACED-ROLL-OPEN-PRESS | ATTRIBUTION | paced Roll / "Which fight?" pick posted from the presser's client with no ownership check and a local disable only → relayed paced.roll / whichFight.pick on applyCardRollerFollowup: claimed once on the GM, owner or GM only, posted as the roller with deferWhileBusy, pick checked against f.fights (closes WHICH-FIGHT-LOCAL-DISABLE) |
| PACED-SUGGESTION-FLAG-DEAD | PRODUCED-BUT-DEAD | the paced Roll wrote fromPacedSuggestion, read nowhere → write and fixture copies deleted |
| RELAY-REFUSED-PRESS-UNTOLD | UX | a press refused as not-owner / no-actor / not-a-pc was logged on the GM's console only → handlers call gmRelay.refusePress; runGmAction whispers the presser + GMs whose button it is, once |
| SWEAR-ROLL-VOW-GONE | WRONG-DETAIL | ⚔ Swear it rolled (momentum, oath scene) for a deleted vow → refused when no PC holds the vow or the card is vowGone; card closed, presser + GMs told |
| VOW-ID-NEVER-LANDED | UX | the reward/link writers and vowRewardStatuses matched the vowId flag only → actorBridge.isVowCopy also matches item.id === vowId |
| SHIP-SEED-MISSION-REGION | RULES | seedStarshipActor / rollFreshShipSeed rolled starship_type with no region — a Multipurpose / Fleet→Starship Mission type got a Terminus mission beside a regional one → both pass { region } (ship.resolveActiveRegion; D5's rule) |
| JOURNAL-ORPHAN-ON-REFUSAL | DUPLICATE | createFaction / createCreature made their journal before a refused registration, and a retried Confirm made a second → registry.adoptUnlistedEntityJournal (a faction by factionNameKey) in both creators; registerUnlistedEntityActors lists faction / creature journals at load |
| BOND-ITEM-AFTER-RELIST | LOSE-STATE | the load-time pass (Y34) listed a refused Confirm's card, so the next Confirm took U25's exists path and made no bond Item → that path calls the idempotent registerConnectionOnActiveCharacter on the Confirm's PC |
| NOTES-CARD-ENTITY-UNDECODED | WRONG-DETAIL | notesAsCardText decoded six entities, so the seeds' &middot; fact line reached ENTITIES IN SCENE and the panel raw → one-pass decode of the named entities seeds and the editor write, plus numeric ones |
| LORE-READS-QUICKSTART-PRINTOUT | WRONG-DETAIL | !lore read the Quickstart journal's printout live, so an edit reached the recap but not the narrator's truths (Y39) → it reads the journal's worldTruths flag, printed in full; dialog saves still read from their page |
| REPAIR-TRADE-WHILE-UNPREPARED | RULES | Repair's trade paid from the supply while the PC was unprepared above 0 → greyed on the dialog, refused on Apply and by the GM (isUnprepared); nothing repaired, "Repair again without the trade" |
| PACING-ROLL-NO-SCENE-CHALLENGE | RULES | classifier knew no open challenge, its catalog lacked D2's variants, and the hint replaced a variant → told the open challenges, both variants listed, a variant with none open is the ordinary move, a hint naming the twin keeps the variant |
| FINISH-SCENE-CLOCKID-DEAD | PRODUCED-BUT-DEAD | read tensionClockId off a list that drops it, so its retire never ran → removed; completeProgressTrack's retire is the one |
| SCENE-CHALLENGE-MOVE-NAME | UX | cards, narrator tag, paced Roll and recap title-cased the id → one display name (i18n.moveDisplayName) |
| VALUE-ADD-INTEGRITY | RULES | Hoverbike's "add +integrity" stayed text → read from the asset's Integrity track; only that ability's offers change |
| HOVERBIKE-WEAK-AS-MISS-UNAPPLIED | RULES | VALUE-ADD-INTEGRITY offered the Hoverbike's +integrity pre-checked with its "count a weak hit as a miss" unapplied — a free add (found while fixing it) → the add is marked `weakHitAsMiss`, the dialog shows the cost, `resolveMove` turns a weak hit into a miss when it is taken, and a burn that would land on a weak hit is no improvement |
| SCENE-VARIANT-ABILITIES-UNKEYED | RULES | since D2, an ability linked to Face Danger / Secure an Advantage did not match the scene-challenge variants, so they lost their asset adds and stat swaps (found while fixing VALUE-ADD-INTEGRITY) → `sceneChallenge.assetMatchMove` maps a variant to its twin at every matcher (structured matches, adds, stat substitutions, the Haiku pass, the rider prompt); the sweep's variant rows equal their twins' |
| PACED-VARIANT-NO-TARGET | UX | with two challenges open a paced Roll's variant named none, so its card asked "which scene challenge?" (found while fixing PACING-ROLL-NO-SCENE-CHALLENGE) → the classifier names the challenge, the card keeps its id, the Roll relay forwards it as the move's target |
| W16-CHOOSE-BELOW | UX | said "(choose below)" while its picker posts first, above it → "(choose it on its card)", order kept |
| READDEBILITIES-CUSTOM-COMMENT | DOC-DRIFT | comment denied the vendor's custom1/custom2 impacts; the fallback ignored them → corrected; they count |
| TRACK-ADD-REFUSED-LOSES-NAME | UX | the panel cleared the typed name before its add; an add the world refused or no GM took lost it → still cleared at the press (a second press adds nothing twice); name, type and rank restored on the live form when the add was not made, unless a new name was typed meanwhile |
| DEFECT-PATCHES-STALE | tooling | three #306 R04 defect patches no longer applied to src/index.js → regenerated for the same defects (xp-before-write as the mark paid before its write, since W52); the full run then found the two TDA-BUTTON-NO-TARGET which-fight patches stale after PACED-ROLL-OPEN-PRESS relayed the pick (one no longer applied, one no longer caught) → regenerated for the relayed pick (the stamp ignored by both the buttons and the GM's claim; the post unspoken); --inject over all 26 patches exits 0 |
| FACTION-SECTOR-GEN-CLAIM | DOC-DRIFT | the faction flow map and the faction record's `seeded` comment said the Sector Creator makes faction records (found while fixing JOURNAL-ORPHAN-ON-REFUSAL); it makes none — the sector keeps the faction's name — and the draft Confirm is `createFaction`'s one production caller → both corrected |

The smaller notes are done too: `nonGmClientPaths.test.js` clears the
ElevenLabs key after each case; `finalize.js`'s header names the five types
Finalise covers; `confirmDraft` uses the static faction import; and the
Foundry reference covers `keepId`, removable notifications and a client
setting's `onChange` on an unchanged value — which confirms Y40's "reload"
remedy (re-saving the same key runs no `onChange`).

Still open — found while fixing them (each proposed for the maintainer):

- ~~**RECOMMIT-GONE-ROLLER-WORDING**~~ (UX, low) — fixed with issue #342 Z58
  (2026-11-06): `applyRollerRecommit` refuses a roller who is no longer a PC
  as "Character gone", to a player or a GM, and a recommit with nothing to do
  says so to the presser. `applyRollerRecommit` had no gone-roller
  (`not-a-pc`) check, so a player pressing a recommit whose character was
  deleted was told "names no character of yours"; a GM's press did nothing.

### Ninth bug audit (issue #331, part 2 of 3) — all fifty-two fixed in the v1.7.36 cycle, and the three found while fixing

Found by the ninth bug audit (2026-11-04) of `8715172`, with a probe per
finding (`tests/probes/` on branch `claude/focused-mayer-4v90oo`; the report
is `docs/testing/bug-audit-9-2026-11-04.md` there): the forty-seven
lower-severity findings X15–X61, and the five found while building #330
(X62–X66, traced by hand, no probes). Each fix carries its own regression
tests — converted from the probe, or written for the traced ones — which
fail with the fix taken out (`docs/testing/fix-sensitivity.md`). Every #331
probe file is converted and removed; the probes of parts 1 and 3 that remain
on the audit branch are #329's and #330's. None of these fixes has been
checked in a live Foundry world yet. The ones to try: a player clicking
their own and another character's position badge on the combat tracker
(X22); End a Session while a player types (X41); the Entities panel open on
a settlement while the GM types `!at` with its name (X56); close Take a Break with ×
(X43); a Fulfill Your Vow and a Forge a Bond missed on the sheet, then 🔁
Recommit (X62); "I continue the legacy" naming no track, then each track's
button (X63); and open the world, ask an `@scene` without beginning a
session, then open it again the next day and read the narrator's LAST
SESSION (X65). Two choices are the maintainer's to confirm: X65 appends the
prep summary to LAST SESSION (the issue offered dropping it too), and X58
leaves the Pacing and World Journal rows unmarked, their section headings
already reading "(GM only)" (decisions.md, "Issue #331 audit").

| Code | Class | Defect → fix |
|---|---|---|
| X15 REDIRECT-PICKER-SURVIVES-UPGRADE | WRONG-DETAIL | A miss's "waste resources" price, redirected at 0 supply to a "make a suffer move" picker, was posted with no resolutionId, so a burn or improve to a strong hit left it live → the picker is bound to the move's resolution; the upgrade retires it |
| X16 RIDER-SUPPLY-ZERO-NO-UNPREPARED | WRONG-DETAIL | An asset rider's supply cost to 0 marked nobody unprepared → the rider calls `markUnprepared` (the roller and the crew sharing the supply); the summary says so |
| X17 BATTLE-GONE-EATS-NEXT-MOVE-ADDS | LOSE-STATE | A forced Battle on a finished fight took Take a Break's +1 and the roller's next-move +1, then rolled nothing → the "not rolled" guards run before the adds are taken |
| X18 REFUSED-PERSIST-LOSES-LEGACY-MARK | LOSE-STATE | A refused move-record write lost its legacy ticks, arrival and site reveal under "check your API key" → `moveRecordRefused`: the GMs' payoff failure card (source `persist`) retries each step |
| X19 CONNECTION-PICK-PCLESS-PLAYER | ATTRIBUTION | A PC-less player's connection pick rolled as the GM's first PC → `relayedClickerPc`: refused |
| X20 MILESTONE-PICK-COMPLETED-VOW | WRONG-DETAIL | A milestone picker answered after its vow was fulfilled marked it → refused (`vow-completed`), the picker kept open for its other vows; `markVowProgress` never marks a fulfilled vow |
| X21 PLAYER-VOW-LINK-QUOTED-NAME | WRONG-DETAIL | A quoted nickname closed the link picker's `value` attribute → `escapeHtml` escapes `"` |
| X22 TRACKER-BADGE-PLAYER-SILENT | GM-GATE (UX) | A player's tracker badge click was a silent no-op → their own PC's position relays (`progressTrack.edit` op `position`); other badges render disabled, naming who may change them |
| X23 ASSET-STAT-SUB-FROM-OTHER-ROLL | RULES | Any "roll +stat" in an ability read as a substitution for the move made (Archer +wits on Strike) → read per sentence, for the move the sentence names |
| X24 CAMPAIGN-RECAP-CARD-UNESCAPED | WRONG-DETAIL | The recap card put model text in raw → `escapeHtml(stripMarkup(p))` |
| X25 RECAP-CACHE-CACHED-MUTATE | LOSE-STATE | The recap cache was set on the cached campaignState → written on a copy, canonical GM only |
| X26 SPOTLIGHT-PERSIST-CACHED | LOSE-STATE | The spotlight pointer likewise → on a copy, canonical GM only |
| X27 CLOCK-VIGNETTE-NPC-MARKUP | WRONG-DETAIL | Clock vignette cards showed `<npc>` tags → `stripMarkup` at the three sites |
| X28 ORACLE-FOLLOWUP-LENGTH-CONFLICT | WRONG-DETAIL | The oracle follow-up asked for two sentence counts → its own 2-3 only |
| X29 ACTIVE-CONNECTIONS-COUNTS-LOST | WRONG-DETAIL | "N active connection(s)" counted severed ones → the count-only block is retired |
| X30 WJ-PAGE-BODY-STALE | WRONG-DETAIL | Severity, confirm, strike and Dismiss wrote the page flag only → `writeEntryPage` everywhere; a retracted entry renders "Retracted by the table." |
| X31 ARCHIVED-TRUTH-STAYS-RETRACTED | LOSE-PLOT | `!truth set` after a strike lifted the strike in the ledger only → the strike records the entries it retracted; the lift restores them |
| X32 SHIP-SEED-STALE-RECORD-WRITE | LOSE-STATE | The ship seed wrote `flags.ship` whole from a pre-await snapshot → by flag path, onto the record as it stands |
| X33 FACTION-DETECT-TWO-ENCOUNTERS | DUPLICATE | One mention recorded two encounters → the auto-surface skips a faction the journal has |
| X34 SHIP-FINALISE-RESEEDS-AUTOSEEDED | LOSE-STATE | Finalise re-seeded an auto-seeded ship, replacing its Notes → stamps only, when the Notes hold text |
| X35 ENTITY-CREATE-ID-CACHED-MUTATE | LOSE-STATE | Creators pushed the new id onto the cached campaignState before the write → `registerEntityId` writes first; creators push after |
| X36 CAMPAIGN-START-CACHED-BEGIN | LOSE-STATE | Campaign Start's Begin skipped the mint check and reopened an ended session → it mints as Begin a Session does, merging its own fields |
| X37 ROLL-FORCE-CONSUMED-BY-REFUSED-LINE | LOSE-STATE | `!roll` was spent by a line the lock refused → the pipeline spends it once the line holds the lock |
| X38 INCITING-PREMISE-CACHED-MUTATE | LOSE-STATE | The premise was set on the cached campaignState before its write → only on the write's target; `persistSceneLedgerFields` always writes a copy |
| X39 TELEMETRY-JOURNAL-DUPLICATED | DUPLICATE | Two writes made two telemetry journals → one queue for every telemetry write |
| X40 READY-MINT-CACHED-MUTATE | LOSE-STATE | The load-time mint ran on the cached campaignState → on a deep copy |
| X41 END-SESSION-GATE-OPEN-WINDOW | RACE | End a Session shut the gate after the scene close and the summary call → its own fields are written first |
| X42 TELEMETRY-FLAG-CACHED-MUTATE | LOSE-STATE | Telemetry appended onto the page's own `getFlag` array → appends on a copy |
| X43 TAKE-BREAK-X-CLOSE-REJECTS | UX | `DialogV2.wait` rejected on × → `rejectClose: false`; the API reference corrected |
| X44 ORACLE-MEMORY-LOST-UPDATE | RACE | Two captures together lost one result → one queue |
| X45 SITE-DISCOVERED-CARD-UNESCAPED | WRONG-DETAIL | The heading took the site's name raw → escaped |
| X46 SITE-PIN-RENAME-STALE | WRONG-DETAIL | A discovered site's pin kept its old name after a rename → the rename hook renames it |
| X47 TRUTH-DESCRIPTIONS-ABRIDGED | RULES | Five option descriptions dropped a sentence → the vendored text |
| X48 PLANET-NAME-NOT-THE-BOOKS | RULES | Planets were named from an invented list → their class's Sample Names (`planet_name_<class>`, d100 bands of five) |
| X49 ORACLE-NARRATE-UNCHECKED | SECURITY | The GM narrated relayed oracle strings unchecked → the relay names its card; the GM narrates what the card carries, once, for its author |
| X50 SHIPMAP-SCENEID-DEAD-WRITE | PRODUCED-BUT-DEAD | `ship.shipMapSceneId` was written and never read → the write and the schema field are retired |
| X51 AUDIO-SYNTH-SPEC-UNBOUNDED | SECURITY | A synthesis request's spec was any voice, model, speed or text → only a narrator card's line in the world's voices (`isNarratorCardClipKey`) |
| X52 SUPPLY-SYNC-REFUSED-WRITE-ABORTS-PASS | LOSE-STATE | One refused sibling write aborted the supply sync and stranded a queued change → each write stands alone; the GM is told whose |
| X53 ERRORLOG-RELAY-RAW-HTML | SECURITY | A relayed error-log entry was appended raw → only one entry as `formatEntry` writes it; anything else refused |
| X54 SETUP-CARD-CANONICAL-ONLY | GM-GATE (UX) | The Campaign Setup card went to the canonical GM alone → `gmUserIds()` |
| X55 VOW-SYNC-HELPER-DEAD | PRODUCED-BUT-DEAD | `computeSharedVowSyncUpdates` had no production caller → deleted; its tests drive the live hook |
| X56 ENTITY-PANEL-STALE-ON-STATE | UX | The panel ignored the campaignState hook → re-renders when the current location or dismissed names it showed change |
| X57 ENTITY-PORTRAIT-ALT-UNESCAPED | SAFETY | The portrait's `alt` took the raw name → escaped (and its `src`) |
| X58 HELP-GM-ONLY-UNMARKED | DOC-DRIFT | Five GM-only commands' rows did not say so → `!at` and `!sector new` say "GM only" (their heading was X59's); the Pacing and World Journal rows sit under "(GM only)" headings; a sweep test checks every handler's GM-only notice against the help |
| X59 HELP-ROLE-CLAIMS-DRIFT | DOC-DRIFT | Quick Start called 🛡 GM only; `!sector list` sat under a "(GM only)" heading → corrected; the OpenRouter step says GM only |
| X60 CONFIG-SETTING-UNDOCUMENTED | DOC-DRIFT | Two `config: true` settings had no Settings Reference row → rows; a sweep test |
| X61 DEV-DOC-DRIFT | DOC-DRIFT | Ten modules had no file-structure row; `Dialog.confirm()` read "not yet fixed" → rows (and `sufferDialog.js`'s, found by the test); fixed |
| X62 RECOMMIT-SHEET-MISS | UX | A sheet miss of Fulfill Your Vow / Forge a Bond got no 🔁 Recommit → the native hook posts the pipeline's offer |
| X63 LEGACY-ROLL-UNNAMED | UX | A Continue a Legacy naming no track scored 0 → a "which legacy track?" card, each track rolled once (`legacy.pick`) |
| X64 SESSION-NUMBER-PRE-STAMP | WRONG-DETAIL | A session ended before the stamp read as unbegun → End a Session's close counts as begun |
| X65 UNBEGUN-SUMMARY-REPLACES-LAST | LOSE-PLOT | A prep session's summary replaced LAST SESSION → appended to it |
| X66 SECTOR-NAME-PARTS-DEAD | PRODUCED-BUT-DEAD | `namePrefix` / `nameSuffix` were written and never read → retired |

Found while fixing — fixed in the same cycle (the maintainer asked for them
to be fixed, 2026-11-05), each with tests that fail with its fix taken out:

- ~~**SUPPLY-SYNC-TWINS**~~ (LOSE-STATE) — fixed. X52's shape at two more
  syncs: the shared-vow lockstep (`registerSharedVowSyncHook`) wrote each
  copy with no per-write guard, so a refused copy write threw out of its
  pass, skipping the copies after it and stranding a queued change until the
  vow's next edit; the legacy sheet sync (`registerLegacySheetSyncHook`) did
  the same when a shared track's campaignState save was refused, and left the
  edited sheet ahead of the track it mirrors → each write stands alone, the
  refusal warned and named to the GM, the pass going on to the other copies
  or tracks and the queued change; a refused track is mirrored as the world
  kept it (`sharedVowSyncRefusedWrite.test.js`,
  `legacySheetSyncRefusedWrite.test.js`).
- ~~**HARNESS-UPDATEACTOR-FLAT**~~ (test harness) — fixed.
  `tests/helpers/multiClient.js` fired `updateActor` with the update as it was
  passed (flat keys), where Foundry passes the expanded diff, so the
  crew-shared supply sync never fired on a booted table → the broadcast
  expands the change; X16's check of the ally's mirrored supply is restored,
  and two tests that leaned on the flat shape say what a world does
  (`multiClientHarness.test.js`).
- ~~**TEST-AID-ALLY-ROLL-FLAKE**~~ (test) — fixed. `moveTextConsequences`'s
  Aid Your Ally fight test rolled real dice, failing 1 run in 100 on a
  double-10 miss → its dice are scripted to the hit it relies on.

### Ninth bug audit (issue #330, part 3 of 3) — the fifteen decisions built in the v1.7.36 cycle

Found by the ninth bug audit (2026-11-04) of `8715172`: the fifteen rows that
needed the maintainer (D1–D15), each with a probe or a traced reading
(`tests/probes/` on branch `claude/focused-mayer-4v90oo`; the report is
`docs/testing/bug-audit-9-2026-11-04.md` there). The maintainer decided them
on 2026-11-04, each the recommended option (decisions.md, "Issue #330
decisions"). Each change carries its own regression tests — converted from
the probes where one existed — which fail with the change taken out
(`docs/testing/fix-sensitivity.md`). None has been checked in a live Foundry
world yet. The ones to try: miss a Fulfill Your Vow and a Forge a Bond and
press 🔁 Recommit (D1 — a shared vow's other copy, and the sheet's
Connections tab); a Face Danger miss whose Pay the Price harms a character
at 1 health, then the 🛡 resist card and that roll's miss (D3); a Heal on
your own wounds with iron above wits (D4); a Forge a Bond rolled on the
sheet's Connections tab for a bond added there by hand (D5); `!sever` and
the narrator's next CHARACTER STATE (D10); a player with their own
ElevenLabs key playing a card the GM has not (D11); open the world after
End a Session without pressing Begin, then again a day later (D12); and a
player pressing ✦ Envision Inciting Incident (D15). Of the twelve probe
files for this part, nine pass and are replaced by their tests; three fail by
design, asserting the option not taken or a shape the decision changed:
`upgrades/upgradeClosedByOwnSuggestion` (option A; D2 took B),
`sectors/sectorNamesakeFolders` (option A's id-keyed folders; D14 took B)
and `entities/severBondItemStays` (it reads a live bond as not `completed`;
D10 writes a module `lost` flag, not the vendor's `completed`, which the
sheet shows as a forged bond).

| ID | Decision | What changed |
|---|---|---|
| D1 VOW-BOND-MISS-RECOMMIT-ADVISORY | A | A Fulfill Your Vow's or Forge a Bond's miss posts a claimed "🔁 Recommit" (gmRelay `vow.recommit` / `bond.recommit` — the roller's player or a GM): every open copy of the roller's vow and its journal twin, or the connection's record mirrored to its bond Items — the lowest die's boxes cleared, the rank stepped once (`performVowRecommit`, `performBondRecommit`, `setVowItemTrack`) |
| D2 UPGRADE-CLOSED-BY-OWN-SUGGESTION | B | Issue #326 D4 stands; a card that offers a burn or an improvement says "burn or improve first" beside its ⚑ / 🏁 / 🤝 / 🔗 follow-ups and in their titles, and the help says the same |
| D3 ENDURE-HARM-STEP-ESCALATION | A | The harm / stress step takes the meter and the overflow; at 0 it posts a resist card that rolls Endure Harm / Stress as the PC (bound to the move whose price it was); only that roll's own miss (`resistMiss`) offers the X03 mark-or-table choice |
| D4 HEAL-SELF-LOWER-STAT | A | The interpreter names the Heal situation (`healSituation`); a self-mend rolls the lower of iron / wits (`PICK_LOWER_OF`), the card reading "lower of iron / wits" |
| D5 NATIVE-FORGE-NAME-STRICT | A | A sheet Forge a Bond resolves the roller's bond Item by its record id, else the one connection of that exact name, else nothing (`findSheetBondConnection`) |
| D6 OVERCOME-DESTRUCTION-SCORES-ZERO | A | Overcome Destruction scores the shared bonds legacy track, Continue a Legacy the track it names; a cleared track rolls as 10 progress |
| D7 FORSAKE-STRESS-FIXED-AMOUNT | A | Forsake Your Vow's Endure Stress is picked at minor / serious / major (-1 / -2 / -3) on a follow-up card (`amountPick`) |
| D8 SPOTLIGHT-NAMES-THE-ROLLER | A | The spotlight rotation skips the narration's CHARACTER when another PC is in the scene |
| D9 LORE-RUMOUR-RECONFIRMED | A | A narrator write never overturns an entry the GM ruled a rumour or dismissed from review; `!journal lore … confirmed` or Confirm promotes it |
| D10 SEVER-BOND-ITEM-STAYS | A + B's reader | `!sever` marks the bond Items `flags[MODULE].lost` (`setBondItemLost`); `readConnections` reports it and CHARACTER STATE lists the bond as lost |
| D11 AUDIO-CACHE-WRITE-UNCHECKED | A | A relayed clip is filed only under a narrator card segment's key under the world's voices, and never over a clip cached or in the making |
| D12 SESSION-NUMBER-BURNED-BY-PREP-LOAD | A, narrowed | A closing session nobody began hands its number on (its id still changes); the Campaign Start's Begin stamps `sessionStartedId` |
| D13 ORACLE-REF-NOT-FOLLOWED | A | `!oracle` rolls every cross-reference row's table under its heading; the unread `isRef` / `refTableId` are retired |
| D14 SECTOR-NAMESAKE-FOLDERS | B | A new sector's name is rolled again while a stored sector has it (numbered after fifty taken pairs) |
| D15 SESSION-PANEL-ENVISION-GM-ONLY | A | The Session panel's ✦ Envision Inciting Incident is a player's too: their press posts their `!incite` |

Found while building them — fixed by issue #331 (the section above):

- ~~**RECOMMIT-SHEET-MISS**~~ (UX) — fixed (issue #331 X62). A Fulfill Your
  Vow or Forge a Bond rolled on the Starforged sheet that missed got no 🔁
  Recommit: the native consequence hook paid hits only → it posts the
  pipeline's offer on a sheet miss.
- ~~**LEGACY-ROLL-UNNAMED**~~ (UX) — fixed (issue #331 X63). A Continue a
  Legacy whose narration named no legacy track scored 0 with a console
  warning only → a "which legacy track?" card, each track rolled once.
- ~~**SESSION-NUMBER-PRE-STAMP**~~ (edge) — fixed (issue #331 X64). A
  session ended before issue #300 F11 (no `sessionStartedId`, the gate shut)
  read as unbegun once, so the next one kept its number (D12) → a session
  End a Session closed counts as begun.

### Ninth bug audit (issue #329, part 1 of 3) — all fourteen fixed in the v1.7.36 cycle, and four of the five found while fixing

Found by the ninth bug audit (2026-11-04) of `8715172`, with a probe per
finding (`tests/probes/` on branch `claude/focused-mayer-4v90oo`; the full
report is `docs/testing/bug-audit-9-2026-11-04.md` there): the two X-Card
safety findings (X01–X02) and twelve medium ones (X03–X14). Parts 2 and 3
(issues #331 — X15–X61 — and #330 — the decisions D1–D15): both are built
(the sections above). Each fix
carries its own regression tests, converted from the audit's probes, which
fail with the fix taken out (`docs/testing/fix-sensitivity.md`). None has been
checked in a live Foundry world yet. The ones to try: play the X-Card on a
narration whose capture recorded lore or a Session Log beat (X01); miss an
Endure Harm at 1 health and pick each option on the choice card (X03); a GM
pressing 🏁 / ⚔ on a player's card at a two-PC table (X05); a GM whose socket
drops and comes back mid-move at a two-GM table (X08 — **(Foundry)**: the
harness models the reconnect with leave / join); edit an NPC card's Notes
tab and read the narrator's card (X12); and type a line before Begin a
Session (X14). And for the four found while fixing: press 🏁 on the same
card from a player's and the GM's client; take "Lose Momentum (-2)" on an
Endure Harm miss at 0 health; X-Card a narration that turned a faction
hostile; load a world played before this version whose NPC had a ⤴ Promoted
detail. The seventeen probe files of X01–X14 are converted and
removed; the 57 of parts 2 and 3 still fail by design (86 failing tests, 80
controls passing — unchanged by this work).

| Code | Class | Defect → fix |
|---|---|---|
| X01 XCARD-CAPTURE-NO-NARRATION-ID | SAFETY | The capture's lore, threats, places, Session Log beats and tier details carried no narration id, so the X-Card's `propagateRetraction` (which reaches only copies restating a retracted sidecar truth) left them: the lore came back as ESTABLISHED LORE → every capture entry point hands the narration's id down; each record is stamped (an entry it rewrote keeps the versions before as `previous`); the X-Card's finish runs `retractNarrationCapture` — a rewritten entry restored, a new lore entry retracted, a new threat / faction / place page deleted, the beats and tier details dropped |
| X02 CONSISTENCY-CHECK-STALE-LEDGER | SAFETY | The consistency check audited the pipeline's pre-dialog snapshot: an X-Card played while the move waited handed the removed beat to the audit as binding; a `!truth strike` then sat under ACTIVE SCENE TRUTHS → `auditCampaignState`: the live ledgers with the narration's own entries merged by the persist's policy |
| X03 ENDURE-AT-ZERO-MARK-AND-ROLL | RULES | At 0 health / spirit on a miss the executor marked wounded / shaken AND rolled the table → nothing marked or rolled; a follow-up choice card (mark the impact, mark the lasting one, roll the table — `rollTable` option, `rollImpactTable`), bound to the move's resolution when its Pay the Price ran it, so an upgrade retires it |
| X04 ASSET-ADD-ON-COST-MENTION | RULES | An ability's move link that names the move only as a cost ("Endure Harm (-2)", "also …", "you must Repair") keyed it to that move with the general trigger's add; an outcome sentence's later-move add was offered on the trigger itself → cost mentions key nothing; on the ability's own trigger an outcome sentence's add is skipped |
| X05 CARD-REPOST-AS-CLICKER | ATTRIBUTION | Five forced-move buttons posted with no speaker, so a GM's press rolled as the first PC → each speaks as the card's roller (`cardRollerSpeaker`); the expedition and player-vow cards record it; the 🏁 buttons name the roller's vow by its Item id |
| X06 THRESHOLD-CARD-NO-CLAIM | DUPLICATE | The fight-threshold card disabled its buttons locally only: a second Find another way posted a second way-out card, a stale Enter the Fray began a won fight again → relayed `combat.threshold`, claimed once on the card (`thresholdTaken`); the `combat.enterFray` socket is retired |
| X07 REWARD-LINK-REFUSED-WRITE | LOSE-STATE | A refused reward / link write after the claim was reported as set → the writers report whether they landed (no copy counts as not); the claim is released and the presser and GMs whispered |
| X08 MOVE-LOCK-RELEASED-BY-STALE-PIPELINE | RACE | A pipeline whose lock was handed over (W25) released the lock a later move held → each claim stamps `pendingMoveClaim`; a pipeline releases only its own |
| X09 SIDECAR-APPLY-CACHED-MUTATE | LOSE-STATE | Six callers narrated from the cached campaignState, so a refused write left facts, a frame or a scene on the GM alone → each narrates from a working copy |
| X10 SCENE-COMMAND-CACHED-MUTATE | LOSE-STATE | `!scene start` / `end` changed the cached setting and claimed success whatever the write did → a working copy; the card says "not saved" when the world kept its scene |
| X11 SECTOR-STORE-CACHED-MUTATE | LOSE-STATE | `storeSector` put the record on the cached setting before its write, so the retry found it "stored" → the record reaches the caller's object only once written; `createSector` works on a copy |
| X12 NOTES-SHEET-NOT-MIRRORED | LOSE-PLOT | The narrator's Notes row read the record's `notes`, which the sheet's Notes tab and the Auto-Seed never reached → the sheet is canonical for NPC cards and ships (`withSheetNotes` in the getters, the panel's display, ⤴ Promote) — decisions.md |
| X13 BEGIN-REFUSED-SILENT | UX | A refused session-start write was a console warning; the Begin card's "+1 momentum" was the last word → a "The session was not started" card |
| X14 SESSION-GATE-SILENT-DROP | UX | The session gate dropped typed lines and button moves with no word → the author and GMs whispered (a typed line's author once); a claimed card's forced move held until a session begins |

Found while fixing — fixed in the same cycle (the maintainer asked for the
known issues to be addressed, 2026-11-04), each with regression tests that
fail with its fix taken out:

- ~~**XCARD-CAPTURE-TRANSITIONS**~~ (SAFETY) — fixed. A state transition the
  capture applied to an existing World Journal entry — a threat resolved or
  escalated, lore confirmed, a faction's attitude — carried no narration id,
  so an X-Card on that narration did not undo it → `applyStateTransition`
  takes the narration's id, and `updateThreatSeverity`,
  `promoteLoreToConfirmed` and `recordFactionIntelligence` stamp it with the
  version they replaced, which the X-Card restores; a faction entry records
  the stance its write moved on the faction's record (`recordStance`
  { entityId, before, after }), put back where the record still holds it
  (`tests/unit/xcardCaptureTransitions.test.js`).
- ~~**ENDURE-ZERO-ON-OTHER-OPTION**~~ (RULES) — fixed. "If your health is 0,
  you must also mark … or roll" holds whichever miss option is picked; the
  at-0 choice card followed only "-1 health" → the "Lose Momentum (-2)"
  option carries `atZeroChoice`, and `offerAtZeroChoiceAfterMiss` posts the
  card when the meter is 0 (`tests/unit/endureZeroOnMomentumPick.test.js`).
- ~~**NOTES-PROMOTED-BEFORE**~~ (LOSE-STATE) — fixed. A detail promoted to
  an NPC's or ship's record notes before X12 was no longer shown, and
  `updateShip` still wrote a ship's notes onto the record → the canonical
  GM's world load moves each promoted paragraph the Notes tab lacks into it
  and clears the record's copy (`migrator.moveRecordNotesToSheets`);
  `updateShip` writes the tab alone (`tests/unit/notesPromotedBefore.test.js`).
- ~~**FULFIL-BUTTON-LOCAL-DISABLE**~~ (DUPLICATE) — fixed. The 🏁 buttons
  disabled only locally, so a second client or a re-render rolled the vow
  again → both relay `fulfilVow.attempt`, claimed once on the card
  (`fulfilAttempted`) by the canonical GM, which posts the roller's move — the
  roller's player or a GM may press it (`tests/unit/fulfilButtonOnce.test.js`).

Decided since:

- ~~**ENDURE-HARM-STEP (issue #330 D3)**~~ — decided (option A) and built: a
  harm step at 0 owes the resist roll, and only that roll's miss offers the
  X03 choice (the section above).

### Eighth bug audit (issue #326, part 2 of 2) — all fifty fixed and the eight decisions built in the v1.7.36 cycle

Found by the eighth bug audit (2026-11-03) of `39331b4`, with a probe per
finding (`tests/probes/` on branch `claude/affectionate-lamport-20ldyw`):
fifty low-severity findings (W38–W87) and eight that needed a decision
(D1–D8), which the maintainer made on 2026-11-03 — each the recommended
option (decisions.md, "Issue #326 audit"). Each fix carries
its own regression tests, converted from the audit's probes, which fail with
the fix taken out (`docs/testing/fix-sensitivity.md`). None has been checked
in a live Foundry world yet. The ones to try: open a Starforged character
sheet's Legacies tab after a vow is fulfilled, mark a legacy tick there, and
reload (D3 — the mirror, the flow back and the backfill); press an old move
card's 🔥 after the same character's next move (D4); roll a scene
challenge's ⬡ Progress Roll mid-session (D6); type a move as a player with
no character at a two-PC table (D8); a player with their own ElevenLabs key
playing a card the GM already played (W79); and a GM's Play with no key
(W80). Eleven of its probe files fail by design, each replaced by its
regression tests: they pin the old behaviour as a control, or assert the
option not taken — `continuity/correctAFactHelp` (W67 corrected the help
rather than restoring the button), `continuity/ledgerCommandNoScene` (its
helper starts the scene unconditionally; W59 starts it only when none is
open), `moves/legacyXpBeforePersist` and `upgrades/bondApplyXpBeforeSave`
(they read `system.xp`, which D3 retired), `sectors/cachedStateMutatedBeforeWrite`
(its `!oracle-add` case expects no card; W51 posts "not saved"),
`session/legacyXpNotOnSheet` (it awaits an XP card W52 pays only after the
save), `ui/audioKeyedPlayerCache` (no GM answers in it; W79 asks the GM),
`ui/audioKeylessCanonicalGm` (its control pins the 30 s wait),
`ui/deadscanStringMentions` (its real-tree case names the deleted
`loadEntityAssets`), `ui/langStringsConsumed` (it expects the keys read; W84
deleted them) and `upgrades/persistResolutionDeadSteps` (its controls pin the
retired log and step). The other four failing probe files are outside part
2: `moves/interpreterStatOffList` (part 1's W19, failing by decision),
`session/rewardRepromisedAfterGrant` and `upgrades/healGiveHealsHealer`
(part 1's W11 and W04 probes, failing before this work began) and the
excluded `sectors/sectorsRevertedByMove`.

| Code | Class | Defect → fix |
|---|---|---|
| W38 INTERPRETER-DISPLAY-NAME | WRONG-DETAIL | `parseInterpretation` looked the model's `moveId` up as-is, so a reply naming "Gather Information" fell back to Face Danger → an unknown id (else the `moveName`) goes through `toMoveId` |
| W39 NOTES-HTML-IN-PROMPT | WRONG-DETAIL | A ship's or NPC's Notes HTML (portrait block, envisioned-details headings) reached ENTITIES IN SCENE verbatim → `notesAsCardText` for every card type's Notes row |
| W40 MODE-LENGTH-CONFLICT | WRONG-DETAIL | Every narrator mode's STYLE block carried the move narration's Length beside its own count → the Length line for move and paced narration only |
| W41 XCARD-LOSES-EARLIER-STATE | SAFETY | A state change replaced its entry in place, so retracting narration B left no value → entries keep a bounded `previous` chain; `retractNarrations` restores the newest kept value and prunes removed ones |
| W42 XCARD-BEAT-PAST-ROLL-REPOST | SAFETY | The X-Card's beat walk passed a button's re-posted act (`bypassPacing` / `forcedMoveId`) and removed the narration before it → that message bounds the beat |
| W43 MILESTONE-PICKER-MARKS | LOSE-STATE | A won fight's ×2 milestone that fell to the vow picker marked once → the picker's choices carry `marks`; `applyMilestonePick` multiplies |
| W44 FINISH-VOW-SOLE-TWIN | WRONG-TARGET | `finishVow` fell to the sole open journal vow when no track carried the name → `selectVowTrack(…, { byNameOnly })`; the pipeline passes the scored vow's name |
| W45 POSITION-TWO-FIGHTS-DROPPED | LOSE-STATE | With two fights open and no foe named, a move's position was written nowhere → `selectRollerFight`, the fight that records the roller's position |
| W46 FINISH-EXPEDITION-COURSE-CARD | WRONG-DETAIL | The arrival branch posted the Set a Course feedback card for Finish an Expedition too → Set a Course only |
| W47 WAYPOINT-DISCOVERY-DOUBLE-ROLL | DUPLICATE | A matched waypoint seeded its narration with a discovery / chaos roll and the button's move rolled again → the waypoint seeds the notable-aspect prompt only |
| W48 BONDED-DEVELOP-SKIPS-NEXT-MOVE-ADD | LOSE-STATE | Take a Break's +1 and the next-move bonus were taken before `enrichBondedDevelop` made the roll an action roll → taken after it, by `rollKind` |
| W49 ENDURE-SUBSTITUTION-DISCARDED | WRONG-DETAIL | PICK_HIGHER_OF overwrote a chosen stat substitution for Endure Harm / Stress → skipped when `statSubstitutedFrom` is set |
| W50 MISCHIEF-ASIDE-READS-RATIONALE | WRONG-DETAIL | The aside was passed the model's rationale, not the narration → the narration |
| W51 CACHED-STATE-COMMAND-WRITES | LOSE-STATE | Nine writers (`!pace`, `!roll`, oracle memory, `!reveal-site` / `!clear-site`, `!oracle-add` / remove, `!lore`, Take a Break's clear, `bond.apply`'s legacy) mutated the cached setting before a refusable write → each writes a copy; the commands say when the write was refused |
| W52 LEGACY-XP-BEFORE-PERSIST | LOSE-STATE | Box XP was paid at the mark, before the save → owed by the copy (`deferLegacyXp`) and paid once it is saved (`payDeferredLegacyXp`, `awardSavedLegacyXp`); a refused `!bond` save no longer skips the rank raise |
| W53 CLOCK-LOST-UPDATE | RACE | Two clock actions within one round trip each wrote the old list → every clock read-modify-write runs through `serialiseClockWrite` |
| W54 READY-CREATORS-TWO-GMS | DUPLICATE-EMIT | The help journal, macros, World Journal and ready-time migrations were gated on `isGM` → `isCanonicalGM()` |
| W55 COMBAT-TRACKER-VIEWED-COMBAT | WRONG-TARGET | The tracker decorated the first module combat, and hid initiative on any combat → the viewed combat, and only one carrying a trackId |
| W56 POSITION-TOGGLE-CLICKER | ATTRIBUTION | The panel's toggle sent `game.user.character` (null for a solo GM) → `resolveUserActorId`; the handler cycles that PC's position |
| W57 BURN-BLOCK-IN-HEADER | WRONG-DETAIL | The burned outcome rendered inside the card title; Improve Result's struck note said momentum was burned → the block follows the struck outcome; the note is per kind |
| W58 PERSIST-DEAD-STEPS | PRODUCED-BUT-DEAD | `appendToSessionLog` grew `campaignState.sessionLogs` for every move with no reader; `applySufferMoveDebilities` was unreachable → retired with the log-only upgrade persist and the `sufferMoveTriggered` alias |
| W59 LEDGER-COMMAND-NO-SCENE | LOSE-STATE | A `!truth set` / `!state set` with no scene open wrote into a phantom scene the next narration ended → it starts the scene first |
| W60 TRUTH-SET-OVER-STRIKE | WRONG-DETAIL | A set beside a bare strike of the same fact left both binding and CORRECTED → the set lifts the strike (`correctedTo`); a player's set over a GM strike is refused |
| W61 STATE-ATTRIBUTE-CASE | DUPLICATE | Attributes compared case-sensitively → `sameStateAttribute` everywhere |
| W62 JOURNAL-QUALIFIER-UNCHECKED | WRONG-DETAIL | `!journal` stored any qualifier → checked against `JOURNAL_QUALIFIERS`; the usage line names them |
| W63 CONTRADICTED-TRUTH-ID-DEAD | PRODUCED-BUT-DEAD | The review card's `contradictedTruthId` was always null and unread → `resolveContradictedTruthId`; the Retract dialog lists that truth first |
| W64 SESSION-LOG-RETRACTED-LORE | SAFETY | The Session Log's lore listed retracted lore → filtered out |
| W65 SHIP-POSITION-LOCATION-LINE | WRONG-DETAIL | A recorded location became bare free text in SHIP POSITION → `nearestLocationId`, rendered "docked at" / "near" |
| W66 REVIEW-CARD-SHIP-HINT | DOC-DRIFT | The ship review card named `!ship` → `!at <place>` |
| W67 CORRECT-A-FACT-HELP | UX | No truth id was shown anywhere `!truth strike` could take it; the help described a removed button → the set card shows the id; `!truth list`; the help is rewritten |
| W68 RENAME-FACTS-STAY-TEXT-BOUND | LOSE-STATE | A placeholder's rename never promoted the facts recorded under its new name → `applyEntityRenames` runs `promoteNewEntityLedgerSubjects` |
| W69 AUTO-SEED-STALE-RECORD-WRITE | LOSE-STATE | The Auto-Seed wrote its pre-await record snapshot whole → only its seeded fields, by flag path |
| W70 VOW-TARGET-FACTION-CONNECTION | WRONG-TARGET | Every inciting vow target became a connection → the target's kind is asked and parsed (`vowTargetKind`); only a person is connected |
| W71 LORE-CARD-UNESCAPED | WRONG-DETAIL | The lore recap rendered the model's text as raw HTML → `loreParagraphs` / `escapeLoreHtml` |
| W72 POPULATION-TABLES-UNREACHABLE | PRODUCED-BUT-DEAD | The Outlands and Expanse population tables had no `!oracle` id → `settlement_population_outlands` / `_expanse` |
| W73 SECTOR-STUB-PERSPECTIVE | WRONG-DETAIL | The stubs compared the perspective with "first" → `resolveNarrationPerspective` |
| W74 SITE-LOCATION-KLASS | WRONG-DETAIL | A site's rolled class was not written → `system.klass` |
| W75 SITE-RENAME-STALE | WRONG-DETAIL | A renamed site kept its generated name in the discovery record's readers → `siteDisplayName` from the location Actor |
| W76 TRUTH-QUEST-STARTERS | RULES | Eleven quest starters differed from the rulebook → regenerated from the vendored truths |
| W77 API-LOG-PLAYER-BUFFER-GROWS | LEAK | A player's post-ready entries were buffered for the page's life → dropped (only a GM writes the log) |
| W78 API-LOG-SETTING-REACHABLE | UX | `apiTransactionLog.enabled` had no panel row → Narrator tab row |
| W79 AUDIO-KEYED-PLAYER-REBILLS | DUPLICATE | A keyed default Player's refused cache browse read as a miss, so every play was synthesised again → `lookupDetailed`; `audio.cache.ask` → `audio.cache.found` before synthesising |
| W80 AUDIO-KEYLESS-GM-WAITS-ON-ITSELF | UX | A keyless canonical GM relayed to itself and waited 30 s → fails at once, naming the About tab |
| W81 AUDIO-SYNTH-REQUEST-UNCHECKED | SECURITY | The GM synthesised any relayed request → refuses one whose hash is not `cacheKey(spec)` |
| W82 DEADSCAN-STRING-SELF-MENTION | TOOLING | A function's own log line counted as its consumer → `consumerText` blanks string text except whole-identifier dispatch; `loadEntityAssets` deleted |
| W83 HELP-DOC-DRIFT | DOC-DRIFT | Six help claims contradicted the code → corrected |
| W84 LANG-FILE-DEAD | PRODUCED-BUT-DEAD | `lang/en.json`'s 159 keys were read by nothing → emptied; a test fails on an unread key |
| W85 SESSION-PANEL-PLAYER-BEGIN | UX | Begin / End Session were GM-only in the panel → disabled by session state only |
| W86 TOOLBAR-PC-TOGGLE-STALE | PRODUCED-BUT-DEAD | The Private Channel switch did not re-render the toolbar; `rerenderIfOpen` had no caller → `onPrivateChannelToggled` |
| W87 SPEECH-LANGUAGE-CHANGE-IGNORED | UX | The language was read once → the setting's onChange rebuilds the controller |
| D1 VOW-DEEPEN-TWICE | DUPLICATE | The victory card's deepen and the fulfilment's each deepened → one deepen per vow, recorded on its `fulfilPayoff.deepen` ledger (`deepenVowConnectionOnce`) |
| D2 SCENE-PLACE-AT-END | WRONG-TARGET | Scene truths were filed on the end-of-scene place → each truth's `sceneLocation` stamp |
| D3 LEGACY-XP-OFF-SHEET | PRODUCED-BUT-DEAD | The XP went to `system.xp`, which the Starforged sheet lacks → the shared tracks mirrored to `system.legacies.<track>` (`sharedLegacies.js`); `awardXP` deleted |
| D4 UPGRADE-OLD-MOVE-CARD | RULES | An old card's upgrades stayed live → closed by the roller's next move (`closeUpgradesForLaterMove`, `laterMoveFollows`) |
| D5 SECTOR-PASSAGE-COUNT | RULES | One passage per settlement → the book's 3 / 2 / 1, the last off the edge |
| D6 SCENE-CHALLENGE-ROLL | RULES | The scene challenge's roll was a display card → Finish the Scene through the pipeline (`sceneChallenge.js`) |
| D7 CLOSEWORLD-HANDLER | PRODUCED-BUT-DEAD | A handler on an undocumented hook → deleted |
| D8 PCLESS-PLAYER-FIRST-PC | ATTRIBUTION | A PC-less player was rolled as the first PC → told, and nothing rolled (U23's rule) |

Open — found while fixing, not fixed: *(none left — resolved in the v1.8.1 open-item sweep; see its table at the top)*

### Eighth bug audit (issue #325, part 1 of 2) — all thirty-seven fixed in the v1.7.36 cycle

Found by the eighth bug audit (2026-11-03) of `39331b4`, with a probe per
finding (`tests/probes/` on branch `claude/affectionate-lamport-20ldyw`):
seven high-impact (W01–W07, three of them X-Card safety) and thirty medium.
The maintainer decided W19 on 2026-11-03 (decisions.md, "A typed move rolls
a stat it lists — except under the Chaotic dial"). Each fix carries its own
regression tests, converted from the audit's probes, which fail with the fix
taken out (`docs/testing/fix-sensitivity.md`; W27 by injection). None has
been checked in a live Foundry world yet. The ones to try: fulfil an Epic vow
made on the sheet (W01); press "⚑ Mark Progress on Vow" while its own move is
still narrating (W02); Heal another PC (W04); play the X-Card while the next
move waits at its confirm dialog, then resume (W05–W07); a player's `!ptp`
with a shared supply at 0 (W10); press Battle twice, from two clients (W11);
two GMs, the canonical one closing their browser mid-move (W25); and Begin a
Session solo, with no User character set (W32). Part 2 (issue #326, W38–W87
and D1–D8) is above.

| Code | Class | Defect → fix |
|---|---|---|
| W01 VOW-RANK-NUMERIC | WRONG-DETAIL | The system stores a progress Item's rank as a number; the payoff sites read it raw and `normalizeExpeditionRank` fell back to "dangerous": every vow paid 2 ticks, the item-only "⚑ Vow Fulfilled" card threw on `rank.charAt`, the player-vow card printed "(3)" → `rankName` at the read sites, numeric ranks in `normalizeExpeditionRank` |
| W02 CLAIMED-PICK-DROPPED-WHILE-BUSY | LOSE-STATE | A relayed one-shot button (milestone, "Which vow?", connection pick, waypoint 🔭 / 🌀) claimed its card, then its forced move met the move lock and was dropped → the post is flagged `deferWhileBusy`; the canonical GM holds it and replays it when the lock frees (`deferForcedMove` / `drainDeferredForcedMoves`) |
| W03 PTP-NARRATED-TWICE | DUPLICATE | Every routed miss got a second narrator card and Claude call labelled "Face Defeat" → `postMovePayThePriceCard(actorId, moveName)` records the price under the move that paid it, with no follow-up narration (the move's own narration is seeded with it) |
| W04 HEAL-HEALS-HEALER | ATTRIBUTION | Heal's recovery card, its wound check and its writes were the roller's → `resolveHealPatient` names the PC or companion before the dice; the card's targets carry it; the pick applies to the patient |
| W05 XCARD-STALE-LEDGER | SAFETY | A move narrated from its pre-dialog snapshot rendered an X-carded beat's truths, state and frame as binding → `withSceneLedger` reads the scene ledgers from the live store at narration time |
| W06 XCARD-SUMMARY-RESURRECTED | SAFETY | The emptied summary kept its old `updatedAt` (a merge tie wrote it back) and a regen in flight stored the removed beat → stamped `updatedAt` / `xCardedAt`; a regen that spans an X-Card play is discarded |
| W07 XCARD-SHIP-POSITION | SAFETY | The sidecar's ship move had no `narrationId`, so the X-Card left it → the position record carries it and the X-Card restores the previous position (`restoreShipPositionAfterXCard`) |
| W08 VENDOR-MOVE-CARD-NARRATED | WRONG-DETAIL | The system's "Send to chat" move card passed `isPlayerNarration` → content rooted in the system's chat classes is not narration |
| W09 PACED-ROLL-CLICKER | ATTRIBUTION | The paced Roll button re-posted with no speaker, rolling for whoever pressed it → the card carries the narrating PC (`actorId`); the re-post speaks as them |
| W10 PTP-CREW-UNPREPARED-PLAYER | GM-GATE | A player's `!ptp` suffer ran on their client, which cannot update the crew → relayed to the canonical GM (`payThePrice.suffer`), the typist as the roller |
| W11 BUTTONS-LOCAL-DISABLE | DUPLICATE | Battle, way-out, Develop / Forge suggestion, reward and Link buttons were disabled in the clicker's DOM only → the issue #321 U20 shape (relay kinds `combatTrack.battle`, `wayOut.pick`, `connection.suggest`, `vow.reward`, `vow.link`; the card claimed first); a Battle naming a finished fight is not rolled; a reward pick on a granted or lost reward is refused |
| W12 ABILITY-ADDS-SUMMED | WRONG-DETAIL | `extractAdds` summed every "add +N" in an ability → the clause naming the move (else the first); a "next <move>" add is not this move's |
| W13 IMPROVE-COUNT-WEAK-ON-MISS | WRONG-DETAIL | "Count a weak hit as a strong hit" offered the upgrade on a miss → `extractResultImprovement` records `from: "weak_hit"`; the offer requires it |
| W14 RESIST-MISS-FREE-AT-ZERO | WRONG-DETAIL | An Endure Harm / Stress miss's -1 was a clamped meter delta, free at 0 → runs the executor for 1, the overflow as momentum |
| W15 TWO-SUFFER-MOVES-SAME-MOVE | WRONG-DETAIL | "Two suffer moves (-1 each)" applied one move twice → the "any" card takes `count` picks, one move per tap |
| W16 SACRIFICE-UNPREPARED-FREE | WRONG-DETAIL | Sacrifice Resources at 0 while unprepared settled for nothing → the loss goes to a "make a suffer move" picker |
| W17 MOVE-TEXT-CONSEQUENCES | WRONG-DETAIL | Compel's weak hit lacked +1 momentum; Resupply's weak hit lacked the item option; Aid Your Ally resolved as text (no miss price, no benefit); Companion Takes a Hit's death text ignored health → each follows the move text (Aid Your Ally as Secure an Advantage / Gain Ground, the ally taking the benefit) |
| W18 BOND-ADDS-UNROLLED | WRONG-DETAIL | A bonded Test Your Relationship and a vow sworn to a connection rolled bare → `enrichBondAdds` adds +1 / +1 (+2 bonded); the swear post carries `swearToConnection` |
| W19 INTERPRETER-STAT-OFF-LIST | WRONG-DETAIL | The parse checked the model's stat against every stat name → held to the move's list under Lawful and Balanced; Chaotic may roll an unlisted stat (maintainer decision) |
| W20 RENARRATION-OUTCOME-MISSING | WRONG-DETAIL | Burn / Improve re-narrations and sheet-roll narrations had no MOVE OUTCOME → `buildLoremasterContext` for each |
| W21 PERSPECTIVE-AUTO-COUNTS-GM | WRONG-DETAIL | Auto counted active users, the GM included → counts active non-GM users (none or one: second person) |
| W22 CONNECTION-DISPOSITION-NEUTRAL | WRONG-DETAIL | The card rendered the never-written `relationshipType` as Disposition → renders `disposition`; `relationshipType` retired |
| W23 MAKE-CONNECTION-PENDING-DRAFT | LOSE-STATE | A hit on an NPC pending in a draft card created nothing → `confirmNamedPendingConnection` confirms the named draft for the roller |
| W24 END-SCENE-DROPS-CONCURRENT-FACTS | LOSE-STATE | Facts persisted during `endScene`'s awaits were cleared by its final write → `migrateLateSceneFacts` re-reads and migrates them first |
| W25 MOVE-LOCK-GM-HANDOVER | LOSE-STATE | A lock held by a GM who disconnected wedged the table → the lock carries `pendingMoveBy`; the canonical GM releases a departed GM's lock on `userConnected` and whispers the GMs |
| W26 PANEL-TEXT-UNESCAPED | SAFETY | Entity names and fields, safety lines and track labels went raw into panel HTML (a script-injection surface) → `escapeHtml` at each site |
| W27 SHORT-CALLS-THINKING | WRONG-DETAIL | Six short structured calls on the narration model sent no `thinking`: on Sonnet 5 their replies could be empty → `narration/thinking.js` `thinkingOffFor`, narration's rule |
| W28 FULFIL-LEGACY-TWICE | DUPLICATE | Sheet then pipeline fulfil paid the Quests legacy twice → the pipeline consults `fulfilPaid` before its own legacy write |
| W29 WON-FIGHT-CARD-AFTER-FULFIL | WRONG-DETAIL | A victory card's milestone / 🏁 fell to the sole-open rung after its vow was fulfilled → the ladders match completed vows and stop; the card's buttons retire |
| W30 SELECTOR-SUBSTRING-INSIDE-WORD | WRONG-DETAIL | Every selection ladder's substring rung matched inside words, either way; `!sever` severed the first partial fit → `wholeWordsFit` in every rung; `!sever`'s typed name a whole-word fragment of exactly one name (`connectionsNamedByFragment`) |
| W31 SEED-REROLLS-NARRATED-IDENTITY | LOSE-PLOT | The narrated goal went to `motivation` and the seed rolled a goal and first look beside the narration's → the seed data's `goal`; no first-look roll for a described record |
| W32 GALLEY-SOLO-PC-ABSENT | WRONG-DETAIL | Presence required `User.character` → a connected player's PC by `resolveUserActorId`; a PC no player has is the GM's |
| W33 INCITING-BOLD-LABEL | WRONG-DETAIL | "**Suggested vow:**" leaked `**` into the vow, clock and target (a second connection) → `matchLabelLine` tolerates emphasis and strips it from the value |
| W34 WJ-PANEL-FACT-OVERRIDE | LOSE-PLOT | The WJ panel's Override "promoted" a fact-continuity catch and deleted it, Retract button and all → those catches get Correct… / Dismiss; Override refuses them |
| W35 TRUTHS-SINGLE-CATEGORY-SAVE | LOSE-PLOT | A truths save needed two `<h2>` → `holdsTruths`: one category with a truth is a save |
| W36 HINT-COMMON-NOUN / HINT-PC-SOCIAL | WRONG-DETAIL | The longest move name in the hint won ("battle" over "Heal"), and the reconciled move skipped the fellow-PC guard → the move written as a move, else the last named; `reconcileSuggestedMove(…, guard)` |
| W37 ROSTER-LOST-CONNECTION | LOSE-PLOT | The sector roster offered a severed connection as reuse-first cast → listed apart, "connection lost: <how>" leading its line |

Decided by the maintainer (2026-11-03): W19 — under the Chaotic dial the
Trickster may roll a stat the move does not list (the audit's probe for that
case stays failing by design); Lawful and Balanced hold a move to its list.

Open — found while fixing, not fixed:

- **FORCED-MOVE-HOLD-RELOAD** (LOSE-STATE, low). A forced move held for the
  *Still open after the v1.8.1 open-item sweep:* Deferred: a large cross-area refactor. The item spans every in-memory hold queue: free-flow deferred forced moves and session holds, and re-held refused claims (index.js _deferredForcedMoves), plus Batch Mode's next-round and free-flow holds and held sheet rolls (driver.js _heldForRound / _heldForFreeFlow / _sheetRolls). Fixing it needs a stored hold record per held message (stamp, unstamp on run), a canonical-GM re-queue at ready and on GM departure, de-duplication against the AB06 hand-over relay, and re-parsing sheet-roll outcomes. That is heavy, double-roll-sensitive churn in index.js and driver.js, which other areas also edit. No proposal is written in the entry.
  move lock (W02) waits in the canonical GM's memory: a GM reload while it
  waits loses it, and its claimed card stays claimed. Sharpened by the
  eleventh audit (issue #342, seven auditors): Batch Mode keeps two more holds
  in that memory alone — a card move held for the next round (Z05 holds more
  of them) and an entry's offer — lost the same way. Issue #345 adds two: a
  sheet roll held for the next round (D1 — its payoff already applied, so a
  reload loses its narration) and a held move re-held after a refused claim
  (AA48).

### Bug audit after #320 (issue #322, part 2 of 2) — all thirty-four fixed in the v1.7.36 cycle

Found by the seventh bug audit (2026-10-31) of `6455e01`: the 29 UX,
documentation, rare and latent findings (V05–V33) and the four that needed a
decision (V01–V04), with V34 — TRUTHS-TWO-STORES, found while fixing #321.
The maintainer decided V01–V04 and V34 on 2026-11-01 (decisions.md). Each
fix carries its own regression tests, converted from the audit's probe where
it had one (`tests/probes/` on branch `claude/sweet-wozniak-td294f`), which
fail with the fix taken out (`docs/testing/fix-sensitivity.md`). None has
been checked in a live Foundry world yet. The ones to try: a bonded Develop
Your Relationship weak hit, typed and with `!bond` (V01); a Secure an
Advantage pick, then the next move's roll (V02); two PCs in one fight, one
in a bad spot (V03); `!recap session N` mid-campaign (V05); Stop while a
card loads and Pause between its segments, and auto-play on a new device
(V14, V15); a sector map on The Forge (V26); and truths saved in the
`!truths` dialog, then `!narrator debug` after the next move, in a world set
up before the fix (V34).

| Code | Class | Defect → fix |
|---|---|---|
| V01 BOND-WEAK-HIT-SPLIT | WRONG-DETAIL | A bonded Develop Your Relationship weak hit paid 1 bonds tick through the pipeline (a decisions.md fill-in) and +2 momentum through `!bond`, whose relay clamp made any tick count 2 → both pay the move's text from `BONDED_DEVELOP_OUTCOMES` (strong 2 ticks, weak +2 momentum, miss nothing; rank +1 on a strong hit with a match); `!bond` relays the roll, not its effects |
| V02 NEXT-MOVE-BONUS-DEAD | PRODUCED-BUT-DEAD | "+1 on your next move" posted a reminder whose `nextBonus` flag nothing read, and the strong hit dropped it → `campaignState.nextMoveBonuses[actorId]` granted by the pick and the strong hit, added to the roller's next action roll and claimed on the store first (`nextMoveAdd.js`) |
| V03 COMBAT-POSITION-PER-FIGHT | ATTRIBUTION | One position per fight steered every roller: one PC's bad spot remapped another's Strike and downgraded their Take Decisive Action → the track holds `positions[actorId]`; the roller's own drives the directive and the downgrade (`combatPositionFor`), the fight's as a fallback; [4j] names each |
| V04 BURN-COUNTS-OUTCOME-MOMENTUM | WRONG-DETAIL | Burn eligibility counted the replaced outcome's own momentum ("6 → Strong Hit" at 5 after a weak hit's +1) → the burn state records `outcomeMomentum`; offer, preview and burn use the pre-outcome value plus what a miss's Pay the Price took |
| V05 RECAP-SESSION-NUMBER-DROPPED | WRONG-DETAIL | `!recap session 3` dropped the 3 and recapped the current session; a burned move listed its superseded outcome; every narrator card counted as a move → N resolves by the cards' `sessionNumber` (else last session's summary); the recap reads `sessionNarratorCards(…, { forRecap })` and counts cards with a `moveId` |
| V06 HELP-SETTINGS-UNREACHABLE | UX | Settings the help places in the panel were `config: false` with no control — Narration Max Tokens, Scene Interrogation ×3, Chronicle ×2, World Journal ×8 (the audit's seven and the Private Channel switch), Ship Positioning ×4, Audio Cache Max — and two stated defaults were stale → 18 rows on the Narrator and Mischief tabs, clamped on save; Narration Max Tokens 16000, audio on; Audio Cache Max removed (V16) |
| V07 HELP-RANK-TICKS-WRONG | UX | The help's "Ticks per mark" listed boxes; the First Session walkthrough made a vow in the Progress Tracks panel; buttons "in Token Controls" → corrected copy |
| V08 INTERP-NUMBERS-TRUSTED | WRONG-DETAIL | The interpreter copied the model's `adds` / `statValue` unchecked: a string concatenated ("31", a strong hit), a number stacked on the dialog's adds, an unresolved progress move scored the model's number → none kept; an unresolved progress move scores 0 |
| V09 NARRATION-THROW-SKIPS-PERSIST | LOSE-STATE | A refused narration card and fallback rejected out of the pipeline before `persistResolution`: the move card showed a hit nothing applied → the rejection is caught and reported, and the result persists |
| V10 SECTOR-SWITCH-KEYWORD-PREFIX | UX | `!sector New Hope` opened the Sector Creator (`new` matched as the first word) → `new` / `list` are subcommands only as the whole argument |
| V11 PANEL-CONN-PROGRESS-DEAD | PRODUCED-BUT-DEAD | The Entities panel's Progress row read `connection.progress`, which nothing writes → reads `relationshipTicks` and the rank |
| V12 CLOCKS-PANEL-STALE | UX | An open Clocks panel and a scene challenge's tension line re-rendered only after their own buttons → each re-renders on the campaignState hook when its clocks changed (local-only, `hookGates` LOCAL_ONLY) |
| V13 AUDIO-ERROR-NO-RETRY | UX | A failed play disabled the button until a re-render, though its message says to try again → the error state stays clickable |
| V14 AUDIO-STOP-WHILE-LOADING | UX | Stop during synthesis stopped nothing; a Pause between segments played the next as it loaded (AUDIO-PAUSE-GAP-IGNORED) → a load generation per card that Stop bumps; a segment loaded during a pause waits |
| V15 AUDIO-AUTOPLAY-OLD-CARD | UX | Auto-play claimed any card missing from this browser's played-list, so a new device's first click played an hours-old narration → only cards stamped after this client's start (server time, a minute's margin) |
| V16 AUDIO-CACHE-CAP-DEAD | PRODUCED-BUT-DEAD | The 200 MB cap's sweep browsed and HEADed the whole cache, then deleted through a FilePicker method v13's client lacks: it evicted nothing → sweep, throttle, `audio.cacheMaxBytes` and the help row removed; the help says to trim by hand |
| V17 NPC-TAG-UNCLOSED-LEAKS | WRONG-DETAIL | Half an `<npc>` pair (a reply cut mid-line, a stray close) showed on the card and was spoken → removed; text after an unclosed open tag is the NPC's line |
| V18 NARR-CARD-UNESCAPED | WRONG-DETAIL | Narration, paced and `@scene` cards put prose in unescaped: "<signal lost>" vanished → `escapeHtml(stripMarkup(…))`, the question too |
| V19 RELEVANCE-UNICODE-BOUNDARY | LOSE-PLOT | Name matching used ASCII `\b`: "Zoë", "Élise" never matched (no card, ledger facts out of scope) → `wholeWordPattern` with the `u` flag |
| V20 SPOTLIGHT-FRAME-NAMES | WRONG-DETAIL | The spotlight counted a PC only by its exact full name in the scene frame → a full name, or a first / last name no other PC shares |
| V21 PACE-OVERRIDE-OUTLIVES-SCENE | WRONG-DETAIL | `!pace hot` / `quiet` lasted until `!pace clear` though documented per scene → `endScene` clears it, and `startScene` replacing an empty scene |
| V22 PACED-CARD-NO-ENTITIES | PRODUCED-BUT-DEAD | Paced cards stamped `matchedEntityIds: []`, so the NPC voice picker found no one → the scene's matched entities, as the move card |
| V23 CLOCK-BEAT-VIGNETTE-ROLE | WRONG-DETAIL | A clock advance was narrated in the session-vignette role ("the calm before") → a `clock_advance` mode (interaction latitude); `vow_swearing` gets embellishment |
| V24 ENCOUNTER-TOKEN-OFF-CENTRE | UX | `!sfc encounter` placed the foe at half the padded canvas by its top-left → centred on `scene.dimensions`' rectangle by its size |
| V25 ART-ASSET-NAME-LOOKUP | LOSE-STATE | The Art Cache fast path found an asset by its recorded journal name, with no fallback: a rename hid the portrait → the entry the name finds must hold the asset, else the flag scan |
| V26 SECTOR-ART-UPLOAD-FAIL-PATH | WRONG-DETAIL | v13's `FilePicker.upload` resolves `false` / `undefined` / `{}` on failure; four uploads fell back to the built path (a black map "generated") → `net/uploadResult.js` `uploadedPath` |
| V27 SECTOR-NPC-ROLLS-DROPPED | LOSE-PLOT | The sector connection's rolled disposition and first look were not passed to `createConnection` → passed; Finalise reuses them |
| V28 CUSTOM-ORACLE-LINES-DROPPED | LOSE-STATE | Custom oracle lines with an en-dash range or "00" were dropped silently, shrinking the die → any dash, "00" = 100, and a table with an unreadable line is refused, the lines listed |
| V29 CONN-MIGRATION-DELETES-BEFORE-PERSIST | LOSE-STATE | The migration deleted each legacy journal before its id swap was saved → the swap is saved first (owned field), then the deletes; a rerun reuses its card |
| V30 REGENERATE-STRIPS-NOTES-PORTRAIT | LOSE-STATE | ↻ Regenerate flavour rewrote Notes without the embedded portrait, which generate-once never re-attached → the seeds keep the old Notes' portrait block (`art/notesPortrait.js`) |
| V31 FACTION-PAGE-BODY-STALE | WRONG-DETAIL | A faction's or creature's page body was rendered once, at creation → `rerenderEntityPageBody` on every record write |
| V32 SHARED-VOW-SYNC-LOST-UPDATE | RACE | A change to a shared vow copy during a sync pass was dropped or reverted → per-vow queue of the newest value per field; only differing fields written; mirror writes marked |
| V33 CHRONICLE-TYPE-SELECT | UX | The GM's type select lacked the automatic writer's `discovery` / `moment`, showing them as "Revelation", and the re-type refused them → `CHRONICLE_ENTRY_TYPES` is the union (`CHRONICLE_AUTO_TYPES` + hand-set); an unlisted stored type is offered, selected |
| V34 TRUTHS-TWO-STORES | WRONG-DETAIL | The WORLD TRUTHS block and `getTruth` read `worldTruths`, which only the Quickstart wrote; a dialog save reached `!lore` alone → `recordSystemTruths` parses each save into `worldTruths` as it links the journal; `reconcileSystemTruths` brings an older world up to its newest save at load; `!lore`'s repair links with the truths |

Decided by the maintainer (2026-11-01): V01 pays the move's text on both
paths; V02's +1 is applied automatically to the roller's next action roll;
V03's position is per character; V04 burns the pre-outcome momentum; V34's
revised truths propagate to the narrator.

Open — found while fixing, not fixed: *(none left — resolved in the v1.8.1 open-item sweep; see its table at the top)*

### Bug audit after #320 (issue #321, part 1 of 2) — all sixty-eight fixed in the v1.7.36 cycle

Found by the seventh bug audit (2026-10-31) of `6455e01`, with a probe per
finding (`tests/probes/` on branch `claude/sweet-wozniak-td294f`); every #321
probe failed on `15f157d` before the fixes. Each fix carries its own
regression tests, which fail with the fix taken out
(`docs/testing/fix-sensitivity.md`). After the fixes eleven #321 probes still
fail, each on how it builds its case, not on the defect: a probe that asserts
the old cap (U15), a single-client relay (U10), a removed internal (U42), a
DialogV2 double without events (U06e / U38), the bug's own precondition (U34),
inputs production never passes (U02, U18), a hook called without the
creation's options (U47), a ship created outside the draft Confirm (U26), the
old hash-only audio signal (U60) and a coverage map that predates the new
Ultra-scale table (U63); the regression tests drive the real paths. Part 2,
issue #322, is above. None has been checked in a live Foundry world yet. The
ones to try: a solo GM raising a stat on the sheet and rolling (U01); two open
vows and 🏁 Attempt to Fulfill Vow (U02); a Pay the Price miss's card against
its narration (U03); a player marking a track and pinning a detail in the
panels (U05); an X-Card played over a narration, then Resume (U07); the
Private Channel during an X-Card and as a default Player (U09, U10); a session
left open across a Foundry restart (U12); creating a second sector, and
dragging the ship onto a renamed settlement's pin (U46, U47, U52).

| Code | Class | Defect → fix |
|---|---|---|
| U01 SOLO-SNAPSHOT-STALE | WRONG-DETAIL | The `updateActor` hook cleared the snapshot cache (no TTL) only when `actor.hasPlayerOwner` — false for every solo or GM-run PC: after the GM raised iron 3 → 4 the card still read "+iron (3)" and the narrator kept the old health and pronouns → every `updateActor` invalidates this client's cache; the owner gate stays only on the momentum recalc |
| U02 FULFIL-VOW-NO-TARGET | WRONG-DETAIL | "🏁 Attempt to Fulfill Vow" sent no target and enrichment scored against every PC's vows, so with a shared vow's copies, two PCs' vows or a background + inciting vow the score was 0 (a certain miss) → `milestone.selectFulfilVow` (a picked copy by id; a name, the roller's first; one vow per `vowId`, the roller's copy); `readVows` carries `vowId`; with several distinct vows the pipeline posts a "Which vow?" card (`postWhichVowCard`), whose pick relays `fulfilVow.pick` → `applyFulfilVowPick` (owner or GM, claimed once, posted as the roller) |
| U03 PTP-DOUBLE-ROLL | WRONG-DETAIL | `buildOracleSeeds` rolled Pay the Price to seed the narration and the card / suffer route / clocks rolled again: "a trusted ally is put in harm's way" narrated, "you are separated…" paid → a result that routes Pay the Price gets no seed roll (`routesPayThePrice`); the pipeline seeds the card's own result (`withPayThePriceSeed`); Face Defeat's seed case is gone (`postFaceDefeatPayThePriceCard` returns `{ reversals, price }`) |
| U04 FORCED-MOVE-FIRST-STAT | WRONG-DETAIL | A forced move (the pacing "Roll ⟨move⟩", way-out, Battle buttons) rolled `move.stat[0]`: Face Danger / Secure an Advantage / Enter the Fray / Gain Ground always +edge, Heal +iron → `enrichForcedMoveStat` runs a stat-only reading (`interpretMove` with `expectedMoveSlug`, now honoured: "MOVE ALREADY CHOSEN", the move's stat list) on the canonical GM's key; no key / failure / an unlisted stat keeps the first stat; the rationale shows in the confirm dialog |
| U05 PANELS-PLAYER-WRITES | GM-GATE | The Progress Tracks and Entities panels (toolbar: Everyone) wrote GM-owned documents from the clicking client (the tracks journal is `ownership: NONE`): every player edit was refused, Pin / Remove silently → GM_ACTIONS `progressTrack.edit` (add, mark, clear, complete, position, remove) and `entity.edit` (lock, pin, promote, remove), validated against what the panel offers, run on the canonical GM; a missing GM or a refusal is reported; `loadTracks` no longer creates the journal; `mutateGenerativeTier` deleted |
| U06 STALE-SNAPSHOT-WRITERS | SAFETY | Seven writers held `campaignState` across an await and wrote it whole (rules/reachability.md §9): (a) `!lore`, (b) `!truth` / `!state` strike, (c) `!reveal-site` / `!clear-site`, (d) the inciting premise, (e) the correction dialog (a snapshot from when it opened), (f) `startScene` trusting a stale caller, (g) `loreRecap` missing from `STORE_OWNED_FIELDS` — an X-Card undone, a released lock written back, Private Lines dropped, a recap reverted, a second scene minted over the first → each writes only its owned fields onto the latest store (`mergeOwnedFields`, `persistSceneLedgerFields` with `opts.onto`, `persistSiteFlag`); `markSummaryForRegen` marks the stored summary; `loreRecap` is store-owned; `startScene` adopts the store's active scene when its caller holds none |
| U07 XCARD-CONTENT-REMEMBERED | SAFETY | `suppressScene` marked nothing and `sessionNarratorCards` had no X-Card exclusion: after Resume the X-carded beat stayed in RECENT SCENE, the rolling summary and the ledger entries its sidecar wrote → every narration has an id (`newNarrationId`), stamped on its card (`narrationId`) and its ledger entries; the pause write runs `applyXCardToNarratorMemory` — the narration on screen (the newest narrator card still in memory, plus the cards of the same beat: after the last message someone sent, within 2 minutes) has its truths retracted (`retractedBy: "xcard"`, never named under CORRECTED), its state and frame removed, the summary reset if it covered it, its id in `xCardedNarrationIds`, and `xCardRedirect` set; `flagXCardedCards` sets `xCarded`, which the ring, summary, recap prose and audio skip; the first narration after Resume renders "X-CARD — REDIRECT" ([1b]) and `registerXCardRedirectHook` clears it (maintainer decision 2026-10-31: full exclusion) |
| U08 MOVE-NARRATION-STALE-SAFETY | SAFETY | Move narration rendered Lines, Veils, Private Lines and RECENT ORACLE RESULTS from the pipeline's pre-dialog snapshot: a Private Line added while the move waited was missing from that narration → `buildNarratorExtras` reads `extras.safety` and `extras.recentOracles` from the store (the caller's copy as fallback); `buildNarratorSystemPrompt` renders the live safety block |
| U09 PRIVATE-CHANNEL-XCARD | SAFETY | Neither the private narrator nor Publish read `xCardActive`: during a pause Publish posted canon narrator cards into the ring and summary → `requestPrivateNarration` refuses on entry while the live flag is set and discards a reply when the card is played mid-call (`isXCardActive` / `watchXCard`, now exported); `publishToMainChat` refuses with `XCARD_PUBLISH_REFUSED`; the window says why (maintainer decision 2026-10-31) |
| U10 PRIVATE-JOURNAL-PLAYER-CREATE | LOSE-STATE | The transcript journal was created on the player's client; a default Player lacks Create Journal Entries, so every flush failed and the conversation was lost on close or reload → GM_ACTIONS `privateChannel.createJournal` → `applyPrivateJournalCreate` creates the requester's own journal (player OWNER, GM OBSERVER); the player's flush waits up to 15 s for it, else the turns stay buffered for the retries; a GM, or a table with no GM, creates locally |
| U11 NATIVE-ROLL-KEYLESS | WRONG-DETAIL | A vow / connection progress roll from the vendor sheet was narrated on the roller's client with no key check: a keyless player got "Narration unavailable" with a keyed GM online → `nativeRollNarratesHere` applies the `RUN_ON.CLAUDE` rule (a keyed GM → the canonical GM, else the roller); `narrateResolution` gets `speakerActorId` from the roll card; `planNativeRollNarration` takes `narratesHere` |
| U12 SESSION-GATE-CARRIES-OVER | WRONG-DETAIL | `mintSession` never reset `sessionActive` / `sessionActiveStartedAt`, so a session rolled over after Foundry closed without End Session showed "Active · 10260 min", Begin disabled, and skipped its clocks, vignette and foci → the mint closes the gate (both fields in `SESSION_MINT_FIELDS`); Begin a Session opens it with a fresh stamp; a mid-session reload mints nothing |
| U13 SECTOR-LIST-WIPED | LOSE-STATE | `rewriteSectorOverviewSettlements` read `sector.settlements`, which the stored record never has: a settlement Actor's rename / type / population / authority edit, and every `!migrate-entities`, wrote `<ul></ul>` over the Sector Record's list → `buildSettlementsListHtml` lists `mapData.settlements` in map order, each row from the Actor `entityJournalIds` resolves to |
| U14 SEVER-FALLBACK | WRONG-DETAIL | `!sever` resolved through the develop ladder's sole-bonded / sole-active fallback: `!sever Vexx` or a bare `!sever` severed the only bond and posted a public card → `selectConnection(…, { strict: true })`: a name matches exactly or as a substring, else nothing; a bare command only when exactly one connection is active |
| U15 DETECTION-TRUNC-SILENT | LOSE-PLOT | The combined detection reply was capped at 600 output tokens and `stop_reason` never read: a busy narration overflowed, `JSON.parse` failed and every entity, rename, lore item, threat, faction and location was dropped silently (the NARRCHK-TRUNC-SILENT shape) → `DETECTION_MAX_TOKENS` 1500 (the tier pass keeps 600); `callHaiku` warns on `max_tokens`; a non-empty reply holding no JSON object warns and raises `notifyDetectionFailure` |
| U16 PHANTOM-TRACK | WRONG-DETAIL | With two fights or expeditions open, an unnamed Strike / Clash / Undertake created and marked a new "Combat" / expedition track (the selector returned null for both "none" and "ambiguous") → `applyCombatProgress` creates only when no fight is open (`beginsFight` for Enter the Fray's threshold card), `applyExpeditionProgress` when none is open or a named destination matches none; ambiguous → the "Which fight?" / "Which expedition?" card (`postWhichFightCard` `trackType`); a track named by id is that track or nothing |
| U17 WAYPOINT-MISS-NO-PTP | WRONG-DETAIL | `explore_a_waypoint`'s miss set no `routePayThePrice`: no card, suffer route or clock tick (recorded in the #316 section as WAYPOINT-MISS-NO-PTP) → the miss routes Pay the Price unless it is a match, whose "may instead Confront Chaos" stays the player's choice |
| U18 FRAY-MOMENTUM-NO-POSITION | WRONG-DETAIL | Enter the Fray's weak-hit +2 momentum set no position, so no bad-spot directive and no Take Decisive Action downgrade → the option is the chain `[{ momentum: 2 }, { combatPosition: "bad_spot" }]`, landing where "You are in control" does |
| U19 COMBAT-POSITION-DRIFT | WRONG-DETAIL | The tracker badge wrote the Combatant flag and the actor but not the track (what the interpreter, TDA and the narrator read); the panel toggle wrote only the track → both go through `applyCombatPositionToTrack` (now accepting `null`), track first; a refused track write rejects and leaves the mirrors; the toggle mirrors to the clicker's own PC (`actorId` on the `position` op) |
| U20 SUGGESTION-BUTTONS-REPEAT | DUPLICATE | "⚑ Mark Progress on Vow" and "🔁 Recommit" were disabled only in the clicker's DOM; another client or a re-render applied them again (16 ticks for 8; a rank raised twice); `milestoneMarked` was read, never written → GM_ACTIONS `milestone.suggestion` (`applyMilestoneSuggestion`: claims `milestoneMarked`, posts as the roller; roller's owner or GM) and `expedition.recommit` (`applyRecommitOffer`: claims `recommitted`, runs the now-exported `performRecommit`); the raw recommit socket and `registerRecommitSocket` are deleted |
| U21 NATIVE-BOND-NOT-NARRATED | WRONG-DETAIL | The native-roll narration hook accepted subtypes `vow` / `connection`, but vendor connection Items are `bond`: a sheet Forge a Bond was paid, never narrated → `nativeProgressSubtypeLookup` (accepts `bond`) is shared by the narration and consequence hooks |
| U22 CV-READY-SCAN-DEAD | LATENT | `registerCommandVehicleHook`'s `Hooks.once("ready")` was registered while "ready" was dispatching, so the load-time reconcile never ran → the reconcile runs directly from the ready handler (canonical GM, idempotent) |
| U23 FIRST-PC-ATTRIBUTION | ATTRIBUTION | The bond Item for Make a Connection / draft Confirm / a vow's target, the oath scene, an unbound player's Private Channel and the toolbar Chronicle resolved "the first PC" → `speaker.resolveUserActorId` (User#character if a PC → an owned PC → the first PC only for a GM or a single-PC world); the narration's PC rides `runPostNarrationPasses` / `schedulePacedDetection` / `scheduleNarrationCapture` to the draft card (`actorId` flag); `registerConnectionOnActiveCharacter(record, { actorId, actors })`; a shared vow's target is registered on every PC who swore it; `narrateVowSwearing` takes `speakerActorId`. CHRONICLE-FIRST-PC (the automatic writer) stays open |
| U24 SPEAKER-BOUND-NON-PC | ATTRIBUTION | `resolveSpeakerActorId` returned the user's `User#character` with no PC check: a user bound to the ship or an NPC rolled with its stats and wrote to it → the bound character is PC-validated like the selected token, else the ownership scan |
| U25 DRAFT-CONCURRENT-CONFIRM | DUPLICATE | Confirm / Dismiss copied the card's `drafts` at the click, awaited the creation and wrote the whole copy back: two rows resolved together reverted one to pending, whose next Confirm duplicated the NPC → `setDraftStatus` serialises per card, re-reads the live rows and changes only its own; Confirm first checks `entityExistsForName`. DRAFT-CONFIRM-TWO-GMS stays open (narrowed) |
| U26 LONE-SHIP-NPC-DRAFT | WRONG-DETAIL | With no ship flagged `isCommandVehicle`, confirming a detected NPC ship broke the lone-ship fallback: Withstand Damage +0, no repair / position target, SHIP POSITION gone → the draft Confirm creates detected ships `npcShip: true` (new ShipSchema field); `isLoneShipCandidate` excludes them in every fallback (`getCommandVehicle`, `getCommandVehicleActorId`, abilityScanner, `buildShipPositionLine`, shipEnvision, Campaign Start) |
| U27 RENAME-DROPS-NEW-NAME | LOSE-PLOT | A rename's target was removed from the entities before checking that its `from` matched a placeholder: "hooded figure → Vex" with no card dropped Vex → the target is dropped only when `from` names a recorded placeholder (`findPlaceholderConnection`, shared with `applyEntityRenames`) |
| U28 FACTION-CONFIRM-ATTITUDE | WRONG-DETAIL | The faction draft Confirm mirrored `attitude: "unknown"` (and `record._id`) into the World Journal, overwriting an established attitude → no attitude passed; `entityId` is the host JournalEntry id (`findFactionByName`) |
| U29 AUTOSEED-DOUBLE-PORTRAIT | DUPLICATE | With `autoSeedConnection` on, the `createActor` seed and the creator's `postCreationEnrichment` both generated a portrait (billed twice) → the creator skips a connection the seed hook owns (`seedHookOwnsPortrait`); the seed uses the creator's description |
| U30 DEDUP-TITLES | WRONG-DETAIL | `normalizeEntityName` stripped only `HONORIFIC_PREFIXES`, so "Dr. Chen" / "Lyssa Chen" were offered as new NPCs → it also strips a leading `NAME_TITLE_ROLES` title (`roleTitleFromName`) |
| U31 STARSHIP-ICON-PATH | WRONG-DETAIL | `pickStarshipIcon` built `Starforged-Starship-Token-NN.webp`; the system ships `assets/starships/Ship-NNs.webp`: every created ship's image and token was broken (and `ironswornAssets.test.js` pinned the wrong name) → `Ship-${num}s.webp`; a test checks every picked path exists in the vendored system |
| U32 ENCOUNTER-CARD-EMPTY | WRONG-DETAIL | `buildEncounterCard` read rank and features from `actor.system`; a vendor foe keeps them on its embedded `progress` Item: the card was `<h3>Name</h3>` → reads the progress Item (`foeProgressItem`): rank by name (`rankName`) and the Features / Drives / Tactics description |
| U33 PORTRAIT-PLAYER-CLICK | GM-GATE | A player's Generate / Regenerate ran on the player's key and the store was refused, discarding the paid image → `generatePortrait` / `regeneratePortrait` return null off a GM client before any request (`canKeepPortrait`); the panel shows the buttons to GMs only (relay rejected: the key, the store and the one regeneration are the GM's) |
| U34 SIDECAR-NO-SCENE | LOSE-STATE | The oracle follow-up, session vignettes, clock vignette and vow scene wrote sidecar facts with no scene open; the next move ended that phantom scene, discarding its state and frame (NARR-INCITING-SCENE, fixed for the inciting incident only) → `ensureSceneStarted` at the entry of every sidecar-writing narration |
| U35 FALLBACK-IN-RING | WRONG-DETAIL | `postFallbackCard` carries the narrator flag family and `sessionNarratorCards` had no exclusion: "…narration unavailable" reached RECENT SCENE and the summary, and a failed first narration cancelled the campaign recap (narrator-memory invariant 1) → `sessionNarratorCards` excludes `narrationFallback` cards; the fallback keeps its flags (the session recap counts the move) |
| U36 SCENE-CAPTURE-UNGATED | GM-GATE | `interrogateScene` ran the detection and tier passes with no canonical-GM gate; at a keyless-GM table they ran on the asking player and their writes were refused → `scheduleSceneAnswerCapture` runs them on the canonical GM only (the answer's sidecar still relays) |
| U37 CLARIFY-PICK-NO-ID | WRONG-DETAIL | The clarification dialog resolved connection options through `game.journal`; connections are Actors, so every pick gave `entityIds: []` → options carry the host Actor id (`getConnection`); `resolveJournalId` deleted |
| U38 CORRECTION-DIALOG-RENDER | WRONG-DETAIL | (Foundry) The correction dialog passed `render` to the `DialogV2` constructor (a `wait()` option), so the Strike / Replace handlers never attached and the untyped buttons submitted the form → the handlers attach on `dlg.addEventListener("render", …)`; the row buttons are `type="button"` |
| U39 RETRACTION-OVERREACH | WRONG-DETAIL | Lore retraction matched a substring of the fact alone ("Vance — Is dead" retracted the dockmaster's "Is dead"); session retractions deduped by fact, losing a second subject's strike → `loreStatesStrike` requires the struck subject (the label for an archived truth, the name as whole words elsewhere); `factsOverlap` is whole-word; dedup on (label, fact) |
| U40 LORE-RESTORE-STAYS-STRUCK | LOSE-PLOT | `!journal lore "…" confirmed` wrote no `retracted`, and `setFlag` merges, so restored lore stayed hidden; its text, category and provenance were reset → `recordLoreDiscovery` always writes `retracted` / `retractedAt` and keeps stored text and category; the command passes `retracted: false` and the entry's provenance |
| U41 SIDECAR-BARE-FENCE | SAFETY | Only ```` ```json ```` fences were recognised: a bare fence put the raw sidecar on the card for every player, into `narrationText`, and dropped the turn's facts → a complete fence tagged `json` (spaces allowed), or an untagged one whose body opens with `{`, is the sidecar and is stripped; an unclosed tail is parsed (complete → applied; truncated → parseError) |
| U42 PRIVATE-TRANSCRIPT-SPLIT | LOSE-PLOT | The Private Channel kept a display copy (`resumedHtml`) and a narrator copy: after reopening, the narrator got only the new turns; the first exchange rendered twice → one structured transcript; the saved page is read back once on open (`parseTurnsHtml`) |
| U43 SHIP-POSITION-WORD-SCAN | WRONG-DETAIL | The word scan matched lowercase name parts ("a derelict station above Kaan" → Bleakhold **Station**) and a non-spatial hit replaced the narrated phrase → only capitalised words, through `resolveEntityName`'s ladder; a non-spatial hit keeps the seed as free text |
| U44 CLASSIFIER-CONNECTIONS | WRONG-DETAIL | `formatConnections` read connections from `game.journal`: always "names unavailable", so the addressee-is-a-Connection rule never fired → `getConnection(id)` |
| U45 CLASSIFIER-MOVE-NAME | WRONG-DETAIL | The classifier was allowed "move name or move id"; a display name became `forcedMoveId` ("Unknown move") and slipped past the PC-directed social-move suppression → `toMoveId` (schemas.js) maps to a `MOVES` key or null in `parseDecision` and the suppression; the prompt asks for the catalog id |
| U46 SECTOR-CREATE-DOUBLE-CLICK | DUPLICATE | "✓ Create Sector" had no busy guard: a second click duplicated every Actor, the journal and the scene → a busy flag released in `finally`, the buttons disabled, and `runSectorCreationPipeline` idempotent per sector id (joins a run in flight; returns a stored sector) |
| U47 NEW-SECTOR-MOVES-SHIP | WRONG-DETAIL | Each new sector's auto-placed command-vehicle token was read as a position statement, moving the ship out of its sector → `placeCommandVehicleTokenIfPresent` uses `POSITION_SYNC_OPTION` when the ship already has a position |
| U48 SITE-LADDER-WRONG-SITE | WRONG-DETAIL | `selectSectorSite`'s exact and substring rungs weren't scoped to the active sector, and an ineligible linked / exact site fell through to guesses ("…II" contains "…I") → each rung tries the active sector first; an exact name or a link resolves to that site or null |
| U49 MIGRATE-DELETES-GM-PAGES | LOSE-STATE | `cleanupSectorRecordPages` deleted every non-overview page of a Sector Record, a GM's included → only a page named for one of the sector's settlements, in the legacy layout, with its Notes still the generated placeholder |
| U50 ZOOM-IN-NOT-ROLLED | WRONG-DETAIL | Step 8 ("zoom in on the starting settlement") wasn't rolled: trouble, first look and initial contact empty though the prompts read them as rolled → rolled for `settlements[0]` and forwarded to its Actor; the stub prompt, the settlement card ("Initial contact") and the wizard show them |
| U51 SECTOR-PLANETS-DARK | WRONG-DETAIL | Rolled planets were stored and pinned but never reached the narrator → the active-sector roster and the settlement card name the planet and stellar object (`formatSettlementPlanet`) |
| U52 TOKEN-DRAG-PIN-LABEL | WRONG-DETAIL | A drop set the course by the Note label (stale after an Actor rename), the arrival became free text, and the payload's destination ids were never read → the drop names the pin's Actor (`forcedMoveTarget` + `forcedMoveTargetId`); the arrival is recorded by id (`inferShipPositionFromEntityId`, also used by U56); `handleSettlementPinRename` renames the pins; the unread payload fields are gone |
| U53 OFF-PIN-DOCKED | WRONG-DETAIL | A token parked near a pin or auto-placed read "docked at" (decisions 2026-06-12) → `computeTokenPositionRecord` stamps `updatedBy: "token_placement"`, rendered "near"; an on-pin drop's arrival keeps `scene_token` |
| U54 DRAG-WITH-AUTOMOVE-OFF | WRONG-DETAIL | With Auto-Move or Ship Positioning off, every pin drop was cancelled and rolled, but the token never moved → the drag handler acts only when both are on; otherwise the drop is a plain move (the setting hint says so) |
| U55 SHARED-VOW-CLOCK-REPEATED | DUPLICATE | A shared vow's clock was reported per PC copy: three lines, three narrations, three "TRIGGERED" cards → `advanceClocksOnPayThePrice` lists and triggers one per `vowId`; every copy still advances, in lockstep (`advanceVowClocks` `lockstep`), so the sync hook never doubles a sibling |
| U56 PANEL-LOCATION-NO-SHIP | WRONG-DETAIL | The Entities panel's "Set as current location" didn't move the ship as `!at` does: contradictory CURRENT LOCATION and SHIP POSITION → it runs `maybeUpdateShipPositionFromName(…, "at_command", { entityId })`, resolving the place by id |
| U57 TRACK-LOST-UPDATE | RACE | Track writes were load → modify → whole-array save with no queue: a fast second click lost the first mark → `writeTracks(change)` serialises every track write on a client, each on a fresh read; `saveTracks` deleted |
| U58 CACHED-SETTING-MUTATION | WRONG-DETAIL | Handlers mutated the cached setting before writing: a refused write (Take a Break's +1, reported "not recorded") still applied on the GM and rode the GM's next write → each writes a copy: sessionDialogs (`applySafetyFlag`, `applyTakeBreak`), settingsPanel (safety sync, Private Lines, Lines / Veils add and remove), clocks (`addClock`, `mutateClock`, the tension-clock advance and revert), entityPanel (current location, undismiss), `!at`, `!sector <name>` |
| U59 AUDIO-DOUBLE-SYNTH | DUPLICATE | The GM's own playback and the player-request handler didn't dedupe: each segment synthesised and uploaded twice → `_synthInFlight` maps a clip hash to one promise (`synthesiseToCacheOnce`), dropped when it settles |
| U60 AUDIO-KEYLESS-BROWSE | GM-GATE | Keyless playback re-found the clip by browsing the audio folder, which a default Player can't: "not ready yet" every time → `audio.synth.done` carries the cached `path`, played directly when it ends in `/<hash>.mp3` |
| U61 END-VIGNETTE-SEVERED | WRONG-DETAIL | `selectEndSessionNPC`'s bonded tier ignored `active`, featuring a severed bond → requires `active !== false` |
| U62 VOW-RANK-NUMERIC | WRONG-DETAIL | `readVows` / `readConnections` passed the vendor's numeric rank: "(3, progress 2/10)" → mapped with `rankName()` |
| U63 ORACLE-TABLE-FIDELITY | WRONG-DETAIL | 20 of 129 registered tables differed from the vendored Dataforged data while still tiling 1–100: Make a Discovery on Confront Chaos's ranges, both derelict zone tables shifted, Outlands / Expanse missions aliased to Terminus, `BASIC_FORM_INTERIOR = BASIC_FORM_LAND`, and others → regenerated from `vendor/foundry-ironsworn/json-packs/starforged-oracles`, export names and shapes unchanged; the invented "Roll again (paired name)" join retired; `oracleTableFidelity.test.js` pins every table roll for roll |
| U64 ORACLE-ODDS-TWO-WORD | WRONG-DETAIL | `!oracle yes almost certain …` rolled 50/50 (one odds word checked); "small chance" left "chance" in the question → two-word odds are tried first |
| U65 TRUTHS-RESAVE-STALE | WRONG-DETAIL | Re-saving the `!truths` dialog made a new journal but `worldTruthsJournalId` stayed on the first, so `!lore` summarised superseded truths → the page hook re-points the id at each newly saved system truths page; the stale-id fallback picks the newest journal; both hooks write a copy |
| U66 TRUTH-SUBRESULT-DARK | WRONG-DETAIL | The WORLD TRUTHS block gave a truth's title without its rolled sub-result → appends the sub-table label and result |
| U67 QUICKSTART-TRUTHS-FLAGS | WRONG-DETAIL | `storeWorldTruths` set neither `worldTruthsSet` nor `worldTruthsJournalId` ("No World Truths have been established" on every load) and found its journal by name, overwriting a GM's own "World Truths" → both recorded (owned fields onto the latest store); the journal found by id or the module flag, the truths page by its flag |
| U68 ORACLE-DIRECTIVES-LITERAL | WRONG-DETAIL | "Roll three times", "Ships in conflict (roll twice)" and "Ultra-scale" came back as literal answers (~6% of new starships) → `resolveDirective` rolls them out; `ULTRA_SCALE` registered as `creature_ultra_scale` and followed in place |

Decided by the maintainer (2026-10-31): U07 takes the full exclusion (memory,
summary and facts, plus a one-shot redirect), and the Private Channel stands
down during an X-Card pause, both its narrator and Publish (U09).

Open — found while fixing, not fixed: *(none left — resolved in the v1.8.1 open-item sweep; see its table at the top)*

- ~~**XCARD-LATE-CAPTURE**~~ (SAFETY) — fixed (the tenth audit's open items,
  2026-11-05: every capture write checks the stored `xCardedNarrationIds`
  first). The detection and tier passes run about
  2 s after a narration; an X-Card played inside that window does not stop
  them writing lore and tier details from the removed prose (the X-Card
  undoes only what was written before it — `propagateRetraction`, and since
  issue #329 X01 `retractNarrationCapture`, by the narration id the records
  now carry; a capture that checks `xCardedNarrationIds` before writing would
  close this).
- ~~**END-SESSION-STALE-ENDSCENE**~~ (SAFETY) — fixed with the eleventh
  audit's open items (2026-11-06): every one of a scene end's migration
  writes checks the store's X-Card and strike state first and takes back a
  copy that landed as one was made (XCARD-DURING-SCENE-END-MIGRATES,
  STRIKE-DURING-SCENE-END-LOST), so End a Session's older snapshot no longer
  matters. End a Session ran `endScene` on its pre-await snapshot: a truth
  struck or X-carded during its awaits was migrated to tiers or lore anyway
  (the U06 class).
- ~~**CLOSEWORLD-STALE-WRITE**~~ (moot: the `closeWorld` handler is deleted —
  issue #326 D7), **MIGRATE-STALE-WRITE**, **LORE-ID-REPAIR-WHOLE**
  (SAFETY). `!migrate-entities` (`migrator.js` writes its
  whole state after awaits) and `callLoreRecapNarrator`'s journal-id repair
  (writes the caller's whole state) are the U06 shape at sites the issue did
  not list. `handleDraftDismiss` and the ready hook's truths fallback mutate
  the cached state before writing (the U58 shape). Since the eleventh audit's
  open items the migrator's writes are on the campaignState write chain
  (CAMPSTATE-CHAIN-REST) but still write its whole snapshot, and
  `handleDraftDismiss` writes a copy (CACHE-MUTATED-BEFORE-WRITE).
- ~~**AT-PARTIAL-NAME-SHIP**~~ (WRONG-DETAIL) — fixed with issue #342 Z15
  (2026-11-06): `!at` docks the ship by the resolved place's id. `!at Bleak`
  set the current location to Bleakhold but re-inferred the ship position
  from the typed fragment ("Bleak", free text).
- ~~**WHICH-FIGHT-LOCAL-DISABLE**~~, ~~**FULFIL-BUTTON-LOCAL-DISABLE**~~
  (DUPLICATE) — both fixed; the which-fight pick by PACED-ROLL-OPEN-PRESS (the
  tenth audit's open items, 2026-11-05: relayed `whichFight.pick`, claimed
  once, the roller's player or a GM). The "Which fight?" pick (now also for Strike, Clash and
  Undertake) was disabled only locally; a second client or a re-render
  rolled again. The fix is U02's relay-and-claim — which the 🏁 Attempt to
  Fulfill buttons now have (`fulfilVow.attempt`, fixed in the issue #329
  cycle).
- **CLARIFY-ON-GM** (UX). The "Who are you interacting with?" dialog is
  *Still open after the v1.8.1 open-item sweep:* Still real: ClarificationDialog.prompt runs inside rollMove on the canonical GM (src/moves/movePipeline.js). Putting it on the mover's client needs a new GM-to-player prompt protocol (request, answer, timeout, reconnect, all while holding the move lock), and none exists; the confirm dialog beside it is also the GM's by design. The Batch Mode variant needs the pick added to the Round window's reading, which is batch-area UI work. Too large for this batch, and it would conflict with the batch/multigm agents.
  prompted inside the move pipeline, which runs on the canonical GM, so the
  GM answers it, not the player who moved. Also asked on the GM during a
  Batch Mode round's rolls (the eleventh audit's refuted
  ROUND-ROLL-CLARIFY-DIALOG: issue #340's scope chose it), where the mover's
  Round window is already open with a reading to confirm.
- ~~**TRUTHS-TWO-STORES**~~ (WRONG-DETAIL) — fixed by issue #322 V34 (the
  maintainer decided revised truths propagate to the narrator). Each save of
  the `!truths` dialog is parsed into `campaignState.worldTruths` as its
  journal is linked, and a world saved before that gets them at its next
  load, so the WORLD TRUTHS block, the vow scene's Iron truth and `!lore` read
  the newest save (decisions.md, "Truths saved in the World Truths dialog
  reach the narrator").

### Bug audit after #315 (issue #316) — all six fixed in the v1.7.36 cycle

Found by the 2026-10-30 audit of `40cabee` (the merge of PR #312): its eight
probes (the six defects and two controls) reproduced locally on `6455e01`
(the merge of PR #319) before the fixes; after them the six defect probes
fail — their assertions pin the broken behaviour — and the two controls
pass, and each fix's own tests, which assert the expected behaviour, fail
with the fix taken out (`docs/testing/fix-sensitivity.md`). None has been
checked in a live Foundry world yet. The ones to try: a character with an
impact taking +1 momentum several times, and the sheet's momentum maximum
afterwards (T01); a legacy track at 38 ticks and a Make a Discovery (T02); a
scene challenge completed in the Progress Tracks panel, then a Pay the Price
(T03); an Explore a Waypoint strong hit with a match — the +2 momentum pick
and the 🔭 Make a Discovery button, in either order, and the card after a
chat reload (T05, T06).

| Code | Class | Defect → fix |
|---|---|---|
| T01 MOMENTUM-BASE-WRITEBACK | LOSE-STATE | `applyMeterChanges` and `recalculateMomentumBounds` wrote the effective momentum maximum and reset — the bases less the impacts — into `system.momentum.max` / `resetValue`, the base fields foundry-ironsworn's getters deduct the impacts from: with one impact, three strong hits took the maximum 9 → 8 → 7 → 6 and the reset to 0, and clearing the impact left 7 / 0 → the bases are never written; `momentumBounds` reads the effective values (the getters, else the vendor's formula over the sheet's bases) for the clamp, the snapshot and the burn preview; the recalculation only clamps momentum to the new maximum, with no write when it is within it |
| T02 LEGACY-CAP-NO-CLEAR | LOSE-STATE | `addLegacyTicks` capped a track at 40 ticks and nothing cleared it: from 38, the first discovery paid the tenth box's 2 XP and every later mark was discarded (40 / 40 / 40, 2 XP for good); the persist merge took the higher tick count, which would have undone a clear → `moves/legacyTracks.js`: filling the tenth box clears the track, which starts again with the overflow and counts its cycles (`{ ticks, cleared, cycles }`); each box is paid at the rate of the cycle it filled in (2, then 1); two copies merge by progress (`cycles × 40 + ticks`); `addLegacyTicks` returns `{ boxes, xp, cleared }` and the XP note says when the track cleared; a track frozen at 40 clears on its next mark |
| T03 SCENE-CLOCK-OUTLIVES-CHALLENGE | WRONG-DETAIL | Completing a scene challenge (the panel's ✓, `completeProgressTrack`) archived the track and left its paired tension clock active: the next Pay the Price advanced it 0/4 → 1/4 and posted a clock card naming the finished challenge; removing the track left the clock behind → completion retires the paired clock (`retireClock`: `active: false`, kept and shown as retired, skipped by every automatic advance); removal removes it (`removeClock`, shared with `!clock remove` and the panel's ✕); both run before the track write and are idempotent, so a refused clock write changes nothing and the press is the retry |
| T04 BEGIN-CLOCK-WRITE-LOST | LOSE-STATE | Begin a Session stamped the session begun, then its campaign clock advance's write was refused: the roll was caught and logged, the clock stayed at 1/6, no card said so, and a second Begin said "already begun" → `advanceCampaignClocksForBeginSession` keeps its rolls when the write is refused (`saved: false`, the error, the fill rolled to; written on a copy); Begin posts the clock card with the advance marked "not saved" and a `clocks` step on the GMs' payoff card (source `sessionClocks`), whose Retry saves each clock to at least its rolled fill (`applyClockAdvances`) — never rolled again, never advanced twice; the already-begun note names the clock still owed |
| T05 NO-ROLL-MOVE-ROLLED | WRONG-DETAIL | The resolver knew progress moves from everything else and rolled an action die for every other move: a forced Make a Discovery read "+null (0)", "Action: 1 + 0 = 1 vs 7, 8", Miss, and offered "Burn Momentum (9 → Strong Hit)", which spent momentum 9 → 2 on an outcome the rules never had; every no-roll move (Confront Chaos, Reach a Milestone, Pay the Price, the session moves …) rolled the same way → `schemas.js moveRollKind` ("action" / "progress" / "none") is the one classification the resolver, Take a Break's add, the card, the dice animation and the Burn / Improve offers read; a "none" resolution draws no dice and has `outcome: null` ("No roll"), its consequences apply as written; a stat the interpreter names on a no-roll move is ignored; a bonded Develop Your Relationship is marked `rollKind: "action"` by its enrichment |
| T06 WAYPOINT-REWARD-STACKS | DUPLICATE | The 🔭 Make a Discovery / 🌀 Confront Chaos button posted the forced move from the clicker's client and disabled only its own DOM button: the +2 momentum was taken, then the discovery on top (2 ticks), then — a chat re-render rebuilt the button from the unchanged flags — the discovery again (4 ticks, 2 XP) → the click relays to the canonical GM (`waypoint.oracle` → `applyWaypointOraclePick`), which claims the GM-authored card once (`waypointRewardClaimed: "alternative"`), posts the forced move as the roller (the move card's new `actorId`) and retires the pending ordinary choice card; the ordinary pick closes the alternative (`closeUpgradesForChoice` stamps "ordinary"); only the roller's owner or a GM may take it; a re-render or another client finds the claim; a post that fails releases it |

Open — found while fixing, not fixed (outside the audited paths): *(none left — resolved in the v1.8.1 open-item sweep; see its table at the top)*

- ~~**WAYPOINT-MISS-NO-PTP**~~ (WRONG-DETAIL) — fixed by issue #321 U17. `explore_a_waypoint`'s miss says
  "Pay the Price" on its card but sets no `routePayThePrice`, so — unlike
  Undertake an Expedition's miss — no Pay the Price card is rolled and no
  suffer route lands. Proposed: `routePayThePrice: true` on the miss, as for
  the other `PAY_THE_PRICE_ON_MISS` moves.

### Bug audit after #314 (issue #315) — all eight fixed in the v1.7.36 cycle

Found by the 2026-10-29–30 audit of `40cabee` (the merge of PR #312): its
thirteen probes (the eight defects and their controls) reproduced locally
before the fixes — at `b23d193` too — and pass inverted to the expected
behaviour after them. Each fix's tests fail with the fix taken out
(`docs/testing/fix-sensitivity.md`). None has been checked in a live Foundry
world yet. The ones to try: a move typed while another's "Apply asset
effects" prompt is open (S01); an asset with "you may mark progress" or a
"choose one" with progress, one track open (S02); a Repair that trades the
last supply (S04); a battered ship and an asset's "+1 integrity" (S05); two
PCs, and a Sacrifice Resources that takes the shared supply to 0 (S07).

| Code | Class | Defect → fix |
|---|---|---|
| S01 MOVE-LOCK-RELEASED-BY-OLDER | RACE | The pipeline released `pendingMove` before the rider prompt, and its `finally` released it again unconditionally: a move started while that prompt was open lost its lock when the prompt closed, and a third move entered the interpreter while the second was still resolving → `releasePendingMoveLock` returns whether the lock is free (false when its write was refused); the pipeline records that its own release landed (`lockReleased`) and its `finally` releases only when it has not — the throw / cancelled-confirm paths and a refused early release keep their safety net |
| S02 RIDER-PROGRESS-CHOICE-BYPASSED | WRONG-DETAIL | With one track open, the single-track shortcut marked every progress rider before the prompt — optional and "choose one" too: a "you may mark progress" was never offered, and "mark progress or +2 momentum" marked the track and then offered momentum alone, so choosing it applied both; `groupPromptedRiders` also pulled progress out of its choice group → the shortcut marks only a mark that is the outcome's own (neither optional nor in a choice group); a progress option stays in its group with its own track picker; one open track is preselected — it settles where a mark goes, not whether it is taken |
| S03 RIDER-PROGRESS-AMOUNT-LOST | WRONG-DETAIL | The extractor's contract counts progress in signed marks, but both progress writes called `markProgressById` without the amount (whose default is one mark, clamped ≥ 1): +2 marks gave 8 ticks on a dangerous track, -1 at 16 gave 24 → `adjustProgressById` (progressTracks.js) changes a track by signed marks within 0..40 ticks; `markProgressById` delegates to it; the rider path passes the amount |
| S04 REPAIR-TRADE-UNPREPARED | WRONG-DETAIL | Repair's supply trade debited the meter with `applyMeterChanges` alone: trading the last supply repaired the ship and left the PC at 0 supply, prepared, while the card said the supply was sacrificed → `markUnprepared` (sufferExecutor.js) is the zero-supply impact's one writer; the trade calls it once the payment is whole — after the pay-in-full check, so a refunded payment leaves no mark; a refused impact write leaves the payment and the repairs, and the card says to mark it |
| S05 RIDER-INTEGRITY-BATTERED | WRONG-DETAIL | `applyMeterRiders` wrote integrity with `updateShip` directly: a ship battered at 0 went to 1, still battered, and the card said "+1 integrity" → `changeIntegrity` (entities/ship.js) is the one writer for a consequence's or an asset effect's integrity change — a rise refused while the canonical native impact says battered, a loss always landing; Withstand Damage's helper delegates to it; a refused rise is "Not applied — the vehicle is battered", with no Retry |
| S06 RIDER-PROGRESS-FINISHED-TRACK | WRONG-DETAIL | The rider path counted `listProgressTracks()`, finished tracks included, and `markProgressById` has no finished guard: a sole archived expedition (completed, 16 ticks) went to 24 unasked and was named as the target → the rider path filters to open tracks before counting or offering them; a mark re-reads its track as it is written (finished or gone: not marked, and said); with no open track the effect is "Not applied — no open progress track" |
| S07 CREW-UNPREPARED-ONE-PC | WRONG-DETAIL | The crew shares one supply (the `updateActor` sync mirrors the number), but the zero-supply impact was marked on the PC who paid alone: two PCs at supply 1, one Sacrifice Resources, and supply [0, 0] came with unprepared [true, false] — "you and your allies … mark unprepared together" → `supplyAllies` (sharedSupply.js) is the one definition of who shares a PC's supply (the sync reads it too); `markUnprepared` marks those allies with the payer (their momentum bounds follow) — from Sacrifice Resources, Repair's trade, and a move's own supply loss (`persistResolution`, which wrote the impact itself); an ally's refused write is said on the card, never thrown; raising supply clears nothing |
| S08 RIDER-APPLIED-UNCOMMITTED | LOSE-STATE | The rider summary listed every effect asked for: a refused integrity write was caught and still listed, and the single-track progress shortcut discarded its write error — "Asset effects applied" over a ship at 1 and a track at 0, nothing told the GMs; and the progress store's writers changed the cached flag before saving, so a refused save left 8 ticks in the client's cache for the next save of any track to write → `applyMeterRiders` returns one outcome per rider from the write it rode, progress marks report theirs; the summary lists what landed and, apart, what did not and why; a refused write is a `rider` step on the GMs' payoff card whose Retry applies that effect alone; `loadTracks` hands writers a copy |

Open — found while fixing, not fixed (outside the audited paths): *(none left — resolved in the v1.8.1 open-item sweep; see its table at the top)*

- ~~**UNPREPARED-CLEAR-ONE-PC**~~ (WRONG-DETAIL, mirror of S07) — fixed (issue
  #338 D3, the maintainer's call on the rule, 2026-11-05). Resupply's "clear
  unprepared" cleared the roller's impact alone, so an ally stayed unprepared
  at a supply above 0 → `clearUnprepared` clears the roller and every ally
  sharing the supply (`supplyAllies`), and a card names them.
- ~~**RIDERS-SETTING-UNDOCUMENTED**~~ (UX, doc) — fixed (issue #331 X60).
  The "Auto-apply asset consequence riders" world setting
  (`riders.autoApply`) was not on the help journal's Settings Reference
  page → it has a row in its Configure Settings table, with "Combat Tracker
  Integration", the other `config: true` setting it lacked; a sweep test
  (`tests/unit/settingsReferenceCoverage.test.js`) requires a row for every
  one.

### Bug audit after #312 (issue #314) — all six fixed in the v1.7.36 cycle

Found by the 2026-10-29 audit of `40cabee` (the merge of PR #312): its twelve
probes (the six defects, two of them twice over, and their controls)
reproduced locally before the fixes, and pass inverted to the expected
behaviour after them. Each fix's tests fail with the fix taken out
(`docs/testing/fix-sensitivity.md`). None has been checked in a live Foundry
world yet. The ones to try: a strong Resupply while unprepared (Q01); an
Endure Harm of 2 or 3 at health 1 (Q02); a Pay the Price of 96–100 (Q03);
Develop Your Relationship with a bonded connection from the "Which
connection?" card, and its card's "+epic (5)" (Q06).

| Code | Class | Defect → fix |
|---|---|---|
| Q01 RESUPPLY-UNPREPARED-PLUS-2 | WRONG-DETAIL | The strong hit's clear-unprepared option gave +2 supply, and its plain +2 stood open to an unprepared PC: unprepared at supply 0 came out at 2 either way; the rule is Heal's shape — unprepared, clear it and +1, otherwise +2 → the two branches carry 1 and 2 and are each gated on the impact (`requires`), the weak hit too |
| Q02 HARM-OVERFLOW-LOST | WRONG-DETAIL | `endureHarm` / `endureStress` took the whole loss off the meter, which clamped at 0, and read the clamped value for the at-0 escalations: the harm the meter could not take vanished (a loss of 3 at health 1 left momentum 5; a Pay the Price harm at 0 health cost nothing) → the loss is split (`splitOverflow`): the meter takes what it holds, the remainder goes through `loseMomentum` (no card of its own — the Endure card shows both meters, and what the momentum minimum refused), the result carries `momentumLoss`, and the Pay the Price receipt lists it (`sufferMeterDeltas`) — an improvement refunds it, a burn's reset replaces it |
| Q03 PTP-ROLL-TWICE-ROUTES-LOST | WRONG-DETAIL | `rollOracle` copied `sufferRoute` from the matched entry and `resolveDirective` returned a "Roll twice" as joined text, so a 96–100's leaves lost their routes: "You are harmed / You are stressed" changed no meter and posted no suffer card → `resolveDirective` returns the text and its leaves; `rollOracle` lists every leaf's route (`sufferRoutes`; `sufferRoute` is gone); the pipeline's miss, `!ptp` and the Take Decisive Action cost dispatch each once, in order (`dispatchPayThePriceSufferRoutes`), the card names them all, and the receipts carry every loss |
| Q04 BOND-ITEM-MIRROR-BY-NAME | WRONG-DETAIL | `setBondItemTicks` / `setBondItemRank` matched `byId \|\| byName`, so a name overrode a different explicit key — developing one of two Sables wrote both Items (ticks 8 onto a track at 20, then both ranks); and the develop branch and `!bond` keyed the rank mirror by the host Actor id, which no Item carries, so a renamed connection's rank raise missed its Item → `bondItemsFor`: a keyed Item matches its own record `_id` alone, the name only an unkeyed Item and only the PC's one of that name; both rank writers pass the record's `_id` (`!bond` reads it on the GM; `targetName` left the relay) |
| Q05 VOW-CLOCK-RETRY-WHOLE-STEP | DUPLICATE | `revertVowClocksForBurn` returned the refused Items, but `runUpgradeStep` reduced them to `ok: false` and the whole step was queued: the GMs' Retry rewound the landed clocks again (2/2 → 3/3 on the miss → 2/3 after a partial burn → 1/2 after Retry) → a `vowClocks` step that lands in part fails with the entries still owed, the card carries those alone (a second refusal during the Retry the same, on a fresh card), and the reversal card lists the rewinds that landed |
| Q06 BONDED-DEVELOP-NO-RANK | WRONG-DETAIL | The move's schema lists no stat and nothing filled one, so every bonded Develop Your Relationship through the pipeline — the picker's forced move or a typed one — rolled +0: an epic bond's 3 against 4 and 7 missed and paid nothing where `!bond` scored 8 and 2 ticks; the connection's bonded state and rank were read only after the roll → `enrichBondedDevelop` (statEnrichment.js) resolves the connection before the dice (the picker's host id, else the name), stamps its id and name on the interpretation for the branch after the roll, and makes its rank the stat, worth `BOND_ROLL_ADDS` (now in developRelationship.js, shared with `!bond`); the card reads "+epic (5)"; un-bonded stays no roll's worth |

Open — found while fixing, not fixed (outside the audited paths): *(none left — resolved in the v1.8.1 open-item sweep; see its table at the top)*

- ~~**NO-STAT-CARD-NULL** (UX)~~ — fixed by issue #316 T05: a move without
  a stat is a no-roll move now, and its card shows no stat line, no dice and
  no outcome (it used to roll anyway and print "+null (0)" — an un-bonded
  Develop Your Relationship, Reach a Milestone, Forsake Your Vow).

### Bug audit after #310 (issue #311) — all eight fixed in the v1.7.36 cycle, and the two found while fixing (issue #313)

Found by the 2026-10-29 audit of `62bc92d` (the merge of PR #310): its twelve
probes (eleven defect scenarios and a control) reproduced locally before the
fixes, and pass inverted to the expected behaviour after them. Each fix's
tests fail with the fix taken out (`docs/testing/fix-sensitivity.md`). None
has been checked in a live Foundry world yet. The ones to try: a move at
negative momentum (P01); a weak Heal on a wounded PC (P02); Burn Momentum on
a weak Face Danger with its suffer card still waiting, and on a weak Hearten
(P03); Improve Result on a miss that ticked a clock (P05); a ship's Finalise
pressed twice (P07); a Strike burned from a miss during a fight, and an Enter
the Fray burned before its threshold card is answered (issue #313
UPGRADE-PIPELINE-EFFECTS); a weak Secure an Advantage's "+2 momentum" pick
(SAA-WEAK-DOUBLE-MOMENTUM).

| Code | Class | Defect → fix |
|---|---|---|
| P01 NEG-MOMENTUM-IGNORED | WRONG-DETAIL | `resolveMove` had no momentum input: at -3 momentum a rolled 3 counted in full, so iron 3 against 4 and 5 was a strong hit (+1 momentum) where the rules make it a miss; the coverage audit and a Quench comment said it was done → the pipeline passes the roller's live momentum, `cancelsActionDie` cancels a matching die (the score is stat + adds; `actionDieCancelled`, the die struck through on the card); `!bond` applies it to its roller |
| P02 WEAK-RECOVERY-COST-ONLY | WRONG-DETAIL | A weak Heal's choice was its two costs and a weak Hearten a bare `momentumChange: -1`: the cost was charged and the PC stayed wounded / shaken at the same health / spirit → the strong hit's recovery is written once and the weak hit chains it with each cost (`withCost`) |
| P03 UPGRADE-CHOICES-STALE | WRONG-DETAIL | Burn applied the meter deltas and logged a consequence-free resolution: the original outcome's pending suffer card still applied (a burned strong Face Danger charged its weak Endure Harm), and the upgraded outcome's own choice was never posted (a burned weak Hearten offered no recovery); Improve the same → choice cards carry their `resolutionId`; an upgrade retires the superseded outcome's pending card (a pick that reaches it anyway is refused and retires it) and posts the upgraded outcome's choice once, with the move's targets. A consequence already chosen closes both upgrades |
| P04 BURN-REFUND-NOMINAL | WRONG-DETAIL | The burn's Pay the Price refund was the table annotation, not what landed: a loss clamped at 0 health was refunded (0 → 1), and the solo fallback of "a companion in harm's way" (Endure Harm, no companion) refunded nothing → the dispatcher returns the move it ran and the meter's before / after (`ptpMeterReceipt`); only the landed loss is refunded, to its PC; a burn refunds no momentum (its reset replaces it) |
| P05 IMPROVE-PTP-KEPT | WRONG-DETAIL | `ptpReversals` rode the burn's card only: improving a Face Danger miss to a strong hit kept its Pay the Price harm (health 5 → 4) and the tension clock's tick, on top of the asset's own cost → shared `revertPayThePrice` (resultUpgrade.js), the improve card carries the reversals |
| P06 UPGRADE-STAMP-REPEAT | DUPLICATE | Improve wrote its benefit and cost, then stamped `consumed`, a refusal only warned: a fresh render rebuilt the button and the next press applied the benefit again (momentum 3 → 4 → 5); Burn the same boundary → both claim the card first (refused: nothing applied); each later write's refusal goes to the GMs' payoff card as an `upgrade` step with a Retry |
| P07 SHIP-FINALIZE-REPEAT | LOSE-PLOT | Ships finalize through their seed, before the generic `finalizedAt` guard and stamp: a repeat Finalise wrote a fresh introduction over GM-edited Notes (another narrator call), and the panel never switched to Regenerate → the seed path takes the same contract: finalized and not forced → `already-finalized`; a successful seed stamps `finalizedAt`; connections too (a seeded card's first Finalise stamps it, nothing else) |
| P08 SESSION-BONUS-NO-RETRY | LOSE-STATE | End a Session saved the session ended before paying, and a PC's refused momentum write was only logged: the bonus counted as paid, a second End paid nothing and said it "was taken" → each PC's award is its own step; a refused one goes to the GMs' payoff card as a `momentum` step whose Retry pays that PC alone; an End on the ended session names who is still owed; Begin's vignette momentum the same |
| UPGRADE-PIPELINE-EFFECTS (issue #313) | WRONG-DETAIL | Found while fixing P03, outside the audited paths. Burn Momentum and Improve Result swapped the meters, reverted the miss's Pay the Price and reconciled the choice card — nothing else of the upgraded outcome ran: a Strike or Clash burned from a miss to a strong hit marked no combat progress and stayed in the miss's bad spot; an Undertake an Expedition improved from a miss marked no expedition progress; a Set a Course miss burned to a hit never arrived; a Battle burned from a lost miss paid no milestone → the pipeline's consequence branches (an arrival, expedition progress, a legacy mark, the companion's health, the fight's threshold, progress, position and end) are one applier (`applyOutcomeEffects`, index.js) both upgrades run for what the upgraded outcome adds over the recorded original; the fight the card named is the one marked (over by then: nothing, and the card says so); a waiting threshold card takes the new opening position (by its `resolutionId`); a weak hit that pays the price too keeps the miss's Pay the Price; the card lists what was applied |
| SAA-WEAK-DOUBLE-MOMENTUM (issue #313) | WRONG-DETAIL | Found while fixing P03. Secure an Advantage's weak hit applied `momentumChange: 2` directly *and* offered "+2 momentum" on its choice card (the map's comment kept the delta for old test fixtures): the pick gave +4, and "+1 on your next move" still kept the +2 — the strong hit's "both" either way; reproduced on a booted table (momentum 2 → 4 on the roll, 6 after the pick) → the choice carries the momentum; the weak hit applies none itself |

### Bug audit after #307 (issue #309) — all nine fixed in the v1.7.36 cycle

Found by the 2026-10-28 audit of `6e56de4` (the merge of PR #307): fourteen
failing probes, all reproduced locally before the fixes. Each fix's tests fail
with the fix taken out (`docs/testing/fix-sensitivity.md`). None has been
checked in a live Foundry world yet. The ones to try: a Withstand Damage or
Companion Takes a Hit roll against a real starship / Companion asset (N02,
N03); Gain Ground's choice with two fights open (N04); two players ending the
same session (N08).

| Code | Class | Defect → fix |
|---|---|---|
| N01 XP-30-TRUNCATION | LOSE-STATE | `awardXP` capped XP at a hardcoded 30, so a legacy box's XP took a character at 42 XP to 30 and no award passed 30; the vendor's `system.xp` has no maximum → awards add |
| N02 WITHSTAND-RECOVERY-NOOP | WRONG-DETAIL | Withstand Damage's integrity choices were a generic meter write against the PC, which has no integrity: dropped, reported applied — the weak-hit trade still spent its momentum; "not battered" read the PC's impacts → the roll's vehicle rides onto the card (`executorOpts.vehicleActorId`); integrity changes the ship record (`updateShip`), a raise refused while the ship is battered (`isShipBattered`); the card lists what did not land |
| N03 COMPANION-CONSEQUENCES-NOOP | WRONG-DETAIL | Companion Takes a Hit's strong-hit +1 and miss -1 health went to the PC's meters and were dropped; the weak hit's recovery read a companion health never supplied, so was always unavailable → health is the Companion asset's track (`applyCompanionHealthChange`, actorBridge); the roll's companion rides onto the card (`companionItemId`) and the strong hit heals it; availability reads its live health |
| N04 GAIN-GROUND-TARGET-LOST | WRONG-DETAIL | Gain Ground's "Mark progress" choice re-selected the sole open fight at click time: with two open it marked nothing, and an old choice marked a fight opened after its own finished → the move's fight (`moveFight`) rides onto the card (`combatTrackId`); gone or finished by click time, nothing is marked and the card says so |
| N05 FULFIL-CLAIM-REFUSED | DUPLICATE | A refused `fulfilPaid` write was swallowed and the payoff ran anyway; with the in-flight claim released, a later fulfilment of the same vow paid every step again → nothing is paid until the paid flag lands; refused, the steps go to the GMs' payoff card (`unclaimed`) whose Retry pays them once; the native path skips steps the `fulfilPayoff` ledger records |
| N06 LEGACY-XP-FAILURE-HIDDEN | LOSE-STATE | `awardLegacyBoxXP` caught each PC's refused XP write and posted "XP earned"; the legacy step reported complete with no recovery → each PC's award stands alone; a refused one is an `xp` step on the GMs' card whose Retry gives that PC's XP alone (never the ticks again) — from a native payoff, a forge, or a legacy marked inside the move pipeline (`legacyXp` card) |
| N07 SUFFER-STAMP-REPEAT | DUPLICATE | A suffer pick applied its writes, then stamped the card — a refused stamp was swallowed, so the next press applied the same cost again → the pick is claimed (resolved / picked) before any effect; refused, nothing applies and the buttons re-arm; a write refused after the claim is listed on the card and goes to the GMs' card as a `suffer` step with a Retry |
| N08 END-SESSION-REPEAT | DUPLICATE | `applyEndSession` never read `sessionEndedId`: every End paid the party momentum again and repeated the scene close, summary, Session Log and vignette → Ends run one at a time on the GM, on a copy; an End on an ended session only corrects the focus (the momentum is paid for the first focus noted) and posts a note |
| N09 BEGIN-SESSION-CACHE-WEDGE | LOSE-STATE | Begin a Session minted and stamped the cached `campaignState` before saving it; a refused save left the GM's cache "begun", so every retry stopped at the already-begun gate → Begin works on a copy (rules/foundry-api.md) |

Open — found while fixing, not fixed (outside the audited paths): *(none left — resolved in the v1.8.1 open-item sweep; see its table at the top)*

### Post-fix bug audit (issue #306) — all twelve fixed in the v1.7.36 cycle, with the two follow-ups

Found by the 2026-10-27 audit of `ac1da10`, after the #300 / #301 fixes:
fifteen failing probes, ten reproduced through production code and two
Foundry API-contract findings (R11, R12). Each fix's tests fail with it
reverted, or with its defect injected (`docs/testing/fix-sensitivity.md`).
None has been checked in a live Foundry world yet. The ones to try: a player
editing, pinning and adding a note to their own Chronicle while the
journal keeps Foundry's default permissions (R11); `!sfc encounter` for a foe
never imported from the compendium (R12 — the Quench batch
`encounterSpawnLive` now checks the placed token's Actor); the X-Card played
and resumed while a narration is written (R01); a GM's Retry on a payoff
failure card after a dropped connection (R04).

| Code | Class | Defect → fix |
|---|---|---|
| R01 XCARD-RESUME-REVIVES | SAFETY | The in-flight X-Card check (#300 F13) read only whether the card was active when the Claude reply returned: played and resumed before then, the interrupted narration was posted, voiced and recorded → each play counts in `campaignState.xCardPlays` (store-owned); a narration whose count moved since it began is discarded (`watchXCard`), and the notice says it was discarded |
| R02 CHRONICLE-STALE-SAVE | LOSE-PLOT | The Chronicle panel's pin, delete and re-type saved the panel's copy of the entries, made when it rendered: an entry written since — the automatic one after each narration — was erased → each changes one entry by id on the stored entries (`setChronicleEntryPinned` / `setChronicleEntryType` / `deleteChronicleEntry`) |
| R02 CHRONICLE-APPEND-RACE | LOSE-PLOT | Two Chronicle writes that read the entries before either landed each saved their own list, so the later erased the other's entry → an actor's writes run one at a time, all on the canonical GM (R11) |
| R03 SUPPLY-STALE-PASS | WRONG-DETAIL | A shared-supply pass planned its writes up front: a newer edit to a PC it hadn't reached was overwritten with the older value, and the queued pass then read that value → a pass syncs to the value captured with its change, stops once a newer change is queued, and the newer pass resets an overwritten PC |
| R04 FULFIL-PAID-RACE | DUPLICATE | Two native fulfilments of one vow arriving together both passed the `fulfilPaid` check before the flag landed: twice the Quests legacy, and the XP of a box it filled; the native Forge a Bond had the same race on `bonded` (the bonds legacy twice) → each payoff claims its vow or connection before its first await; legacy is written on a copy of the cached value |
| R05 POSITION-PROJECTION-DROPPED | WRONG-DETAIL | `listProgressTracks` dropped each fight's `combatState`, so with two fights open Take Decisive Action's bad-spot downgrade never applied; and a combat move's position was written only while a single fight was open → the listing carries `combatState`; a move's position goes to its own fight |
| R06 TRACK-ROLL-BY-LABEL | WRONG-DETAIL | The Progress Tracks panel's Roll (and an expedition card's Finish) named its track by label, so scoring, completion and rewards took the first same-named track → the track's id rides the roll (`forcedMoveTargetId`); a track deleted or finished before the roll resolves rolls nothing, and a card says so |
| R07 TRANSCRIPT-SESSION-MIX | LOSE-PLOT | A Private Channel turn joined the last waiting batch whatever its session: after a failed write (or before a flush) the next session's opening turns were written to the old session's page → a turn joins only its own session's batch |
| R08 TRANSCRIPT-BY-NAME | LOSE-PLOT | The Private Channel journal was looked up as "Private Channel — <name>" although creation stamped the owner's id: a renamed player lost their history and the next write split it; two same-named users shared one journal → found by its `privateChannelOwner` flag, relabelled on write; a split session reads merged |
| R09 VOLUME-ZERO-LOST | UX | `Number(volume) \|\| 0.8` on the narrator card and `\|\| 1` in the blob audio adapter played a 0% volume at 80% / 100% → 0 stays 0 |
| R10 PTT-OFF-IGNORED | UX | Switching Push-to-Talk off did nothing until a reload — a capture kept running and the 🎙 button kept working → off stops the capture, leaves a no-op controller and removes the button; on again brings back one fresh controller and the button |
| R11 CHRONICLE-PLAYER-UNWRITABLE | GM-GATE | The GM's client creates a PC's Chronicle journal, which Foundry gives no other user ownership of; the player's panel wrote it directly, so a player's edits, notes and pins never saved → every Chronicle write is a `chronicle.edit` relay applied by the canonical GM; the open panel re-renders when its chronicle changes |
| R12 ENCOUNTER-COMPENDIUM-TOKEN | WRONG-DETAIL | `!sfc encounter` built the token from the compendium Actor, so it named no world Actor (no sheet, no actor to act on) → the token is built from a world Actor, imported from the compendium or reused when imported before |
| TDA-BUTTON-NO-TARGET | WRONG-DETAIL | Found while fixing R06. A Strike / Clash / Gain Ground / React Under Fire card's "Attempt to Finish the Fight" and an Enter the Fray card's "Battle instead" posted their move with no fight: with two open, Take Decisive Action scored nothing (a certain miss) and Battle ended neither → each card names its fight by id (the pipeline's `moveFight`, the card's track) and its button forwards it; a Take Decisive Action that names no fight while two or more are open posts a "Which fight?" card instead of rolling, and a pick rolls that fight for the original roller |
| R04 NATIVE-PAYOFF-NO-RETRY | LOSE-STATE | R04's third point. A payoff step that failed after `fulfilPaid` — the Quests legacy, the connection deepen, the promised reward — was logged and lost: a refused legacy still paid its box XP (awarded before the write), a refused grant still said "Reward earned" and flipped the reward's status, a deleted connection was skipped silently; the forge's bonds legacy, a won fight's reward and the victory card's buttons (stamped applied whatever happened) the same → each step reports `{ ok }`; failures go on a card whispered to the GMs with each value as it stands now and a one-press Retry (`payoff.retry`, GM only, the card claimed first); legacy XP follows the write; a reward is claimed before it is given; a fulfilment records each landed step on the vow (`fulfilPayoff`); a failed victory-card action stays unapplied, its button the retry |

Open — found while fixing, not fixed (needs a decision first): *(none left — resolved in the v1.8.1 open-item sweep; see its table at the top)*

### Fault-injection findings (issue #302 slice B) — six fixed in the v1.7.36 cycle, three open

Found by the disturbance matrix, `tests/unit/faultMatrix.test.js`, which
refuses or holds writes, fails Claude calls, repeats clicks and drops the GM's
connection on a booted multi-client table (`tests/helpers/faults.js`). Each
fix's rows fail with it reverted (`docs/testing/fix-sensitivity.md`); none has
been checked in a live Foundry world yet.

| Code | Class | Defect → fix |
|---|---|---|
| LOCK-RELEASE-NO-RETRY | LOCKUP | `releasePendingMoveLock` cleared `pendingMove` on this client's cached campaignState — `game.settings.get` returns it by reference — before writing it. A refused write left the world locked, and the pipeline's `finally` retry read "released" and skipped → the release writes a copy; the retry lands |
| LOCK-CLAIM-WEDGE | LOCKUP | The claim set `pendingMove` on the cached value outside the pipeline's `try`: a refused claim left the GM's client locked (every later move "already being resolved" until a reload) and was an unhandled rejection nobody saw → the claim undoes the flag, tells the GM the move could not start, and returns |
| XCARD-UNSAVED-CLAIMED | SAFETY | On the canonical GM, `playXCard` read `{ ok: true, result: false }` — the pause write failed — as recorded: the card said "Scene paused … suppressed", with a Resume button → it says "The pause could not be saved … play the X-Card again"; a programmatic `!x` too |
| XCARD-UNSAVED-RELAYED | SAFETY | A player's relayed X-Card whose write failed on the GM left only a console warning; the player's card (a relay has no ack) said paused → the GM posts the "could not be saved" card. `suppressScene` / `clearXCard` write copies, so a failed write can't leave the GM's client holding, or lifting, a pause the world doesn't have |
| DRAFT-CONFIRM-TWICE | DUPLICATE | Confirm on a "New Entities Detected" draft created the entity before marking the draft confirmed; a second click meanwhile (a double-click, a re-rendered card) created a second NPC card → an in-flight guard per card and draft |
| SUFFER-PICK-TWICE | WRONG-DETAIL | The clicker's own client applied a suffer pick and disabled only the clicked button: a second pick, or the player and the GM each picking, applied two costs. And a player cannot update the GM-authored card, so a player's pick never marked it resolved (nor recorded a pick-two choice) and its buttons stayed live → picks relay to the canonical GM (`suffer.pick`), applied once behind an in-flight guard and the card's resolved flag, checked against the card's prompt and the PC's owner |

Open — pinned or described, not fixed (each needs a decision first): *(none left — resolved in the v1.8.1 open-item sweep; see its table at the top)*

### Bug audit follow-up (issue #301) — all four fixed in the v1.7.36 cycle

Four findings from the follow-up audit, plus what fixing them turned up. Each
fix ships with regression tests that fail with it reverted; none has been
checked in a live Foundry world yet (a connection pick at a table with one
bonded connection, two PCs with same-named vows, a renamed character's
Chronicle and a corrected entry before End a Session are the ones to try).

| Code | Class | Defect → fix |
|---|---|---|
| B01 PICKER-TARGET-DROPPED | WRONG-DETAIL | `applyConnectionPick` posted the forced Develop Your Relationship / Forge a Bond with no target, and a forced move skips the interpreter, so the pick never reached enrichment or the develop / forge branches: Forge a Bond scored 0 with several un-bonded connections (a certain miss) or the sole bonded connection's track (then forged nothing), and Develop marked the bonded one → the pick rides as `forcedMoveTargetId` (host Actor id) + `forcedMoveTarget`, carried as `interpretation.moveTargetId`; `selectConnection` resolves the id first (an unmatched id resolves nothing). `connectionPickerTarget.test.js` drives the picker through the real pipeline |
| B02 VOW-NAMESAKE-PAYOFF | ATTRIBUTION | Two PCs' independent vows with one name (both "Background Vow", different `vowId`s): `resolveVowItemCopies` took the first PC's, so the native fulfil payoff stamped it paid, rewarded it, paid legacy from its rank and deepened its connection — and its own fulfilment later paid nothing → the resolver takes the scored Item (`itemId`), then the roller's own exact-name vow (open, then completed), before the global ladder |
| B03 CHRONICLE-BY-NAME | LOSE-PLOT | `findChronicleJournal` looked journals up as "Chronicle — <name>" although creation stamped `chronicleActorId`: a rename hid the history (a new journal under the new name) and namesakes shared one — read twice by the campaign recap → lookup by the flag; a rename-split history reads merged and folds into one journal on the next write (relabelled); an unflagged legacy journal is adopted only when one character has its name. Entries namesakes already mixed can't be separated |
| B04 RECAP-CACHE-COUNT | WRONG-DETAIL | `getCampaignRecap` kept its cache while the entry count matched, so a corrected entry ("Vex died." → "Vex survived."), or a wrong one deleted and replaced, kept the old recap; the End Session / world-load refreshes used the same check → the cache stores `chronicleLength` + `chronicleHash` (each entry's text, timestamp, session number — `campaignRecapCacheKey`) and is used only while both match; a stale cache with no key gives no recap; a pre-hash cache regenerates once |

**Found while fixing — fixed in the same cycle:**

| Code | Class | Defect → fix |
|---|---|---|
| FORGE-BONDED-FALLBACK | WRONG-DETAIL | A typed Forge a Bond that named no connection fell back to the sole bonded connection — scored its full track, then forged nothing → Forge a Bond's resolution (enrichment and the forge branch) falls back only to the sole un-bonded connection (`selectConnection` `unbonded`) |
| VOW-RESOLVER-ROLLER-BLIND | ATTRIBUTION | B02's lookup also served pipeline Fulfill Your Vow (completed the other PC's vow), Forsake Your Vow (forsook it), the won-fight card (its rank and 🤝 Deepen connection), the milestone holder and the fight reward → every caller passes the roller; the pipeline also the Item enrichment scored |
| RECAP-START-UNCHECKED | WRONG-DETAIL | `sessionStartRecap` served the cached recap with no validity check, so at a table whose GM has no key (nothing regenerates it) a stale recap opened every session → the same check as `getCampaignRecap` |
| QUENCH-CHRONICLE-DELETE | LATENT | Two Quench cleanups deleted the test actor's Chronicle journal by name — a real character of the same name would have lost theirs → by the actor flag. A unit test now fails if code outside `chronicle.js` builds a "Chronicle — ${…}" lookup |
| TESTS-PINNED-THE-BUGS | TEST-GAP | `cardActions.test.js` asserted the picker's target-less flags with `toEqual`, and `sessionSummary.test.js` served a recap cache stamped for 99 entries over an empty chronicle — both passed because of the defects → they assert the target, and that such a cache is refused |

### Bug audit (issue #300) — all sixteen fixed in the v1.7.36 cycle

Two audit passes plus the validity review of #299. Each fix ships with
regression tests that fail with it reverted; none has been checked in a live
Foundry world yet (delayed narration, delayed audio loads, push-to-talk
startup and concurrent player edits are the ones to try).

| Code | Class | Defect → fix |
|---|---|---|
| F01 TRANSCRIPT-LOSS | LOSE-PLOT | `flushNow` (`transcript.js`) dropped a Private Channel batch before its write succeeded, and two flushes could overwrite each other → per-player writes are chained; a failed batch returns to the front and is retried (three automatic retries) |
| F02 UPGRADE-DOUBLE-APPLY | WRONG-DETAIL | Burn Momentum / Improve Result clicked during narration applied the upgrade, then the original persist stacked on top (momentum 5 instead of 4) → the buttons open once the original is recorded (`originalApplied`), are exclusive, and always swap against the original; the pipeline now sets `resolution._id`, so the superseded narration is found and struck |
| F03 BURN-PAST-MAX | WRONG-DETAIL | `buildBurnState` counted momentum past the maximum → clamped to the live bounds (`readMomentumState`, impacts included) |
| F04 REPAIR-UNPAID | WRONG-DETAIL | Extra repair points applied even when the supply trade failed → `paySupplyTrade` pays first; a failed payment applies no repairs and says so |
| F05 SUPPLY-SYNC-DROP | RACE | A supply edit during a shared-supply sync was dropped → mirror writes carry an update-options marker; a change mid-sync is synced after it |
| F06 BODY-UNBOUNDED | LATENT | `fetchWithTimeout`'s deadline ended at the headers → the body readers race the same deadline |
| F07 SITE-WRONG-SECTOR | WRONG-DETAIL | Site reveal / clear fell back within an earlier sector before an exact match in a later one → `selectSectorSite` runs each rung across all sectors |
| F08 AUDIO-DOUBLE-LOOP | UX | Resume added a second sequencing continuation (B and C started together) → resume rejoins the run in progress |
| F09 AUDIO-STOP-LOADING | UX | A sound that loaded after Stop played → each run has a generation `stop()` ends; a stale sound is stopped |
| F10 PTT-EARLY-RELEASE | UX | A release before `onstart` was ignored and capture began afterwards → a pending start is aborted; a late `onstart` after release aborts at once |
| F11 BEGIN-TWICE | WRONG-DETAIL | A second Begin a Session advanced clocks and granted momentum again → `sessionStartedId`; Begins are chained on the GM |
| F12 PANEL-ACTOR-STALE | UX | The Entity Panel ignored Actor create / update / delete → Actor hooks re-render it and clear a deleted selection |
| F13 XCARD-IN-FLIGHT | SAFETY | An X-Card played while a narration was generated didn't stop it → every narrator entry point re-checks the live X-Card after its Claude call |
| F14 CREATE-PERSIST-WHOLE | SAFETY | Entity creators wrote the caller's whole campaignState and could clear a mid-narration X-Card → id registration onto the latest store; art-asset and sector registration likewise |
| F15 QUEUE-CAP-SHORT | RACE | The GM queue's 60 s cap was shorter than one Claude request, and a backlog timed out together → per-kind budgets counted from the predecessor's start |
| F16 PRIVATE-LINES-WORDING | DOCS | The help said Private Lines were never visible to other players → it describes the real boundary (shared world data a console can read) |

**Found while fixing — fixed in the same cycle:**

| Code | Class | Defect → fix |
|---|---|---|
| AUDIO-RESUME-LABEL | UX | After a resumed narration ended, its card's button read Pause: `togglePlayback` (`src/audio/index.js`) set "playing" after awaiting the resumed run, which settles only when playback ends → it labels from the session's final state. `audioCardButton.test.js` drives the card's button through play / pause / resume / end |
| PANEL-OPEN-ID-DEAD | LATENT | `openEntityPanel(journalId)` wrote the id to `app._EntityPanelApp__selectedId`, a public property nothing read, and no caller passed one → the parameter is removed (no speculative surface, `rules/reachability.md` §4) |
| PTT-QUICK-REPRESS | UX | A push-to-talk press made while the last run wound down from its release (a cancelled start, or the transcript being finalised) was dropped — `recognition.start()` throws until `onend` → the controller tracks the run (`running`, `released`) and a press after the run's release captures at `onend`. A hold that outlasts its utterance still doesn't restart (one utterance per hold) |

### Narrator in-client testing (issue #290) — parts 1 and 2 built in the v1.7.36 cycle

The prompt-contract checks (Quench batch `starforged-companion.promptContracts`,
issue #290 part 1) were written against the playtest bugs the issue lists for
them. Two of those bugs were still live:

| Code | Class | Defect → fix |
|---|---|---|
| TRACKS-UNPORTED | PRODUCED-BUT-DEAD | No narration was told about an open fight, expedition or scene challenge. #241 P1's ACTIVE FIGHT block (a fight's objective, position and linked vow) and the PROGRESS TRACKS section (ASSEMBLER-002) were rendered only by the context assembler, whose packet no narration read (FACTION-PACKET-DEAD) and which #271 deleted without porting them; `docs/flows/combat-flow.md` still described the block → `listOpenProgressTracks` (`src/ui/progressTracks.js`) feeds `buildNarratorExtras`, and every prose mode renders [4j] OPEN PROGRESS TRACKS (the recap doesn't). `tests/unit/narratorProgressTracks.test.js` fails with the fix reverted |
| SHIP-FLAVOR-MODULES | WRONG-DETAIL | v1.6.1 F7, still open: the ship description written at seed / ✦ Finalise was grounded only in the oracle rolls, so a ship carrying a Research Lab was written up as a carrier launching fighters → `seedStarshipActor` installs the rolled identity's modules before the Notes, and the prose prompt names the ship's installed modules and says they are what it can do. Two tests in `entityShipActor.test.js` fail with the fix reverted |

**Part 2** (scripted playthroughs on recorded responses, v1.7.36 cycle) runs
in CI after the multiplayer suite: `test/ci/playwright/playthrough.mjs` plays
`playthroughs/first-session.json` (rules/ci-e2e.md → "Scripted playthroughs").
It checks the ledger, the confirmed NPC card (sheet, description, the
narrator's details, last-known whereabouts), the Session Log, a World Journal
threat page's body, the move lock, PC-only momentum, `<npc>` markup on cards,
no PC drafted as a connection, and LAST SESSION in the next session's
opening. The ship moves too (v1.7.10 F5): its token placed on a seeded sector
map records its position before the first narration; a typed Set a Course
moves the record, the token, the current location and the feedback card; a
drag of the token onto a settlement's pin starts a Set a Course, holds the
token until it resolves and then moves it; and each move's narration request
carries the new SHIP POSITION line. It found no new bug on its first green run, and answered #289's open
question: a player's client holds the cards of NPCs it has no permission on,
so the Private Channel prompt carries them (decisions.md → "The Private
Channel reads the shared story"). Since issue #302 the scenario is **strict**:
each step declares its Claude calls, and a required call the recording doesn't
answer, a prompt that breaks its contract, or an undeclared call fails the
step (decisions.md → "Strict replay for critical playthroughs"). Open:

- **PLAYTHROUGH-PLACEHOLDERS.** `recordings/first-session.json` is
  hand-written (`"source": "hand-written"`), in each parser's format. The
  parsers have not yet seen a real reply in this suite — the truncation,
  fence and markup quirks the issue wants exercised — until someone records
  it with a key: `ANTHROPIC_API_KEY=… npm run test:e2e -- --record-playthroughs`.
- **PLAYTHROUGH-SHIP-MISS.** The ship moves only on strong hits: a Set a
  Course miss rolls Pay the Price, whose result can open a suffer dialog at
  random, and a weak hit opens the suffer choice. So the drag's "a miss leaves
  the token where it was" path is not played; the token staying put while the
  move is pending is.

Part 3 (live QA with an AI playtester) is not started; its open questions
are in the issue's "To settle before building".

### Phone play on The Forge (issue #293) — fixed in the v1.7.34 and v1.7.35 cycles

| Code | Class | Defect → fix |
|---|---|---|
| FORGE-ART-UPLOAD | WRONG-DETAIL | `uploadSectorImage` (`sectorArt.js`) and `uploadShipMapImage` (`shipMapArt.js`) discarded the `FilePicker.upload` response and returned the path they built. On The Forge the file lands in the Assets Library at an absolute `assets.forge-vtt.com` URL, so the scene pointed at a file that didn't exist (the AUDIO-002 bug). The scene builders also prefixed `/` onto any path → both return `response.path` (falling back to the built path), and `sceneBuilder.js` / `shipMapScene.js` leave absolute URLs as they are. `tests/unit/forgeArtUploads.test.js` and the two scene-builder tests fail with the fix reverted |
| PC-TRANSCRIPT-HIDDEN | LOSE-PLOT | Private Channel turns were saved 5 s after the last one or on window close (`transcript.js`); a phone that switches apps or locks can suspend or discard the tab first → pending turns also flush on `visibilitychange` (hidden) and `pagehide`, registered on the first buffered turn. Two tests in `private-channel.test.js` fail with the fix reverted |
| PHONE-LAYOUT | UX | On a Pixel (2026-10-23) the module's windows were too big for the screen, panning and zooming back out were finicky, and the toolbar's bottom tools were cut off: it was one column of 32 px buttons starting 96 px down, with no limit to the viewport → `layoutMode.js` sets `sf-compact` / `sf-touch` on `<body>` from the device (decisions.md → "Phone layout"); the toolbar is always clamped into the viewport (`clampToViewport`) and in the compact layout folds behind one launcher; windows marked `sf-window` span the screen; tap targets grow to 44–48 px. Unit tests in `layoutMode.test.js` / `companionToolbar.test.js`; a Quench test checks the live toolbar and window width under the Phone override. Not yet checked on a real phone |
| PTT-TOUCHCANCEL | LATENT | The push-to-talk button stopped on `touchend` / `mouseup` / `mouseleave` but not `touchcancel`, which the system fires when it interrupts a touch, so listening could stay on → `injectPushToTalkButton` (`src/index.js`) stops on `touchcancel` too |
| PHONE-PINCH-MAP | UX | First phone test (v1.7.34, the GM on a Pixel): a pinch that started on Foundry's map drew its orange drag-select box instead of zooming the page, because PIXI sets `touch-action: none` inline on the map canvas (`#board`); only a pinch begun on a window or the toolbar reached the browser → in v1.7.35, on a phone (`sf-compact` + `sf-touch`), `#board` gets `touch-action: pinch-zoom !important`: two fingers pinch-zoom and pan the page, one finger still works the map. The one place the layout reaches into Foundry's UI, at the maintainer's request (decisions.md → "Phone layout"). The Quench Phone test checks the map's touch-action on and off. Still to check on the phone: that Foundry clears a half-drawn selection box when the browser takes over a pinch |

### ASSET-ABILITY-TEXT — the narrator never saw what a character's assets do — fixed in the v1.7.34 cycle

Found while scoping collaborative character creation (#291).

| Code | Class | Defect → fix |
|---|---|---|
| ASSET-ABILITY-TEXT | LOSE-PLOT | `readAssets` (`actorBridge.js`) read ability text from `abilities[].text`, a field the vendor `AssetAbilityField` doesn't have (the text is `description`, which `abilityScanner.js` already read). So the CHARACTER block listed assets by name only, on every narrator path. The unit and Quench fixtures used `text`, and the Quench test asserted only the asset name, so both passed → `readAssets` reads `description` and reduces `@Compendium[…]{Move}` links to their labels; the fixtures use the vendor field, and the Quench test asserts the ability text reaches the prompt |

### Narrator continuity & detail persistence (issue #286) — fixed in the v1.7.34 cycle; follow-ups in #287

The audit traced how small details (a scar, a bar's name, an object handed
over, a promise) are stored, sent and kept. Harness composition tests in
`tests/unit/narratorDetailPersistence.test.js` fail with each fix reverted.

| Code | Class | Finding | Fix |
|---|---|---|---|
| A1 | PRODUCED-BUT-DEAD | Sidecar subjects resolved against `entityId`, a field the roster never has: recorded entities' truths had no id, and every entity's state shared the key `""` | One roster shape end to end; `subjectKey` → `entity:<id>` |
| A2 | LOSE-PLOT | The live tier pass looked records up in `game.journal`: nothing saved for Actor-hosted entities | `persistGenerativeTier` writes through the registry |
| A3 | LOSE-PLOT | Draft confirm re-keyed earlier truths to the record's internal id | `promoteNewEntityLedgerSubjects` uses the host document id (also the inciting vow target) |
| A4 | LOSE-PLOT | `@scene` ended the scene it was asked about | It continues the scene (decision recorded) |
| A5 | WRONG-DETAIL | Name index matched articles, titles and shared name parts | Noise-word filter, shared parts dropped, bounded `resolveEntityName` ladder |
| A6 / A7 | LOSE-PLOT | All state dropped at once at the ledger cap; cards kept the oldest five details | State sheds by priority; cards show ten, newest first, with trait slots |
| B1–B5, B7 | LOSE-PLOT | Moves saw no recent prose; no concrete-specifics rule; frame cast lost on moves; text subjects needed the exact phrase; player lines never stored; summary regen in the critical path | See decisions.md → "What every narration is told about the turn before" |
| B6 | MIRROR-DRIFT | A strike stayed in the scene ledger | `propagateRetraction`: tier, lore, summary and session list |
| C1 / C2 | LOSE-PLOT | Scene state had no afterlife; place details became place-less lore; lore picked by recency | `lastKnown` on cards; scene facts to the place's card; `selectLoreForContext` |
| C3 / C4 | LOSE-PLOT | Session boundary = any reload 4 h after the mint; only the recap crossed sessions | End Session or four idle hours; `previousSessionSummary` as LAST SESSION; recap on any mode's first narration |
| C5 | LOSE-PLOT | Clocks, vow progress, rewards, connection standing, End-Session foci in no prompt | All rendered; snapshot dropped on Item changes |
| D2 | LOSE-PLOT | Narration on a player's key discarded its side-data | Relayed to the GM (`narrator.sidecar`) |
| D3 | WRONG-DETAIL | Draft confirm rolled role / goal / look against the narration | Detected role and goal win; no rolled look over a narrated one |
| D4 | LOSE-PLOT | Detection skipped interaction moves and oracle follow-ups; lore floor ran before entity routing | Wider capture; entity lore at the tier floor |
| E | DOC-DRIFT | Help and docs described old defaults and behaviour | Corrected |
| F7 | LATENT | Thinking-off matched the `claude-sonnet-5` prefix (would 400 on Sonnet 5.5) | Exact ids |

**D1 — fixed in the v1.7.34 cycle** (decided in #287): the Private Channel
reads the shared story, and a published reflection is canon (decisions.md →
"The Private Channel reads the shared story; a published reflection is
canon").

**Open — moved to #287** (issue #286 is closed):
- **§F steps 2–6** — the tiered, cached request layout and larger budgets
  wait on the Narrator Usage numbers and a playtest.
- ~~**CREATE-PERSIST-WHOLE**~~ — fixed by issue #300 F14 (below): creators
  register their id onto the latest store (`registerEntityIdInStore`).

### Multiplayer test infrastructure (issue #282) — fixed in the v1.7.34 cycle

Issue #282 gave the unit suite the means to see the 2026-10 audit's bug
classes: permission-faithful stubs (`tests/setup.js`,
`tests/helpers/foundryPermissions.js`), a multi-client table harness
(`tests/helpers/multiClient.js`), concurrency tests of the move pipeline and
the GM relay queue, and producer → consumer composition tests
(`rules/reachability.md` §3 and "The through-line"). With each fix reverted
locally, the harness fails on XCARD-PLAYER-NOOP (7 tests), CMD-PER-CLIENT
(one `!oracle` card per client — four), BURN-IMPROVE-DOUBLE (4) and
STALE-SNAPSHOT-CLOBBER (3). Without the permission stubs, the reverted X-Card
passes. Re-pointing hand-set fixtures at their real producers found one dead
consumer:

| Code | Class | Finding | Fix |
|---|---|---|---|
| RECAP-MATCH-DEAD | PRODUCED-BUT-DEAD | `!recap session`'s "A match was rolled" line read an `isMatch` flag on narrator cards that `postNarrationCard` never wrote, so the line never appeared. Its unit test hand-set the flag | `postNarrationCard` stores `isMatch` from the resolution. The recap tests create cards through it, and `multiplayerComposition.test.js` covers move pipeline → `!recap session` |

`campaignState.characterIds` is still never written (documented in
`schemas.js`; every reader falls back). The new harness suites no longer seed
it.

Items 5–7 (approved 2026-10-19):

- **Static checks (item 5).** CI runs `deadscan --strict`.
  `tests/unit/campaignStateFields.test.js` requires a writer and a reader
  for every campaignState field. `tests/unit/hookGates.test.js` requires an
  author or canonical-GM gate on every document-hook handler.
- **Coverage (item 7).** `src/index.js` is measured (62% lines). The
  chat-command run-on policy moved to `src/multiplayer/commandRouting.js`,
  which is on the core bar.
- **Second-client E2E (item 6).** `test/ci/playwright/multiplayer.mjs` runs a
  GM and a player browser after Quench (`rules/ci-e2e.md` → "Second
  client").

The two new checks' first run found the first three of these; the panel copy was found while verifying the Private Lines E2E scenario:

| Code | Class | Finding | Fix |
|---|---|---|---|
| SECTOR-OVERVIEW-EVERY-CLIENT | DUPLICATE-EMIT | `registerSectorOverviewSync`'s `updateActor` handler rewrote the sector-record overview page on every connected client. A player's client had its update refused; two GMs both wrote | Gated on `isCanonicalGM()` |
| PRIVCHAN-LOCATION-DEAD | PRODUCED-BUT-DEAD | The Private Channel's scene context read `campaignState.currentLocationName ?? currentLocation.name`, which nothing writes. `!at` writes `currentLocationId` / `currentLocationType`, so the "Location:" line never appeared | Resolved through the narrator's `currentLocationName` (the same lookup as the location card). A harness test runs the GM's `!at`, then the player's Private Channel context |
| PRIVATE-LINES-PANEL-COPY | SAFETY | The Companion Settings panel told players their Private Lines were "Stored on this client. Never shared with GM or other players." That has been untrue since SAFETY-PRIVATE-LINES-PLAYER / -SHARED: the lines are relayed to the canonical GM and stored in `campaignState` (decisions.md → "Private Lines in shared narration"). The copy misstated where a safety tool's data goes. The help journal's Settings Reference and `lang/en.json` carried the same claim | The panel, `lang/en.json` and the Settings Reference now say the lines go to the GM's client so all narration respects them, are not shown to other players, and are never mentioned by the narrator |
| CAMPAIGNSTATE-DEAD-FIELDS | DEAD-CODE | Eleven `CampaignStateSchema` fields nothing read or wrote: `_id`, `title`, `version`, `art`, `speechInput`, `sessionCount`, `clockIds`, `oracleResultIds`, `worldTruthsPageId`, `createdAt`, `updatedAt`. `updatedAt` was written only by a `clocks.js` stamp. `persistResolution`'s merge lists still named four dead fields, including `progressTrackIds` | Removed |

Open follow-ups:

- **CAMPAIGN-TRUTHS-UNWIRED.** `buildCampaignTruthsBlock` (narrator and
  Private Channel) reads `campaignState.canonicalTruthSlugs`, but nothing
  writes it: no UI selects canonical truth slugs. So the `<campaign_truths>`
  block never renders. It is marked `UNWIRED`. Wire a selection UI or retire
  the block.
- **INDEX-EXTRACTION** (the rest of item 7). The move pipeline (the inline
  *Still open after the v1.8.1 open-item sweep:* Deferred: moving the move pipeline (the inline createChatMessage handler, about 1,000 lines) and the chat-card button wiring out of src/index.js is a large refactor. Nearly every area edits index.js, so in this parallel batch it would conflict with every other agent. Do it in a batch of its own.
  `createChatMessage` handler, about 1,000 lines) and the chat-card button
  wiring still live in `src/index.js`. Both lean on many index-local helpers.
  Measuring `index.js` already counts them toward the floor; moving them into
  modules would let them carry a bar of their own.

### 2026-10 repo audit — all fixed in the v1.7.31 cycle

A whole-repo audit (PR #281, commits 87cb96d + d5d434e) traced **where each
thing executes in multiplayer** — which client runs every chat command, hook
and card button, and where its world write lands — plus credit-the-roller,
mirror stores, and dead surface. Headline: Foundry fires `createChatMessage`
on every connected client and almost no command checked its author, so every
`!command` ran once per browser — and several player features only "worked"
because the GM's client re-ran the player's command with GM authority. The fix
is two pieces of architecture: chat-command routing (`CHAT_COMMAND_ROUTES`,
decisions.md → "Chat commands run once: author / canonical-GM / keyed-runner
routing") and the canonical-GM relay (`src/multiplayer/gmRelay.js`,
decisions.md → "Player-invoked world writes go through the GM relay"). An
adversarial review of the merged PR (findings #0–#20) found a second layer of
defects in that new architecture; every one was fixed in the follow-up commits
ba3d69d + 6e2b532 (second table). Accepted limitations and the open
follow-ups found along the way are listed after the tables. Post-fix behaviour
lives in the matching `docs/flows/*-flow.md` maps.

**Audit findings (PR #281):**

| Code | Class | Finding | Fix |
|---|---|---|---|
| XCARD-PLAYER-NOOP | SAFETY | A player's `!x` posted "Scene paused" but never recorded `campaignState.xCardActive` (a GM-only write) — the narrator kept going; the programmatic `!x` path's "author fallback" comment described code that didn't exist | `playXCard` relays `xcard.activate` to the canonical GM; the card says when no GM could record the pause; GM-only **Resume narration** button, `!x clear`, `module.api.clearXCard()` (decisions.md → "X-Card: anyone plays it, a GM resumes it") |
| CMD-PER-CLIENT | DUPLICATE-EMIT | Only `!incite` / `!reveal-site` / `!clear-site` checked the author; every other command ran on every client — `!oracle`, `!ptp`, `!bond`, `!stations`, `!clock list` posted one card per browser with independent dice, `@scene` / `!ship envision` made one Claude call per keyed client | `CHAT_COMMAND_ROUTES` (`src/index.js`): each command declares `RUN_ON.AUTHOR` / `CANONICAL_GM` / `CLAUDE`; every client recognises it, one runs it, the rest log `console.debug` |
| CMD-GM-ONLY-LEAK | GM-GATE | `!at`, `!journal`, `!pace`, `!scene`, `!sever`, `!truths`, `!lore`, `!migrate-entities`, `!sector <name>`, `!clock new` warned a player "GM only" — then executed anyway on the GM's client | AUTHOR routing: only the typist's client runs the command, so its own `game.user.isGM` check decides |
| DIALOG-EVERY-SCREEN | DUPLICATE-EMIT | `!flag`, `!fate`, `!break`, `!begin-session`, `!end-session` opened their dialog on every connected screen | AUTHOR routing — the typist's screen only |
| CREDIT-ROLLER-SWEEP | ATTRIBUTION | "Credit the roller" violations: the pipeline's ability scan used `getPlayerActors()[0]` and Reach a Milestone the first PC with the speaker in scope; `markLinkedVowMilestone`, the won-fight reward, `!ptp` harm and `!bond` momentum (`game.user.character ?? first PC`) all credited a GM-local default | One `rollerActor` (speaker; first PC only as fallback) drives the ability scan, stat enrichment, Reach a Milestone, companion health, burn/improve and the decisive-action / Face Defeat suffer routes; `dispatchPayThePriceSufferRoute(route, actorId)`; `resolveVowHolderActor`; the fight card stores `actorId`; `!bond` momentum → the speaker's PC |
| FULFIL-REWARD-NEVER | PRODUCED-BUT-DEAD | Fulfill Your Vow completed every copy, then looked the promised reward up among *open* vows — the reward was never granted | `grantLinkedVowReward` takes the copies the payoff already resolved (completed ones included) and prefers the roller's copy (refined by FULFIL-REWARD-FIRST-PC) |
| REPAIR-BYPASS-SHIP | MIRROR-DRIFT | `!repair` wrote `flags.ship.integrity` raw (no `integrityMax` cap, raised while battered), cleared battered on the native field only, took supply from the GM's own bound character, and on a player's client only "allocated" the spends | GM_ACTIONS `repair.apply` → `applyRepairSpends`: battered cleared first, then `repairIntegrity` (capped, refused while battered) through `src/entities/ship.js`; supply from the repairing player's PC (owner or GM only); the card says what actually happened |
| BURN-IMPROVE-DOUBLE | DOUBLE-APPLY | Burn Momentum / Improve Result could be clicked again (another client, a re-render) and applied twice | `move.burnMomentum` / `move.improveResult` relays: consumed + in-flight check on the GM, owner-or-GM only; the button re-arms on no GM, failure, or no confirmation within 15 s |
| CUSTOM-ORACLE-D100 | RULES-FIDELITY | Custom tables always rolled a d100 (a 1–6 table missed 94% of rolls), entries were never validated, and new tables reached other clients only after a reload (deletes never) | Custom tables roll 1..max (`dieSizeForTable`), entries must tile it from 1; `campaignState.customOracles` canonical, mirrored on every client by `syncCustomOraclesFromState` (`updateSetting` hook); custom ids overwrite, built-ins can't be redefined; new `!oracle <table-id> [question]` (decisions.md → "Custom oracle tables roll their own die") |
| CLOCK-RETRIGGER | DUPLICATE-EMIT | Advancing or filling a full clock re-announced TRIGGERED and paid for another vignette; `!clock fill` never got one; the panel's ↻ / + changed state silently | `advanceClock` / `fillClock`, shared by the commands and the panel: a full clock posts "already triggered" (no write, no vignette); fill vignettes on the filling step only |
| TAKE-BREAK-NEXTMOVEADD | PRODUCED-BUT-DEAD | Take a Break "Move on" wrote `campaignState.nextMoveAdd`; nothing read it | `src/moves/nextMoveAdd.js`: added to the next action roll (not progress / no-roll moves), then cleared on the store (decisions.md → "Take a Break's +1 applies to the next action roll") |
| ENDSESSION-FOCI-UNREAD | PRODUCED-BUT-DEAD | End a Session saved `questFocus` / `connectionFocus` "for the next Begin a Session" — no reader | Begin a Session shows "Focus from last session" (dialog + card), then clears both |
| SESSION-WRITES-DROPPED | MULTIPLAYER-WRITE | A player's Set a Flag, Take a Break, Begin / End a Session posted their cards while `if (isGM)` skipped every world write; the Reach a Milestone and connection pickers did nothing for players | GM_ACTIONS `safety.setFlag`, `session.takeBreak`, `session.begin`, `session.end`, `milestone.pick` (the connection picker: CONNECTION-PICK-REFIRE); cards say when no GM was connected; the Begin / End vignettes run on the canonical GM |
| SAFETY-PRIVATE-LINES-PLAYER | SAFETY | `syncSafetyToCampaignState` returned early on player clients, so a player's Private Lines never reached `campaignState.safety.privateLines` | GM_ACTIONS `safety.syncPrivateLines` → `applyPrivateLinesSync`, keyed on the relay requester; re-pulled when a GM becomes ready (RELAY-LOAD-WINDOW). Shared narration reads them too — SAFETY-PRIVATE-LINES-SHARED (below) |
| PTP-CLOCKS-PLAYER | MULTIPLAYER-WRITE | A player's `!ptp` advanced tension / vow clocks only because the GM's client re-ran the whole command with its own dice; AUTHOR routing removed that (caught before merge) | GM_ACTIONS `payThePrice.advanceClocks` (`src/clocks/payThePriceClocks.js`) — once, on the canonical GM |
| RECAP-DENIED-SILENT | SILENT-FAILURE | With "Recap GM-only" on (the default) a player's `!recap` matched no route and vanished | `isDeniedRecapCommand` route warns the player |
| HOOK-ISGM-EMITTER | DUPLICATE-EMIT | Single-emitter hooks gated on plain `isGM` (a two-GM table double-emits): starship / connection `createActor` seeding, command-vehicle `createItem` / `deleteItem` + their ready scan, both world-truths journal hooks, the `updateActor` momentum-bounds recalc, the ready-hook session-ID / auto-recap block | `isCanonicalGM()`; idempotent ready-time work (help journal, world journals, migrations, macros, `closeWorld`) stays on `isGM` |
| SECTOR-SWITCH-001 | UX | A player's `!sector <name>` silently did nothing (moved to Resolved) | Bare `!sector` posts a usage card to the typist; a player's switch warns GM-only |
| INTERP-TRACKS-BLIND | WRONG-DETAIL | `buildContextSummary` read `campaignState.progressTrackIds`, which nothing wrote — the move interpreter was never told about open vows or tracks | Reads open vow Items (owner-tagged with several PCs) + open non-vow tracks from the Progress Tracks journal, each capped at 8 |
| I18N-UNWIRED | PRODUCED-BUT-DEAD | `src/system/i18n.js` had no production consumer — the move-confirm dialog showed raw move / stat slugs (model text unescaped), the suffer card raw meter keys | `localizeMove` / `localizeStat` / `localizeMeter` in the confirm dialog (escaped), `localizeMeter` / `localizeDebility` in the suffer-card summary |
| AUDIT-DEAD-SURFACE | DEAD-CODE | `persistResolution` steps 4–6 (`markProgress`, `markLegacyProgress`, `applyCombatPosition`, `markProgressOnJournalTrack` — `consequences.progressTrackId` was never set) and the `progressMarked` / `progressTrackId` consequence fields; the `campaignState.activeCharacterId` fallback (never written — really `getActor(null)`, the GM's own PC); write-only `pendingClarification` / `loreRecapSessionId` / `progressTrackIds`; five never-read settings (`worldJournalEnabled`, `worldJournalAutoDetect`, `characterContextEnabled`, `chronicleContextCount`, `activeCharacterId`); `getSafetyConfig`; 11 unused `index.js` imports; the entity art-path exports, `updateCreature`, `getChronicleForContext`, `annotateEntry` (+ its `annotations` writes), `shouldApplyMischief`, nine unused schema exports | Deleted with their readers and tests; with no speaker, `persistResolution` credits the first PC; `MoveResolutionSchema` survives as a doc-only `@typedef`; `CampaignStateSchema` gains `questFocus` / `connectionFocus`. Deleting `getChronicleForContext` left the Chronicle panel's pin with no reader (the help still promised pinned entries reach the narrator) — wired by issue #345 AA07 |
| DEADSCAN-BLIND | TOOLING | `scripts/deadscan.mjs` reported the tree clean while it wasn't: constant-keyed settings were invisible (31 of 82 checked), Quench usage and comment mentions counted as consumers, module reachability unchecked | Rewritten around an exported `scan()`: constant keys resolved, comments stripped, `src/integration/` treated as test code (QUENCH-ONLY buckets), an UNREACHABLE-modules section; unit-tested (`tests/unit/deadscan.test.js`) |
| UNTESTED-CAMPAIGNSTART | TEST-GAP | `src/session/campaignStart.js` had no unit or Quench coverage — and reported the inciting incident / ship envision as success when the narrator returned nothing, and swallowed confirm / read errors | 27 unit tests; an empty-prose phase reports ⚠️ degraded; errors warn |

**Post-merge review findings (fixed in ba3d69d + 6e2b532):**

| Code | Class | Finding | Fix |
|---|---|---|---|
| ORACLE-SIDECAR-OFF-GM | LOSE-PLOT | (#0, #14) The oracle follow-up narrated on the author's client whenever it held a key, but the narrator sidecar is applied only on the canonical GM — a keyed player's (or second GM's) `!oracle` / `!ptp` follow-up silently dropped its truths, state changes and scene frame | `requestOracleNarration` relays `oracle.narrate` whenever a keyed GM is active (`hasKeyedActiveGM`); a keyed author narrates locally only as the no-keyed-GM fallback (debug-logged); `applyNarratorSidecar` logs its non-canonical skip (decisions.md → "Claude calls run where a key lives, exactly once") |
| RELAY-LOAD-WINDOW | RACE | (#1, #11, #17) Relays are fire-and-forget: one emitted while the GM's client was still loading (its listener installs in `ready`) was dropped while `requestGmAction` reported success — the Private Lines re-send on `userConnected` always fell in that window; concurrent handlers' campaignState read-modify-writes could interleave | The canonical GM broadcasts `gmRelay.ready` once its listener exists (`announceGmRelayReady`); players re-send on it (`onGmRelayReady` — pull, not push); every GM action runs through one serialised queue (released in `finally`, 60 s wait cap) |
| STALE-SNAPSHOT-CLOBBER | LOSE-STATE | (#16) The move pipeline reads campaignState before its confirm dialog and Claude calls; `persistResolution`, the narrator-sidecar persist and scene start / end wrote that whole snapshot back — undoing an X-Card, Take a Break, flag, Private Lines, `!bond` ticks … relayed meanwhile | `persistResolution` re-reads and merges (`mergeWithLatestState`); scene lifecycle and the sidecar write only their own fields onto the latest state (`persistCampaignStateFields`) (decisions.md → "Long-running pipeline writes merge relay-owned fields") |
| XCARD-MOVE-NARRATION | SAFETY | (found fixing #16) `narrateResolution` had no X-Card gate — move narration's only gate lived in the context assembler (ASSEMBLER-003), whose packet narration stopped reading and which is now deleted — so moves narrated straight through an active X-Card; every other narrator entry point had its own gate, but read only the caller's (stale) snapshot | `narrateResolution` posts a "narration paused" notice (outside the narrator flag family); every narrator X-Card check also reads the live setting |
| CONNECTION-PICK-REFIRE | DOUBLE-APPLY | (#2, #8) With the picker's `isGM` gate dropped, a player's click posted the forced move but couldn't stamp the GM-authored card resolved — the buttons re-armed and a second click rolled Forge a Bond / Develop again | GM_ACTIONS `connection.pick` → `applyConnectionPick` (`src/moves/cardActions.js`): in-flight + resolved check, choice validated against the card, forced move posted as the clicker's PC, then stamped |
| FIGHT-VOW-BUTTONS-REFIRE | DOUBLE-APPLY | (#5) Won-fight **Mark milestone** / **Deepen your bond** used raw socket emits with no resolved flag (each click applied again) and vanished silently with no GM | GM_ACTIONS `fightVow.markMilestone` / `fightVow.deepenBond`: values from the GM-authored card, one-shot via `flags.resolvedActions`; the raw `vow.markMilestone` / `connection.deepen` relays deleted |
| RELAY-PAYLOAD-UNCHECKED | VALIDATION | (#4) `bond.apply` and `milestone.pick` applied whatever the payload said — unbounded ticks / momentum to any actor, any rank, any vow | `!bond` effects clamp to {0, 2} (both together refused), a rank raise only to the connection's next rank, momentum only to a PC the requester owns; picks must match a button on the card (`flags.choices`, or the button HTML on older cards) and an owned PC |
| REPAIR-BATTERED-FLAG | MIRROR-DRIFT | (#7, #13) The new `!repair` read battered from the ship flag, which nothing sets true — the starship sheet's toggle writes only `system.debility.battered` — so a sheet-battered vehicle couldn't be cleared and still gained integrity; the entity panel and the narrator's COMMAND VEHICLE line read the same mirror | `isShipBattered` (native field canonical, flag a write-through mirror via `updateShip`) read by `repairIntegrity`, `!repair`, the entity panel and the narrator (decisions.md → "Starship battered: the native sheet field is canonical") |
| RENARRATE-ATTRIBUTION | ATTRIBUTION | (#6) Burn / Improve re-narration called `narrate(res, null, campaignState, {})` — the slot of the `contextPacket` parameter #271 removed, so `narrateResolution` got `campaignState = null` and no speaker; the roller's character never reached the prompt | `narrate(res, campaignState, { speakerActorId })` from the card's `actorId`; persist likewise |
| FULFIL-REWARD-FIRST-PC | ATTRIBUTION | (#9) Once every copy was completed, the fulfil fallback collected only the first PC's copy, so a shared vow's reward missed the roller; with one other open vow the sole-open rung could pay *that* vow | `payFulfilledVowNative` collects every PC's copy and prefers the roller's; the sole-open-vow rung never fires when the name matches an already-completed vow |
| MOMENTUM-BOUNDS-GM-EDIT | GM-GATE | (#10) With the recalc moved to `isCanonicalGM()`, a GM ticking an impact on a player's sheet ran it nowhere (own write skipped; the owner isn't canonical) — momentum max / reset went stale | `momentumRecalcRunsHere`: a player's edit → the canonical GM; a GM's edit → the PC's lowest-id active owner; no owner online → the canonical GM, unless it made the edit |
| INCITE-ROUTING | SILENT-FAILURE | (#15) `!incite` was AUTHOR-routed with no GM check; on a player's client the premise persist, detection, tier and lore writes all skipped silently | `RUN_ON.CLAUDE`; `runIncitingIncident` debug-logs both skipped GM-only branches |
| CLAUDE-CMD-KEYLESS-GM | WRONG-RUNNER | (#12) Moving `@scene`, `!recap`, `!ship envision` / `history` to the canonical GM broke them at a keyless-GM table where a player held the key ("Claude API key not configured") | `RUN_ON.CLAUDE`: the keyed canonical GM when one is active, else the author with their own key — every client computes the same runner |
| DEADSCAN-CONST-MASK | TOOLING | (#19) A bare constant setting key (`SETTING_KEY`) counted by identifier across every file, so an unrelated same-named constant (`combatTracker.js` vs `apiTransactionLog.js`) masked a dead setting | References count only in the defining file and files importing that constant (named / aliased / namespace / dynamic / re-export); a key the file neither defines nor imports is reported unresolved, not guessed |
| DOC-DRIFT-2026-10 | DOC-DRIFT | (#18, #20) Flow maps, file-structure, decisions, known-issues, the `MoveResolution` JSDoc, the narrator-sidecar comment and the gmRelay "every relayable action" header still described pre-audit behaviour | Docs updated this cycle; comments corrected; the gmRelay header lists the remaining legacy relays |

**Found while verifying this write-up (fixed in the v1.7.31 cycle):**

| Code | Class | Finding | Fix |
|---|---|---|---|
| SAFETY-PRIVATE-LINES-SHARED | SAFETY | Shared narration (moves, paced turns, `@scene`, oracle follow-ups, vignettes, the inciting incident) carried no Private Line at all — not even the GM's: `buildNarratorSystemPrompt` called `formatSafetyContext(campaignState)` with no user id, and `resolvePrivateLines` returns `[]` without one. A player's personal hard limit constrained only their Private Channel. Pre-existing; the relay fix (SAFETY-PRIVATE-LINES-PLAYER) only got the lines stored | `formatNarratorSafetyContext` (`src/context/safety.js`): a GM's client carries every player's lines (deduplicated); a player's client — narrating only with no keyed GM online — carries that player's own, read from their client setting, never another player's. The heading tells the narrator never to mention or hint at them (decisions.md → "Private Lines in shared narration") |

**Second review round (fixed in the v1.7.31 cycle):**

| Code | Class | Finding | Fix |
|---|---|---|---|
| SIDECAR-LEDGER-CLOBBER | LOSE-STATE | The narrator-sidecar persist merged only its own fields onto the latest store, but wrote those ledgers whole from the move pipeline's snapshot: a `!truth` strike or an oracle follow-up's truth that landed during the narration was dropped (`persistResolution`'s union then had nothing left to keep), and a scene End a Session closed mid-move came back — and was archived a second time at the next scene start | `persistSceneLedgerFields` (`sceneLifecycle.js`): nothing written when the store moved to another scene; otherwise `sceneTruths` unioned by id via `mergeSceneLedgers`, now shared with `persistResolution` |
| XCARD-QUEUED | SAFETY | The serialised GM queue held `xcard.activate` behind Claude-calling handlers (oracle follow-up, Burn / Improve re-narration, End a Session's summary) for up to 60 s while the unqueued move pipeline narrated through it; the GM's own `!x` card waited too, and a resume clicked meanwhile was undone when the activation landed | `xcard.activate` runs unqueued (`gmRelay.js` `UNQUEUED_ACTIONS`) — safe once no handler writes back a snapshot held across an await (END-SESSION-CLOBBER) |
| END-SESSION-CLOBBER | LOSE-STATE | `applyEndSession` wrote back the campaignState it read before `endScene` and the summary's Claude call, reverting a move persisted meanwhile (its session-log entry, legacy ticks, entity ids) and resurrecting its released `pendingMove` lock — every later move was then refused until a reload. Pre-existing | Merges only End's fields (`questFocus`, `connectionFocus`, `sessionActive`, `sessionActiveStartedAt`) onto the latest store (`mergeOwnedFields`); the Session Log gets that merged object; a failed write still fails the card honestly |
| SCENE-START-OFF-GM | GM-GATE | With no keyed GM online, `RUN_ON.CLAUDE` runs `@scene` / `!incite` on the author: a player's client ran `startScene` / `endScene` — campaignState, WJ Lore and entity-tier writes a player can't make (permission errors; the scene never started) | `@scene` and `ensureSceneStarted` start a scene on the canonical GM only (debug-logged elsewhere); the author's client just narrates |
| FULFIL-SUBSTRING-RUNG | ATTRIBUTION | The FULFIL-REWARD-FIRST-PC fix blocked only the sole-open-vow rung: once "Find the ship" was completed, the substring rung still resolved the open "Find the ship's captain", which got the payoff (and its own later fulfilment was skipped as already paid) | An exact name for a completed vow skips the substring rung too; `payFulfilledVowNative`'s all-copies fallback then finds the completed vow |

**Accepted limitations** (recorded, not defects):

- **Relay requester ids are client-asserted** (review #3). Foundry's module
  socket does not identify the sender — the listener receives only the
  payload — so `ctx.requesterId` is whatever the emitting client wrote.
  Permission checks (`ctx.requesterIsGM`, `requesterOwnsActor`, "a client
  writes only its own Private Lines") protect **honest clients only**; a
  hand-crafted emit from a console or macro can claim any user. Mitigation:
  handlers clamp and validate values and take effect values from GM-authored
  cards, so a forged request can only do what the UI could have done.
- **No ack channel.** A relay that lands while the GM's client is loading is
  still dropped; only Private Lines are re-pulled on `gmRelay.ready`. An X-Card
  played in that window says "Scene paused" without being recorded. Relayed
  card buttons re-arm after 15 s if the card isn't marked used.
- **One serialised GM queue.** A long handler (an oracle follow-up's Claude
  call, End a Session's summary) delays later relays until it settles — or,
  if it hangs, until its run budget passes (60 s; 270 s for a handler that
  awaits a Claude call, which covers its bounded requests: issue #300 F15).
  The two safety writes are exempt — the X-Card and a player's Private Lines
  sync run the moment they reach the GM (issue #345 D5: a line added while a
  follow-up narrated was missing from the moves narrated meanwhile).
- **Session vignettes need a keyed GM.** The Begin / End a Session galley and
  closing vignettes run inside the canonical-GM relay handlers, so at a
  keyless-GM table they are skipped (a player's key isn't used).
- **Momentum recalc gap:** a canonical GM's own sheet edit of a PC whose owner
  is offline is not recalculated (own-write skip; debug-logged).
- ~~**Fight-vow stamps are optimistic**~~ — resolved (issue #306 R04): a
  `fightVow.*` action is stamped applied only when its step reports it
  landed; one that didn't is reported to the GMs and its button re-arms.
- **The persist merge has no baseline:** two concurrent adds to the same
  legacy track keep the larger; `sceneState` / `sceneFrame` / `spotlight` /
  `currentLocation*` / `sectors` changed by a relay mid-pipeline are overwritten
  by the pipeline's copy; an entity id removed mid-pipeline can come back via
  the id-list union (readers filter missing documents).
- **AUTHOR routing changes:** a player's `!sfc encounter` posts the stat card
  only (token placement is GM-only); a command message with no resolvable
  author (a programmatic / legacy shape) still runs on every client that
  receives it.
- **Private Lines are private by convention, not by storage.** They are never
  shown in another player's UI or sent in another player's narrator request,
  but the canonical GM stores them in the world-scoped `campaignState`, which
  every client receives — a player's console can read them. The same holds
  for a GM-only flag (issue #345 AA60): a player's Begin dialog no longer
  counts one, but `campaignState.safetyFlags` is world data a console can
  read.

**Open follow-ups** (found during the audit or while verifying this write-up): *(none left — resolved in the v1.8.1 open-item sweep; see its table at the top)*

- ~~**RELAY-LEGACY-KINDS**~~ — **resolved**: the older world-writing socket
  relays are all folded into `GM_ACTIONS` — `expedition.recommit` (issue #321
  U20), `vow.setReward` / `vow.linkConnection` as `vow.reward` / `vow.link`
  (issue #325 W11) and `combat.enterFray` as `combat.threshold` (issue #329
  X06).

`node scripts/deadscan.mjs` after the follow-up: **0 dead exports, 0 dead
settings, 0 unreachable modules** (82 settings checked); QUENCH-ONLY
`getLastJournalCommandPromise` (a Quench seam); TEST-ONLY `NARRATOR_CLASSES`
(the documented contract anchor) and `sufferDamage`
(SHIP-INTEGRITY-API-UNWIRED). Unit suite: 145 files / 3,295 tests, coverage
85.1 lines / 73.3 branches / 83.2 functions.

### Unreachable-code audit (2026-07) — all resolved in the v1.7.30 cycle (issues #269–#277)

A whole-tree sweep for produced-but-unconsumed code. **Every finding is now
fixed** (issues #269–#277, "Please address the remaining recent issues"):
the lore-recap injection re-homed to the live seam, the assembler retired
(global token budget declared obsolete), the 14 theme oracles registered,
the dead entity API torn down bidirectionally (allyFlag/sceneRelevant fields
retired with their readers), planets/locations wired into the sector roster,
windowPosition wired, and the Tier-3/Tier-4 surface deleted — plus the
assembler-deletion collaterals swept per the new bidirectional-teardown rule.
Post-fix proof at the time: `node scripts/deadscan.mjs` reported **0 dead
exports, 0 dead settings** — but that scan could not see settings registered
through constants, counted Quench and comment-only mentions as consumers, and
never checked module reachability, so the "clean" tree still held dead
surface. The 2026-10 audit rewrote the scan and removed what it found
(DEADSCAN-BLIND / AUDIT-DEAD-SURFACE, above). Dispositions per finding:
`docs/flows/unreachable-code-audit.md`.
Original headline items (issue in the first column):

| Issue | Code | Class | Finding |
|---|---|---|---|
| #271 | ASSEMBLER-DEAD-IN-PROD | DEAD-IN-PROD | `src/context/assembler.js` (1175 lines) — sole export `assembleContextPacket` has zero production callers (tests only); superseded by `buildNarratorExtras`. Blocked by #269/#270 |
| #269 | LORERECAP-INJECT-ORPHANED | PRODUCED-BUT-DEAD | `!lore` persists `campaignState.loreRecap` "for context injection" but its only injector (the dead assembler) was retired in 2026-07 — the narrator silently stopped receiving the world-lore recap. A real regression: re-home into `buildNarratorExtras`, or drop the field |
| #270 | SESSION-NOTES-STUB | DEAD-STUB | `buildSessionNotesSection` reads `sessionState.notes`, which has no writer anywhere — always rendered empty. Wire the feature or remove the stub |
| #272 | THEME-PERIL-OPP-DEAD | DEAD-CONTENT | 14 theme `*_PERIL`/`*_OPPORTUNITY` oracle tables authored in `tables/themes.js`, never registered in `roller.js` (SITE-ZONE-TABLES-DEAD repeating) |
| #273 | FORMATFORCONTEXT-DEAD | DEAD-EXPORT | `formatForContext(entity)` defined in 7 entity modules, zero consumers (masked by a same-named live truths fn) |
| #274 | SCENERELEVANT-DEAD | INCOMPLETE-TEARDOWN | `setSceneRelevant` left dead in 5 entity modules after the 2026-07 cleanup removed only connection.js's copy (+ addRumor/setProject/addFeature/listAlly/Scene) |
| #271 | CONTEXTPACKET-PARAM-DEAD | DEAD-PARAM | `narrateResolution`'s `contextPacket` param unread; every caller passes `null`/`{}`; JSDoc still points at the dead assembler (retired with the module) |
| #276 | SETTING-DEAD | DEAD-SETTING | `locationArtSource`, `privateChannel.windowPosition` — registered, never read/written |

Plus #275 (`listLocations`/`listPlanets` dead producers) and #277 (Tier-4 dead
singletons — telemetry readers, roller helpers, unused schema/enum exports); a
Tier-5 test-only-in-prod set is documented, no issue. Checked clean:
`CONSEQUENCE_MAP` (all 52 keys live), chat-command dispatch. Not swept:
statement-level dead branches inside the four largest files (parallel reader
agents hit the session rate-limit) — see the doc's §8.

### Vault & derelict (site) audit findings (2026-07) — all fixed in the v1.7.30 cycle

Surfaced by the site creation/exploration audit; all six defects were fixed
in the same cycle ("Please address all items"). Post-fix behaviour:
`docs/flows/site-flow.md`. Creation and discovery were already solid; the
fixes are all on the exploration side.

| Code | Class | Defect → fix |
|---|---|---|
| SITE-ZONE-TABLES-DEAD | LOSE-CONTENT | 13 dead derelict tables registered (type-by-location + Access suite + seven zone AREA tables) — reachable via `!oracle` and the site-aware waypoint seeds |
| SITE-WAYPOINT-BLIND | WRONG-DETAIL | `buildOracleSeeds(currentSite)` rolls the vault interior / derelict Access tables when the current location is a site; the pipeline passes `getCurrentSiteKind(campaignState)` |
| SITE-ANCHOR-ABSENT | LOSE-PLOT | Discovered sites render a "Charted sites" block in the ACTIVE SECTOR anchor (type + status) |
| SITE-TYPE-TABLE-MISMATCH | canon fidelity | `derelictTypeTableFor(location)` routes the type roll to the planetside/orbital/deep-space table |
| SITE-DISCOVERY-CARD-GENERIC | LOSE-PAYOFF | The Site Discovered card now surfaces the location record's first look |
| SITE-NO-COMPLETION | minor | `clearSectorSite` + `!clear-site` close the unexplored → visited → cleared lifecycle |

Dispositions: interior-in-one-field and no-zone-position both reaffirmed;
zone AREA tables reachable by `!oracle` — see the flow doc §4.

### Narrator-consistency audit findings (2026-07) — all fixed in the v1.7.30 cycle

Surfaced by the consistency-check pipeline audit; all three defects and the
actionable exposures were fixed in the same cycle ("Please address all
identified issues"). Post-fix behaviour: `docs/flows/narrator-consistency-flow.md`.

| Code | Class | Defect → fix |
|---|---|---|
| NARRCHK-TRUNC-SILENT | LOSE-DETECTION | 250-token silent truncation → `max_tokens: 1000` + a `stop_reason` warning |
| NARRCHK-CTX-DROPPED | WRONG-DETAIL | Oracle follow-ups dropped matched entities → all twelve apply sites pass `extras.matchedEntityIds` uniformly |
| NARRCHK-REMEDY-MISMATCH | design defect | One-size retract button → kind-aware review card (dialog button for truth/state; targeted remedy hints for frame/ship/identity/retraction) |

Exposures: standing contradictions now post once per scene (in-memory dedup);
medium-confidence stays telemetry-only (recorded in decisions.md); pre-burn
cards lingering accepted; the "check on, notifications off" silent mode is
labelled in the setting hint.

### Faction lifecycle audit findings (2026-07) — all fixed in the v1.7.30 cycle

Surfaced by the faction lifecycle audit; all five defects were fixed in the
same cycle ("Please address all identified issues"). Post-fix behaviour:
`docs/flows/faction-flow.md`. Headline: the dead assembler packet was
retired and its load-bearing sections (threats, faction landscape,
confirmed lore) now flow through `buildNarratorExtras`.

| Code | Class | Defect → fix |
|---|---|---|
| FACTION-PACKET-DEAD | LOSE-PLOT | The 17-section packet was never read → retired from all three live callsites; threats / faction landscape / confirmed lore now render as narrator sections [4d]-[4f] via `buildNarratorExtras` (existing WJ toggles apply); the assembler module is retained for reference/tests |
| FACTION-DUAL-STORE | WRONG-DETAIL | Two unreconciled stores → draft-confirm inherits the WJ attitude and backlinks `entityId`; the record is canonical, the WJ entry is the intelligence log |
| FACTION-ATTITUDE-SPLIT-BRAIN | WRONG-DETAIL | Attitude shifts never reached the record → every `recordFactionIntelligence` write syncs `record.relationship` via `ATTITUDE_TO_RELATIONSHIP` |
| FACTION-RECORD-WRITE-ONCE | LOSE-PLOT | Frozen records → `seedFactionRecord` rolls the faction oracles on confirm (idempotent `seeded` flag) and the attitude sync is the narrative write path |
| FACTION-DETECTOR-ONLY-CONTEXT | INVENT-RISK | Narrator blind to the landscape → [4e] FACTION LANDSCAPE on every call with a stances-are-established guard |

Dispositions: faction stance's canonical home is the entity record
(decisions.md); no dissolution lifecycle reaffirmed.

### Character-detail drift audit findings (2026-07) — all fixed in the v1.7.30 cycle

Surfaced by the character-detail drift audit; every defect and the
actionable exposure were fixed in the same cycle ("Please address all
findings"). Post-fix behaviour: `docs/flows/character-detail-flow.md`
(§3 resolved ledger, §4 dispositions). The theme was completing the
pronoun-propagation cluster (v1.7.10/11 findings E/R): vignettes, entity
cards, portraits, and audio were covered — the core CHARACTER pipeline and
the NPC-confirmation flow were not.

| Code | Class | Defect → fix |
|---|---|---|
| CHAR-PC-BLOCK-STARVED | WRONG-DETAIL | `getActiveCharacter` narrowed the snapshot to 4 fields on all nine narrator paths → now returns the full snapshot (pronouns, callsign, biography, stats, impacts, assets, vows reach every prompt); a composition test locks the live path |
| CHAR-PARTY-NAMES-ONLY | WRONG-DETAIL | PARTY roster was bare names → carries `{name, pronouns, callsign}` per member with a binding-pronouns rule |
| CHAR-PERSPECTIVE-NO-PRONOUN-RULE | INVENT-RISK | No pronoun rule in either perspective → recorded pronouns are binding; third person forbids inferring gender from names |
| CHAR-NPC-PRONOUN-ROLL-BLIND | WRONG-DETAIL | Confirming a detected NPC rolled pronouns randomly → the detection pass, draft card, auto-create, and the inciting `Vow target:` line all capture the prose-established set; the finding-E roll is fallback-only |
| CHAR-SIDECAR-NO-PRONOUN-ANCHOR | LOSE-PLOT | Identity anchor omitted pronouns → the required anchor (and example) includes the pronouns the prose used |

Exposures: the consistency check now audits RECORDED IDENTITIES (PC + matched
NPC pronouns, kind `identity`); recap/chronicle inherit the fixed CHARACTER +
PARTY blocks; PC appearance stays biography-anchored (reaffirmed — no vendor
field).

### Narrator-context audit findings (2026-07) — all fixed in the v1.7.30 cycle

Surfaced by the narrator context/memory audit; every defect and the
actionable design exposures were fixed in the same cycle ("Fix all gaps").
Post-fix behaviour is documented in `docs/flows/narrator-context-flow.md`
(§3 resolved ledger, §4 design decisions); design reference:
`docs/narrator/narrator-memory-architecture.md`.

| Code | Class | Defect → fix |
|---|---|---|
| NARR-RING-VOWSCENE | LOSE-PLOT | Vow-swearing scene card lacked the flag family → carries `narratorCard`/`narrationText`/`sessionId`; the oath scene now feeds the ring, rolling summary, and recap |
| NARR-RING-CLOCKVIG | LOSE-PLOT | Clock vignettes (Pay the Price, Begin Session, manual advance — all three post sites) lacked the family → all carry it now |
| NARR-SIDECAR-SILENT | LOSE-PLOT | Fence-less responses and pre-fence maxTokens truncation were invisible → `applyNarratorSidecar` warns on a missing fence; `callNarratorAPI` warns on `stop_reason: "max_tokens"` |
| NARR-INCITING-SCENE | LOSE-PLOT | Premise wrote under `currentSceneId: null`, first turn's implicit endScene discarded opening state/frame → `narrateIncitingIncident` starts the scene first; the first move continues it |
| NARR-SESSION-SCENE | LOSE-PLOT | End Session / 4h re-mint left the scene open across sessions → End Session ends the scene (`session_close`); the ready-hook closes a stale scene before re-minting (`session_gap_remint`) |
| NARR-TRUTH-DUP | WRONG-DETAIL | Required identity anchors accreted duplicates unboundedly → `applySidecar` dedups on subject + normalised fact; the sidecar instruction says anchors are recorded once |
| NARR-RETRACT-PASSIVE | INVENT-RISK | A bare Strike only hid the truth → renders as a CORRECTED do-not-re-assert block (never dropped, capped at 5); the write layer blocks narrator re-assertion of a retracted fact; the consistency check audits retractions |
| NARR-CMD-SUBJECT | WRONG-DETAIL | Commands resolved subjects without the roster → `!truth` / `!state` pass `collectAllEntities`, so entity-keyed entries are addressable by name |
| NARR-BOND-RANK-STALE | WRONG-DETAIL | Bond-Item rank never updated on record rank raises → `setBondItemRank` mirrors at both raise sites (develop-match, `!bond`-match) |

Design exposures addressed in the same cycle: the consistency check now
defaults ON and audits the full ledger block (frame, truths, retracted
facts, state, ship position); the rolling summary carries a ledger-wins
caveat; raw oracle results gained a memory home (`recentOracles` ring →
prompt section [3b] + the assembler's RECENT ORACLES section); scene-end
tier migration dedups; the summary persist is canonical-GM gated.
Reaffirmed as deliberate (decisions.md): frame full-replacement without
validation, lexical non-move relevance, WJ Haiku transitions.

### Flow-audit findings (2026-07) — all fixed in the v1.7.30 cycle

The combat/vow/connection/exploration flow audits surfaced eleven verified
defects; every one was fixed in the same cycle (combat pair in PR #257, the
remaining eleven in the follow-up fix commit). Kept here as a resolved ledger —
full context and post-fix behaviour live in the matching `docs/flows/*-flow.md`.

| Code | Was | Fix |
|---|---|---|
| VOW-FULFIL-SIBLINGS | Native-sheet fulfil left shared-vow copies open on other PCs | `completed` joined `SHARED_VOW_SYNC_FIELDS`; pipeline fulfil already closes all copies |
| VOW-RENAME-PAYOFF | Renamed vows rolled hits but completed/paid nothing (exact-name matching) | `resolveVowItemCopies`: name ladder (exact → substring → sole-open), copies collected by `vowId`; used by completion + both payoff paths |
| VOW-FORSAKE-COSMETIC | Forsake presented costs but never cleared the vow | New `forsakeVow` consequence + pipeline branch: all copies completed + `forsaken` flag, journal twin closed, promised reward → lost, forsake card |
| BOND-WEAK-FORGE | Weak-hit Forge a Bond changed nothing mechanically | Resolver weak hit now sets `forgeABond`; the bond forms (with their request in the fiction) |
| BOND-NATIVE-FORGE | Sheet-rolled Forge a Bond never updated the record | Native consequence hook gains a forge branch (`shouldForgeBond` → `payForgedBondNative`: bonded + rank legacy + card, idempotent) |
| LEGACY-XP-DEAD | Legacy ticks never converted to XP anywhere | `addLegacyTicks` awards 2 XP per newly filled box (1 once cleared) to every PC + an earned-XP card; `!bond` rerouted through it |
| BOND-ITEM-MIRROR | The sheet's Connections-tab track never advanced | `markRelationshipProgress` mirrors `relationshipTicks` onto each PC's bond Item (`setBondItemTicks`, keyed by connectionId → name) |
| WAYPOINT-PROGRESS-NOOP | Waypoint "mark progress" pick silently skipped with no open expedition | Executor resolve-or-creates a default expedition (0 open); ambiguous (>1) now warns |
| EXPEDITION-FINISH-TARGET | The card's Finish button lost the destination | The progress card carries `trackLabel`; the button forwards it as `forcedMoveTarget` |
| SHIP-TRANSIT-LINE | Narrator said "in transit to X" after arriving | `set_a_course` (written only on non-miss = arrival) now reads as docked/in-orbit |
| LOCATION-DUAL-STORE | Travel-by-move never updated `currentLocationId` | The arrival block resolves the destination with the `!at` resolver and updates `currentLocationId/Type` |

---

### VENDOR-BONDSET — non-GM "lacks permission to create Item" on character-actor creation

**Status:** Known / upstream (foundry-ironsworn). Harmless log noise; not fixed
in-module (the `vendor/foundry-ironsworn` submodule is not patched without
explicit instruction — see CLAUDE.md "Never do").

**Symptom:** In a multiplayer session, whenever a `character` actor is created
(a connection/NPC card, or a player character), the Foundry **server** log
shows, for each connected non-GM player:
`User <name> lacks permission to create Item [...] in parent Actor [...]`, each
paired with a Foundry-internal `Cannot read properties of undefined (reading
'length')`.

**Root cause:** The foundry-ironsworn **system** registers a `createActor` hook
(`vendor/foundry-ironsworn/src/module/actor/actor.ts:73`) that adds a `bondset`
Item to every new `character`/`shared` actor with **no GM gate**. The hook fires
on every connected client: the GM's write succeeds (the actor gets its
bondset), and each non-GM client's redundant attempt is rejected by the server.

**Impact:** Cosmetic. The bondset *is* created (by the GM), so functionality is
correct — these are redundant-attempt errors that only spam the server log.
Distinct from the Companion's own multiplayer write paths, which are GM-gated
(see the v1.7.27 write-gate hardening) and, since 2026-10, relayed to the
canonical GM when a player triggers them (`src/multiplayer/gmRelay.js`).

**Workaround:** None needed for correctness. A real fix belongs in the system's
hook (GM-gate it); options if the noise matters are (a) a vendor patch to
GM-gate that hook, or (b) report upstream.

---

### PLAYTEST-1717 — v1.7.17 playtest findings

**Status:** In progress (2026-06-21). **A fixed** (`<npc>` strip). **B
hardened** — detection failures now surface to the GM + retry; the underlying
live API-throw cause still needs one console line to name (the model/prompt are
confirmed working — see the Haiku replay below). **C fixed** — the inciting
narrator now receives the sector NPC's full recorded identity and is bound to
stay consistent with it (consistency approach).

---

#### Finding A — `<npc>` tags leak into the inciting incident card ✓ FIXED

**Status:** Fixed (next release). `renderIncitingIncidentCard` now runs
`escapeHtml(stripMarkup(p))`; unit test added asserting the rendered card
carries no raw or escaped `<npc>` markup and preserves the inner dialogue.

**Symptom:** Literal `<npc>…</npc>` markup appears in the inciting incident
chat card text when the audio-narration setting is on. The tags are visible to
the player.

**Root cause:** `renderIncitingIncidentCard` in
`src/session/incitingIncident.js` (line 190) runs `escapeHtml(p)` on each
prose paragraph but never calls `stripMarkup()` first. The narrator prompt
inserts `<npc>` tags around NPC dialogue for the TTS voice-splitting pipeline
(`src/audio/segments.js`). The narrator card's `ready` hook in
`src/audio/index.js` strips these tags from `.sf-narration-prose` elements,
but the inciting incident card renders plain `<p>` tags without that class, so
the hook never fires.

The correct pattern is used in both vignette renderers:
- `src/session/galleyVignette.js:170` — `escapeHtml(stripMarkup(text))`
- `src/session/endSessionVignette.js:177` — same

**Files to fix:**
- `src/session/incitingIncident.js:190` — add `stripMarkup` before `escapeHtml`
  (also import `stripMarkup` from `../audio/segments.js` at the top of the file)
- `tests/unit/incitingIncident.test.js` — add a test for `<npc>`-free output

---

#### Finding B — The inciting incident captures nothing durable (no faction, lore, threat, or entity)

**Symptom:** *Nothing* the inciting-incident fiction invents is captured. The
faction(s) named in the opening prose (e.g. "Shroud Company", "The Ascendancy")
are the most visible loss, but it is broader than factions.

Confirmed by screenshots (2026-06-21):
- "World Journal — Factions" journal is **empty**.
- "World Journal — Session Log" journal is **empty** (no pages / no beats).
- World Journal panel: "PENDING LORE: No entries awaiting review".
- The **only** Active Threat is "Energy storms are rampant" — and that is a
  **Sector Trouble** rolled at sector-generation time (`src/sectors/sectorGenerator.js`
  Step 10, `recordThreat`), **not** from the inciting incident. So it is *not*
  evidence the inciting detection worked; it predates the inciting incident.

Net: the inciting-incident detection pass produced **zero** durable
captures — no lore, no threat, no faction, no entity record, no pending review,
**and no session-log beat**.

**Root cause (narrowed to two console-distinguishable causes).** The inciting
path runs `runIncitingIncident` → `runPacedDetection`
(`src/narration/narrator.js:1527`) → `runCombinedDetectionPass`. There are
**three** nested try/catch layers, all swallowing to console, so a total
failure is invisible in-game:
- `incitingIncident.js:321-328` → `console.warn("runIncitingIncident: entity detection failed")`
- `narrator.js:1541` → `console.error("runPacedDetection failed")`
- `entityExtractor.js:142-143` → `console.warn("entityExtractor: detection API failed")`, then returns `emptyDetection()`

The empty Session Log is the decisive new evidence. Below-`significant`
lore/threats reroute to the session log (`appendSessionLogBeat`,
`worldJournal.js:634`), so if detection had returned *anything* in the
lore/threat channels it would show there. Empty session log **+** empty
Factions WJ (which has **no** salience gate — `factionUpdates` writes
unconditionally) means the pass produced zero output across *every* channel,
not output that was filtered. This **eliminates** two earlier candidates:

- ~~Salience reroute~~ — ruled out: nothing reached the session log.
- ~~Empty `prose`~~ — ruled out: the inciting card *rendered visible prose*
  (that is how Finding A's `<npc>` tags were visible), and the card and the
  detector consume the same `splitIncitingMeta(text).prose`.

Two causes remain, distinguishable only by the browser console:

1. **API call threw** (`runCombinedDetectionPass` → `defaultCallDetectionAPI`)
   — console line `entityExtractor: detection API failed:`. **Most likely**: a
   single failure zeroes every channel at once, which matches exactly what is
   observed.
2. **Model returned / parsed to empty** — *no* error line, clean run, all-empty
   arrays. Possible but requires the model to independently return empty for all
   five channels.

Note the inciting detection runs **unconditionally** — `runIncitingIncident`
calls `runPacedDetection` directly with no "Auto-Detect Entries" setting gate,
so a disabled setting is not a factor.

For factions specifically, even when detection works there are two fragile
routes — `worldJournal.factionUpdates[]` → `recordFactionIntelligence` (durable
WJ write, `worldJournal.js:265`) and `entities[]` type `faction` → a transient
chat draft card (`routeEntityDrafts`/`postDraftEntityCard`,
`entityExtractor.js:427`) that is lost if the GM never confirms it.

**Haiku replay (2026-06-21) — rules out cause 2.** The exact
`buildCombinedDetectionPrompt` text (fresh-quickstart context) was replayed
against a Haiku model with representative entity-rich inciting prose (a
connection + two factions + two locations, `<npc>` tags intact). Haiku returned
a full, well-formed result: 5 entities, **2 `factionUpdates`** (the two
factions, `isNew: true`), 2 significant lore items, 1 threat, 1 location
update, 1 state transition. The `<npc>` tags did **not** confuse it. So the
prompt + model are capable; the empty live result is **not** the model
returning nothing. That leaves **cause 1 (the API call is throwing in the live
environment)** as the overwhelming likelihood. (Caveat: representative prose
via an agent wrapper, not a raw API call — but Haiku 4.5 underlies both.)

**Diagnostic next step:** one more repro with the browser console open —
search for `detection API failed`. Present → confirms cause 1 (API throw) and
tells us *why* (auth / rate-limit / model-id / proxy). Absent but still no
captures → re-open cause 2.

**Hardening shipped (next release).** `runCombinedDetectionPass` now (a) retries
the detection API call once with backoff (recovers transient failures) and
(b) on persistent failure raises to `console.error` **and surfaces a GM-only
`ui.notifications.warn`** so the silent loss of the opening fiction's entities
is no longer invisible. Unit tests cover the surface, the retry, retry-recovery,
and GM-gating; a Quench test (`runPacedDetection — World Journal wiring`)
locks the detected-faction → Factions WJ end-to-end write. This does **not**
fix the underlying live API throw — that still needs the console line above —
but it converts a silent failure into an actionable one and self-heals blips.

**Files to check:**
- `src/session/incitingIncident.js` — `runIncitingIncident` detection call
  (lines 321-328), `splitIncitingMeta` (does prose survive meta-splitting?)
- `src/narration/narrator.js` — `runPacedDetection` (line 1527) and its
  error swallow (line 1541)
- `src/entities/entityExtractor.js` — `runCombinedDetectionPass`,
  `routeWorldJournalResults` (salience reroute 616-637; factionUpdates 639),
  `routeEntityDrafts` (faction-as-draft path)
- `src/world/worldJournal.js` — `recordFactionIntelligence` (line 265)
- `src/sectors/sectorGenerator.js` — Step 10 `recordThreat` (source of the one
  threat that *is* present; rules out a dead `recordThreat`)

---

#### Finding C — Inciting fiction contradicts the canonical sector NPC ✓ FIXED

**Symptom:** The sector NPC (e.g. Doran Sterling) carries oracle-rolled
Role/Goal (e.g. "Prophet / Spread faith"), but the inciting incident invents a
contradicting characterisation for that same NPC (researcher, met in a hab,
saved your life). The invented detail is never written back to the connection
record, so the record keeps the contradicting oracle values and the richer
fiction is lost.

**Correction to the first-pass entry.** The connection is **not** a vow target
created via `swearVow` / `seedConnectionActor` — that earlier root cause was
wrong. It is the **sector NPC generated during quickstart** (user-confirmed,
2026-06-21). `generateConnection` (`sectorGenerator.js:195-200`) rolls
name / role / goal / disposition / first-look from the Character oracle tables;
`sectorGenerator.js:288` then creates it via
`createConnection({ name, role, goal, … })` and **canonical-locks** it
(`canonicalLocked: true`, lines 300-315). Role/goal are therefore already set,
so `seedConnectionActor`'s oracle fallback never runs for this NPC.

**Root cause — two gaps plus the deeper design tension:**

1. *The prompt actively instructs the invention.* The `inciting_incident`
   system prompt (`narratorPrompt.js:827-854`) binds only the **name**
   (`"use their established name"`, 851-852) and then explicitly asks the model
   to author the rest — the `Vow target` line is
   `"<Name> — <2-3 sentences … who they are, their history with the character,
   and their current situation>"` (844-845). It is never told to honor the
   connection's established role/goal. So even though the narrator's context
   surfaces the role (`formatConnection`, `assembler.js:1041`, renders
   `Role: <role>`), the prompt gives it no binding force and the model invents
   "researcher" to suit the opening. (Secondary gap: `formatConnection` renders
   `c.motivation` (1046), **not** `c.goal`, so a sector NPC's oracle *goal* —
   "Spread faith" — is never even surfaced to the narrator.)
2. *No write-back.* Nothing reconciles the inciting fiction with the connection
   record. Whatever the narrator invents about a referenced NPC stays in the
   prose; the canonical record is untouched and keeps the oracle role/goal.
3. *Design tension (the deeper cause).* The sector generator
   **canonical-locks** an oracle-rolled NPC *before* the inciting incident gives
   them narrative purpose — so a random Role/Goal draw is treated as
   authoritative over the more meaningful opening fiction, exactly backwards.
   The lock exists so narrator entity-discovery can't overwrite sector NPCs; it
   also freezes them against the inciting fiction.

**✅ FIXED (next release) — consistency approach.** The narrator now receives
the NPC's full recorded identity and is bound to honor it:

1. The active-sector roster (`formatActiveSector`, `narrator.js`) — the cast
   source for the inciting incident (which uses a spark-only user message, so
   the assembler's `formatConnection` packet never reaches it) — previously
   rendered only `Name — Role`. It now renders the **full profile** via the new
   `formatSectorNpcProfile`: role, goal, motivation, pronouns, disposition,
   first look, rank, description (present fields only). The roster header is now
   a consistency directive: "when you feature one, keep them consistent with
   their recorded profile … do not reassign their role or goal, change their
   pronouns or disposition, or invent a history that contradicts it."
2. The `inciting_incident` prompt's `Vow target` line (`narratorPrompt.js`) now
   instructs that for an already-established NPC the description must be
   "consistent with their recorded role, goal, and pronouns, never reassigning
   or contradicting them."

This is the consistency route, not the write-back route — the established
oracle identity is now authoritative and *surfaced in full* to the narrator,
so the opening fiction builds on Doran-the-Prophet instead of recasting him.
Tests: `sectorContext.test.js` (full profile + directive present),
`narratorPrompt.test.js` (the inciting binding caveat). **Not changed:** the
sector generator still canonical-locks the oracle draw; we did not move to
fiction-authoritative write-back (a larger change), since surfacing + binding
resolves the contradiction the playtest hit.

**Files changed:**
- `src/narration/narrator.js` — `formatSectorNpcProfile` (new) +
  `formatActiveSector` roster enrichment & consistency directive
- `src/narration/narratorPrompt.js` — `inciting_incident` `Vow target` caveat

---

### PLAYTEST-1712 — v1.7.12 playtest findings

**Status:** Largely resolved — playthrough complete (2026-06-14). 19 findings
(A–T; **Q withdrawn** — confirmed correct behaviour). **All fixed in v1.7.13**
except **E** (config/discoverability — setting hint clarified; not a code bug)
and **H** (diagnostics added; root cause needs the Tier-3 audio smoke to confirm
live). **K** was resolved by the M/N move-lock fix. Finding **A**'s camera fix
was **confirmed fine in a live session (2026-06-18) — closed.** See the
cluster notes and individual entries. Two-player session (GM + one non-GM
player); PCs Kylar Nazari and Mave Takara in the Igneous Maze sector.

**Version timeline (important — the session spanned a rollback):**

- Findings **A–O** were observed on **v1.7.12**.
- Mid-session the move pipeline **locked up** (findings **M / N**): a
  move-in-progress lock set by the first Roll-button click never cleared, and a
  blue "a move is being resolved" toast then suppressed all further narration.
- To recover, the GM **logged out, rolled the module back v1.7.12 → v1.7.11, and
  logged back in — which fixed it** (finding **P**). On v1.7.11 the Roll button
  then triggered a roll **correctly both times it was offered**. This pins
  M/N as a **v1.7.12 regression**: v1.7.11 does not exhibit the stuck lock.
  (The recovery combined a relog and a rollback, so we can't isolate which
  cleared the lock — no conclusion that the lock is stored durably.)
- Findings **P** and **R** were observed on **v1.7.11** (post-rollback),
  continuing the same campaign/world. (**Q**, also v1.7.11, was withdrawn —
  it turned out to be correct behaviour.)
- Findings **S** (recap fact-drift) and **T** (inciting-incident design) span the
  boundary: the inciting incident was generated on **v1.7.12**, but the
  end-of-session recap that crystallised the drifted "three weeks ago" fact was
  produced on **v1.7.11**.

**Root-cause clusters (several findings share one underlying bug):**

- **Move-lock lifecycle (v1.7.12 regression)** — M, N: a move-in-progress lock
  set on the first Roll click never released, then suppressed all narration.
  Highest-priority fix; it bricked the v1.7.12 session. Finding **P** is the
  diagnostic that narrows it: rolling back to **v1.7.11 fixed it** (the button
  works correctly there), so the fix target is the `v1.7.11..v1.7.12` diff in
  the move pipeline / Roll-button path.
  **✅ FIXED in v1.7.13.** Root cause confirmed via the diff: v1.7.12 added
  `applyMoveConsequenceRiders` (consequence-riders feature) *inside* the
  `pendingMove` lock's critical section. It can open an interactive GM dialog
  (`src/moves/riderDialog.js`, `promptRiders`) for optional / "choose one" /
  progress riders; while that dialog was open the world-scoped
  `campaignState.pendingMove` stayed `true`, so every later player input hit the
  "a move is already being resolved" guard (N) and Roll buttons looked dead (M).
  The relog+rollback recovered it only because the `ready`-hook stale-lock reset
  (`src/index.js`, "Reset stale pendingMove lock on ready") cleared it — and
  v1.7.11 never re-wedged because it has no post-roll dialog. **Fix:** release
  the lock on the success path *before* the rider prompt (the lock guards
  narration + campaignState persistence, which are already done by then); the
  `finally` re-releases idempotently via the new `releasePendingMoveLock()`
  helper. Tests: `tests/unit/pipeline.test.js`. **K** should now be re-tested —
  it was almost certainly this lockup, not a permission gate.
- **Roll-button wiring** — J (wrong move on button), M (one-shot on v1.7.12).
  **J fixed in v1.7.13** — the button move and the move named in the narrator's
  closing italic hint were computed independently (the pacing classifier nominates
  before the narrator runs; the narrator may invite a different move). The button
  now reconciles to the move the prose actually names (`reconcileSuggestedMove` in
  `narrator.js`), so label, rolled move, and prose agree. **K resolved by the M/N
  fix** — K was verified to have no GM gate; the "can't roll" symptom was the
  stuck move-lock (M/N), now released. M one-shot fixed in v1.7.13 (see M).
- **Pronoun propagation (PLAYTEST-1711 E/F regression/gap)** — I (art),
  R (vignette text). **Both fixed in v1.7.13.** I: `buildEntityContext`
  (`src/art/promptBuilder.js`) reinforces the pronoun-derived gender descriptor
  at the end of the portrait prompt, so strongly-gendered "first look" text can
  no longer dilute the single leading mention. R: the `session_vignette` mode
  injects no entity cards, so pronouns now ride in the user-message hint —
  `composeConnectionHint` (end-session) and `summariseAbsent` (begin-session
  absent crew) lead with `Pronouns: …`.
- **Narrator memory / fact anchoring** — O (symptom), S (structural cause),
  L (ship position), T (sector context unused). **S/T fixed in v1.7.13.
  L fixed in v1.7.13** — `formatShipPositionLine` now derives a mobility
  status from the position source (`updatedBy`): `scene_token`/`at_command`/
  `expedition` → "docked at {place}"; `set_a_course` → "in transit to
  {destination}"; ambiguous sources keep neutral "near" phrasing (and, since
  issue #321 U53, `token_placement` — a token parked near a pin — reads
  "near"). The narrator
  can no longer improvise an underway framing when the ship is stationary, and
  cannot write the ship as docked when a course has been set.
  **O (general case) fixed in v1.7.13** — a new REQUIRED rule in
  `appendSidecarInstruction` instructs the narrator to emit a `newTruth`
  anchoring the identity of any named character who does not appear in the
  ENTITIES IN SCENE cards (name, role, relationship to PC) on first mention.
  Without this anchor, mid-scene characters accumulated contradictory details
  turn by turn; now their key facts are captured into `sceneTruths` the moment
  they are introduced.
- **Multiplayer / non-GM "parity" — RE-CHARACTERISED after reading source.**
  The code already supports players on all three; none is a simple `isGM`
  render gate. **E** (PTT): client-scoped opt-in the player never enabled —
  config/discoverability; **v1.7.13 clarified the setting hint** that it is
  per-player/per-device (each player enables it themselves). **H** (audio):
  player playback is supported (own key + blob URL); silence is downstream
  config or a player-path bug — **v1.7.13 now surfaces the real failure reason**
  to the player on a manual Play click (was a silent no-op / disabled button),
  so the next playtest reports *why* instead of "no sound"; the Tier 3 audio
  smoke remains the live pinpoint. **K** (rolling): no gate — resolved by the
  M/N fix. Lesson: the GM-only test pipeline didn't *gate* these — it just
  never exercised a player's *settings state* (client-scoped toggles/keys) or
  the v1.7.12 pipeline.
- **Vignette entity coverage** — B (second PC missing), R (NPC pronouns).
  **Both fixed in v1.7.13.**
- **PC-aware narrator/detector** — F (PCs proposed as Connections),
  G (Compel suggested against a fellow PC). **Both fixed in v1.7.13.**

---

#### A — Sector map placeables off the background / initial camera shifted off-canvas
*(observed v1.7.12; the v1.7.13 fix attempt made it worse — reported "completely
off the map on v1.7.13")*

**Symptom:** The sector map canvas extends into the black "no-scene" void on
the left; tokens and connections are visible but the initial view is
mis-centred, with a large portion of the scene area falling outside the
padded region. Pan/zoom-out behaviour is unpredictable. **On v1.7.13 the
content appears completely off the map.**

**❌ v1.7.13 attempt was incomplete and regressed.** It mis-diagnosed finding A
as a pure *camera* bug. The captured initial view had set `initial.x =
sceneWidth/2, y = sceneHeight/2`; v1.7.13 dropped them so Foundry would centre
on the scene-rect midpoint. But that left the **real** bug untouched and made the
result worse: see the root cause below.

**✅ FIXED PROPERLY in v1.7.14.** Root cause: every placeable (settlement /
planet / stellar **Notes**, passage **Drawings**, the command-vehicle **Token**)
is placed at raw `gridX * gridCellSize` — coordinates with their origin at the
**padded-canvas** top-left. With `padding: 0.1` Foundry insets the background
("scene rectangle") inside a larger canvas at `(sceneX, sceneY) ≈ (200, 200)`,
so every placeable lands ~200 px up-and-left of the background — out in the black
void. (Confirmed empirically: the misalignment appeared exactly when finding D
turned padding `0 → 0.1`; at `padding: 0` `sceneX = 0` and the offset is nil.)
The old camera `x: sceneWidth/2` happened to *also* ignore the inset, so it
accidentally framed the (cornered) content; v1.7.13's "correct" re-centre on the
scene-rect midpoint **de-aligned** the camera from the still-cornered content,
pushing it fully off-view. **Fix:** read `scene.dimensions` (Foundry's
authoritative `BaseGrid#calculateDimensions` result, via a `sceneRectOffset`
helper) and add `(sceneX, sceneY)` to **every** placeable coordinate, then set
the initial-view centre **explicitly** to `(sceneX + sceneWidth/2, sceneY +
sceneHeight/2)` from the same offset (not relying on Foundry's default centring,
which is unverifiable here). Content and camera now derive from one offset and
cannot drift apart. Tests: `tests/unit/sectorSceneBuilder.test.js` (offset +
centred-camera + dimensions-fallback). Camera geometry can't be
unit-verified, but the load view was **confirmed centred with the pins on the
background in a live session (2026-06-18) — finding A closed.** See
`decisions.md` → "Sector scene padding: never zero" → the 2026-06-15
placeable-offset refinement.

**Files:** `src/sectors/sceneBuilder.js` (`sceneRectOffset`, note/drawing/token
placement, `initial` centre).

---

#### B — Begin a Session spotlight vignette omits second player character

**Symptom:** With two player characters (Kylar and Mave), the Begin a Session
spotlight vignette only features one character (Kylar). Mave is absent from
the generated opening scene entirely.

**✅ FIXED in v1.7.13.** Root cause: `collectGalleyParticipants`
(`src/session/galleyVignette.js`) enumerated PCs from `game.users[].character`
— the per-user character assignment — not the actor roster. A PC actor that no
*connected* user had selected as their `User.character` was never added to
either the active or absent list, so it vanished from the prompt entirely. **Fix:**
enumerate the canonical PC roster (`getPlayerActors()`, which excludes NPC cards)
and use the user list only to decide present (assigned user is active) vs absent
(assigned user offline, or no assigned user). Every PC now appears — present ones
in the galley, the rest named in the banter. Falls back to the old enumeration if
the roster is somehow empty. Tests: `tests/unit/galleyParticipants.test.js`.

---

#### C — Vow card connection prompt doesn't create a draft entity for the GM

**Symptom:** When a non-GM player swears a vow that involves a named NPC
(here: "Administrator Lyssa Chen"), the vow result card correctly displays
*"Ask your GM to add Administrator Lyssa Chen as a connection (GM-only write)"*
— but no draft entity for that connection appears in the Entities panel. The GM
has no actionable prompt; the connection must be created entirely manually.

**Expected behaviour:** The vow resolution should emit a pending-connection
draft card (same mechanism as entity detection from narration), or at minimum
add a draft row to the Entities panel so the GM can confirm → create the
connection in one click.

**✅ FIXED in v1.7.13.** The non-GM branch of `buildSwearVowPlan`
(`src/session/swearVow.js`) previously set only an advisory string and returned.
It now sets `queueTargetDraft`, and `executeSwearVow` routes the named target
through `routeEntityDrafts([{ name, type: 'connection', description }], …)` —
the exact pipeline narration-detected entities use — so a GM-actionable draft
card appears with a one-click Confirm. The confirmation notice changed from
"Ask your GM to add …" to "… has been queued as a connection for your GM to
confirm." The world-write itself stays GM-only (PERSIST-001 family); only the
*draft* is emitted by the player. Tests: `tests/unit/swearVow.test.js`.

---

#### D — Auto-seeded connection gets a contradictory oracle-rolled role when the name already encodes one

**Symptom:** "Administrator Lyssa Chen" was created as a connection whose name
already carries a narrative role ("Administrator" — established by the vow
context). The oracle seeder independently rolled ROLE = "Shipwright", which
contradicts the established narrative. The Entities panel shows both: name
says Administrator, ROLE field says Shipwright.

**Expected behaviour:** When a connection name contains a recognised title or
role token (e.g. "Administrator", "Captain", "Doctor", "Councilor"), the
oracle ROLE roll should either be suppressed and the title used instead, or
the seeder should detect the conflict and leave ROLE blank/set it to the
title derived from the name.

**✅ FIXED in v1.7.13.** `seedConnectionActor` (`src/entities/connection.js`)
rolled the Character Role oracle whenever the record carried no explicit role.
It now consults `roleTitleFromName(actor.name)` first: a recognised leading
title (Administrator, Captain, Doctor/Dr, Councilor/Councillor, Governor, …) is
used as the Role verbatim, so "Administrator Lyssa Chen" gets Role =
"Administrator" rather than a contradictory oracle roll. Precedence: explicit
role → title-from-name → oracle roll. Whole-word matched (no "Drake" → Captain
false-positives). Tests: `tests/unit/connectionSeed.test.js`.

---

#### E — Push-to-talk button absent for non-GM players

**Symptom:** The push-to-talk microphone button renders in the chat input area
for the GM but is invisible to the second (non-GM) player. Both players are in
the same world; the GM's chat input shows the mic icon between the message
field and the toolbar, while the player's chat input shows only "Enter message"
with no mic button.

**VERIFIED cause (not a GM gate):** Read the source — there is **no
`game.user.isGM` gate**. `injectPushToTalkButton` (`src/index.js:2690`) runs
from the `renderChatLog`/`renderChatPanel`/`renderChatTab` hooks
(`src/index.js:2972-2977`), gated only on
`game.settings.get(MODULE_ID, "speechInputEnabled")`. That setting is
**`scope: "client"`, default off** (`src/index.js:308-313`). So PTT is a
per-client opt-in: the GM had enabled it in *their* client settings; the
non-GM player never enabled it in *theirs*, so the button never injected for
them. (Secondary possibility: the `PTT_HOST_SELECTORS` didn't match a
container in the player's chat DOM — that path logs a `console.warn`.)

**This is config/discoverability, not a gating bug.** Options: (a) surface the
client-scoped Push-to-Talk toggle more prominently for players, (b) document
that each player enables it on their own client, or (c) reconsider whether it
should be world-scoped with a per-client capability/feature-detect.

**Partial fix (v1.7.13 — option b):** the setting **hint** now states plainly
that Push-to-Talk is per-player/per-device — "each player turns it on in their
own client; the GM enabling it does not enable it for anyone else." The
injection code was already robust (multi-selector fallback + a `console.warn`
when no container matches), so no code-path change was needed; the gap was that
nothing told a player they had to opt in themselves. Options (a)/(c) remain
available if discoverability is still a problem in a future playtest.

**Files:** `src/index.js:308-318` (setting scope + hint), `:2690-2729`
(`injectPushToTalkButton`), `:2971-2978` (hooks).

---

#### F — Entity detector proposes player characters as new Connections

**Symptom:** After the Begin a Session opening narration (which featured both
PCs by name), the "New Entities Detected" card proposed creating Mave and
Kylar as Connection entities. Both are existing player characters, not NPCs.

**Expected behaviour:** PC names should be excluded from entity detection —
they are already tracked as player-owned Actors and must not be re-proposed
as Connections.

**✅ FIXED in v1.7.13.** The routing gate `entityExistsAnyType` *did* check PC
names (`isPlayerCharacterName`, added for F14, present in v1.7.12) — but it
**exact-matches** the normalized name, so a detection of "Kylar" never matched
the actor "Kylar Nazari" and slipped through into a draft. **Fix:**
`collectEstablishedEntityNames` (`src/entities/entityExtractor.js`) now adds the
PC roster (`getPlayerActors()`) to the ESTABLISHED ENTITIES list in the
detection prompt, so the model is told not to propose them at all — and an LLM
resolves the first-name variant ("Kylar" → "Kylar Nazari") that the exact gate
could not. NPC/connection cards (entityType-flagged `character` actors) are
excluded via `getPlayerActors`. Tests: `tests/unit/entityExtractorPCDedup.test.js`.

---

#### G — Narrator suggested Compel against a fellow player character

**Symptom:** Mave's player typed "Kylar, let him go, this is getting out of
hand" — an in-character appeal to the other PC. The narrator responded with a
narration ending "*If you want Kylar to stand down, that's going to take more
than asking nicely—this could be a Compel.*" and offered a **Roll Compel**
button targeting Kylar.

**Problem:** Compel is a move for influencing NPCs and difficult situations;
it is not appropriate to suggest one player character roll Compel against
another PC. In multiplayer, inter-PC tension is resolved through roleplay, not
move rolls.

**✅ FIXED in v1.7.13.** `narratePacedInput` (`src/narration/narrator.js`) now
runs `suppressPcDirectedSocialMove` on the classifier's nomination before it
reaches the narrator or the card: when the nominated move is a social move that
acts on another character (`compel`, `develop_your_relationship`,
`test_your_relationship`) **and** the player's input names a fellow PC (full
name or first-name token, whole-word, speaker excluded — via `getPlayerActors`),
the suggestion is dropped to `null`. The narrator is then never instructed to
write the move hint, and no Roll button is rendered — inter-PC tension stays
roleplay. Combat moves are intentionally **not** suppressed (PvP via Clash/Strike
is rules-valid). Tests: `tests/unit/narratorMoveHint.test.js`.

---

#### H — Narrator audio produces no sound for non-GM players (Play button present but silent)

**Symptom:** When a narrator card is posted, the GM hears the audio
automatically. The second (non-GM) player gets no audio. **The ▶ Play button
*is* present on the player's card** (so the button itself is not GM-gated), but
clicking it produces no sound — no autoplay, and the manual click is silent.

**VERIFIED — playback is NOT GM-gated (earlier hypothesis withdrawn):** Read
the source. The play path explicitly supports non-GM clients:
- The button un-hides only when `audioEnabledForThisClient()` is true
  (`src/audio/index.js:81-86, 291`), which requires **three** settings:
  `audio.enabled` (world, GM sets), `audio.clientEnabled` (**client**,
  `src/index.js:391-394`), and a non-empty `elevenLabsApiKey` (**client**,
  `src/index.js:386-390`, "Stored locally in your browser").
- Synthesis is **lazy-on-click for every client**, using *that client's own*
  ElevenLabs key (`src/audio/index.js:179`). `commitToCache`
  (`src/audio/index.js:199-233`) has an explicit non-GM branch: it emits the
  bytes to the canonical GM over a socket **and returns a local blob URL** so
  the player can play immediately. Playback is never gated to the GM.

**So because the player's button was *visible*, the player passed all three
gates — including having their own ElevenLabs key.** The silence is therefore
downstream, in the player's own synth→play path. Live-investigation candidates:
1. The player's key is present-but-invalid (passes the length check, fails the
   ElevenLabs fetch) → caught at `togglePlayback`'s `catch`
   (`src/audio/index.js:387-392`) → button flips to **"error"/disabled**.
   (cf. ENTITY-002: a config artifact, not a code defect.)
2. `buildPlayableSegments` returns 0 segments for the player → silent no-op
   (`src/audio/index.js:374-376`).
3. A real bug in the non-GM blob-URL playback (`PlaybackSession.play()` on the
   blob from `commitToCache`).

**This needs the audio smoke test (Tier 3) to pinpoint** — it's the exact case
that test should drive: a player client posting a card, clicking Play, and
either producing a `Sound` or surfacing the real error. Note the architectural
contrast with AUDIO-002: the design already returns a client-fetchable URL, so
this is likely (1) config or (2)/(3) a player-path bug, not a path-scope issue.

**Diagnostics improved (v1.7.13).** Source review confirmed the non-GM blob
path is sound (no playback gate; `commitToCache` returns a local blob URL for
non-GM clients), so the remaining cause is config (1) or a player-path bug
(2)/(3) — all of which were previously **silent**. `togglePlayback`
(`src/audio/index.js`) now surfaces the real failure to the player on a
*deliberate* Play click (autoplay stays quiet): the catch path shows
`Narrator audio unavailable: <reason>` (bad key, unconfigured voice id, synth
failure), and the 0-segments case — previously a silent reset to idle — now
warns and tells the player there was nothing to read. This converts the next
playtest report from "no sound" into the actual reason, which is what's needed
to close (1) vs (2)/(3). The Tier 3 smoke test remains the live pinpoint.

**Files:** `src/audio/index.js:81-86` (gate), `:179` (per-client key),
`:199-233` (`commitToCache` non-GM blob branch), `togglePlayback` +
`notifyAudioFailure`, `src/multiplayer/gmGate.js` (`isCanonicalGM`).

---

#### I — NPC portrait gender doesn't match rolled pronouns

**Symptom:** Administrator Lyssa Chen has pronouns "she/her" (rolled and
written to the actor), but the generated portrait is a clearly
masculine-presenting person. The pronoun is not informing the art prompt.

**✅ FIXED in v1.7.13.** Diagnosis corrected the original hypothesis: the
pronoun *was* reaching the prompt — `seedConnectionActor` leads
`portraitSourceDescription` with `pronounsToPortraitDescriptor(pronouns)` ("a
woman/man/person"), and `generatePortrait` passes that as the source
description. But that descriptor appears **once, mid-prompt**, sandwiched
between the style anchor and the rolled "first look" oracle text — and a
strongly-gendered first look (e.g. "a broad-shouldered figure with a heavy
beard") easily out-weighs a single neutral "a woman". **Fix:**
`buildEntityContext` (`src/art/promptBuilder.js`) now **reinforces** the
gender descriptor at the end of the prompt for connections (a high-weight slot
for image models), reusing the same `pronounsToPortraitDescriptor` so the two
mentions cannot drift. Only fires when the card actually has pronouns. Tests:
`tests/unit/promptBuilder.test.js`.

---

#### R — Session vignettes use wrong pronouns for NPCs
*(observed v1.7.11, post-rollback)*

**Symptom:** The closing vignette for Nova Petrov used pronouns that don't
match those stored on the actor card. Same issue class as finding I (portrait
gender mismatch) but in vignette *text* rather than art.

**✅ FIXED in v1.7.13.** Root cause confirmed: the vignettes run in the
`session_vignette` narrator mode, which (correctly) matches no entity cards —
there is no player narration to resolve relevance against — so the narrator
never sees an entity card listing the NPC's `Pronouns:` field that the move/paced
paths rely on. The NPC's only description reached the narrator through the
user-message hint, and `composeConnectionHint`
(`src/session/endSessionVignette.js`) read role/motivation/description but **not
pronouns**. **Fix:** the hint now leads with `Pronouns: …` (leading guarantees it
survives the 220-char truncation). The begin-session galley vignette had the
same gap for *absent* crewmates (the subjects of the banter) — `summariseAbsent`
(`src/session/galleyVignette.js`) now includes their pronouns too; active PCs
already had them. Tests: `tests/unit/vignettePronouns.test.js`.

---

#### S — Inciting incident facts age out of narrator context too quickly; recap adopts drifted version
*(spans rollback: inciting incident on v1.7.12, end-of-session recap on v1.7.11)*

**✅ FIXED in v1.7.13.** Root cause confirmed: there was **no campaign-level
home** for the premise. `runIncitingIncident` posted the opening fiction as a
chat card but never wrote it to `campaignState`; it survived only in the
recent-narration ring (last 3 cards — scrolls out fast) and, if the model
emitted them, scene-scoped `sceneTruths` (cleared/migrated at scene end). So the
premise aged out within a session and the narrator drifted on its load-bearing
facts ("three cycles" → "three weeks"); the recap then aggregated the drifted
beats. **Fix:** `runIncitingIncident` now captures the premise to a durable
`campaignState.incitingIncident` record (prose + vow/clock/target), and
`buildNarratorSystemPrompt` injects a `## CAMPAIGN PREMISE` section as canon on
**every** narrator call — campaign-level, never dropped, never scene-scoped
(unlike the §6.5 ledger). Because the narrator no longer drifts, the recap no
longer crystallises drift (fixed at the source, not after the fact). Tests:
`tests/unit/incitingIncident.test.js`, `tests/unit/narratorPrompt.test.js`.
Partially addresses **O** for the inciting case (the dead character's facts ride
in the premise prose); the general referenced-but-absent-character case is still
open.

**Symptom:** The inciting incident established "murdered Councilor Vex **three
cycles ago**". Within the same session the narrator drifted to "**three weeks
ago**" (finding O), and by end-of-session the campaign recap had fully adopted
the drifted version — the recap says "murdered on Paradox three weeks ago",
overwriting the inciting incident's ground truth.

**Root cause:** The inciting incident's key facts (time, location, method,
parties) are not being written to the narrator sidecar with sufficient
permanence. They should be tier-0 immutable truths — always injected into
every narrator call for the life of the campaign. Instead they appear to be
stored as ordinary recent-narration entries that scroll out of the ring buffer
as the session progresses, leaving the narrator with no anchor and free to
reinvent details. The Narrative Review catches the drift (finding O) but only
after the fact, and the recap then crystallises the wrong version into campaign
history.

**Expected behaviour:** The inciting incident's extracted facts should be
written to the sidecar's permanent/never-dropped tier (see
`rules/narrator-memory.md` invariants) on creation and re-injected on every
narrator call, regardless of session length.

**Files to check:** `src/narration/narrator.js` or `src/context/assembler.js`
(where inciting incident data is assembled for the narrator context);
`rules/narrator-memory.md` (never-dropped tier contract);
`docs/narrator/narrator-memory-architecture.md` (sidecar write path for
inciting incident).

---

#### T — Inciting incident ignores existing sector NPCs and settlement attributes; consistently invents new ones
*(inciting incident generated v1.7.12; reported after rollback)*

**✅ FIXED in v1.7.13.** Root cause: the narrator's ACTIVE SECTOR anchor
(`formatActiveSector`, `src/narration/narrator.js`) passed only settlement
*names* — the rolled Authority/Population/Trouble live on the Settlement Actor
records, and the existing NPC roster was surfaced only as a bare count
(`buildConnectionsSummary`). So the inciting-incident narrator had no idea
Hypatia was lawless or that Nova Petrov already existed, and freely invented an
"Administrator". **Fix:** `formatActiveSector` now reads `listSettlements` /
`listConnections` and surfaces, for the active sector, each settlement with its
**Authority** and **Trouble** (plus a directive not to introduce an official /
administrator / governing figure where Authority is none/lawless) and the
established **NPC roster** with roles (plus a prefer-build-on-these directive,
capped at 12). The `inciting_incident` sidecar addendum gains a matching
"ground it in the established sector; reuse an existing NPC or settlement trouble
before inventing" instruction. Tests: `tests/unit/sectorContext.test.js`. Note
this enriches the anchor for **all** narrator paths (paced/move/scene/inciting),
so authority contradictions are discouraged everywhere, not just at campaign
start.

**Symptom:** The inciting incident created "Administrator Lyssa Chen" as the
authority figure at Hypatia — but Hypatia's own sheet says **Authority: None
/ lawless**. An administrator cannot exist for a lawless settlement. Across
multiple recent sessions the inciting incident has always invented a new NPC
and attached a new clock, never leveraging the sector's existing cast or
world details.

**Expected behaviour:** Before generating an inciting incident NPC, the
generator should:
1. Read the hub settlement's **Authority** field — if lawless, do not create
   a governing/official role for the inciting NPC.
2. Check whether the sector already has registered NPCs (e.g. Nova Petrov in
   Igneous Maze) and prefer one of them as the inciting actor when the
   scenario permits, rather than always cold-creating a new connection. NPCs
   that were sector-seeded likely have more world context already attached.
3. At minimum, constrain the inciting NPC's role to something consistent with
   the hub settlement's populated attributes (Authority, Population, Projects,
   Trouble).

**Files to check:** Wherever the inciting incident is generated — likely
`src/moves/resolver.js` (the `begin_a_session` / inciting incident
consequence) or a dedicated inciting-incident builder; confirm it reads
`campaignState` settlement attributes and the sector's existing NPC list
before creating a new actor.

---

#### J — Roll button move doesn't match the move named in narrator text

**Symptom:** The narrator text reads "*If you want to draw out what he's
running from, this could be a Gather Information.*" — correctly identifying
the move. The button rendered below says **Roll Compel**, not Roll Gather
Information. The move identified in prose and the move wired to the button
are different.

**✅ FIXED in v1.7.13.** The original hypothesis (a move-extraction regex failing
to match) was **wrong** — no such regex existed. The button label was set
**entirely from the pacing classifier's `suggestedMove`**, computed at pipeline
entry *before* the narrator runs. The narrator is then merely *asked* to write a
closing italic hint about that move, but has explicit creative latitude to invite
a different move instead (e.g. the classifier picks Compel; the narrator decides
Gather Information fits the scene better and writes that). Label and prose then
diverge — and because the button re-posts with `forcedMoveId: suggestedMove`, the
*rolled* move was the classifier's, not the one the player read.

**Fix:** after the narration is generated, `reconcileSuggestedMove(text,
classifierMove)` (`src/narration/narrator.js`) reads the move named in the
narrator's final italic span and, when it names a recognised move, uses *that*
for the button (label + `suggestedMove` flag). The prose the player reads is the
source of truth; the classifier's nomination is the fallback when the hint names
no recognised move or the narrator wrote none. Only the last italic span is
scanned, so single-word move names ("Strike", "Compel") in the prose body cannot
false-match. Tests: `tests/unit/narratorMoveHint.test.js`.

---

#### K — Non-GM players cannot use the Roll move button *(observed v1.7.12)*

**✅ RESOLVED by the M/N fix in v1.7.13.** Source review confirmed there is **no
GM gate** on the button or its handler (see "VERIFIED" below); K was observed
only on v1.7.12, which the M/N move-lock regression bricked. The non-GM player's
re-posted move hit the stuck `pendingMove` lock, so the click appeared to do
nothing / surfaced the caught permission debug-log. With the lock now released
before the rider prompt (M/N), the canonical-GM pipeline runs the player's
re-posted move as designed. No independent permission defect remained.

**Symptom:** The Roll [move] button on narrator cards is non-functional for
the second (non-GM) player — they reported a permission error / nothing
happening on click.

**VERIFIED — no GM gate on the button or handler (earlier hypothesis
withdrawn):** Read the source. The handler (`src/index.js:3074-3113`) has **no
`game.user.isGM` gate**. On click it (a) best-effort sets a `rolled` flag via
`message.update` — which *does* fail for a non-owner player and is explicitly
caught and logged to `console.debug` only (`src/index.js:3095-3100`), and (b)
posts a fresh `ChatMessage` carrying `forcedMoveId` (`:3101-3108`). The move
pipeline then runs on the **canonical GM** client (`isCanonicalGM()` at the
pipeline entry) — correct multiplayer design (world writes belong to the GM).

**Revised cause:** K was observed on **v1.7.12**, which finding P proved is a
regression (v1.7.11's Roll button works). So "lacks permission to roll" is most
likely a manifestation of the **move-lock lockup (M/N)** rather than a real
permission gate — the player's re-posted move hit the stuck pipeline. The only
genuine "permission" event in the path is the *caught* `message.update` for the
`rolled` flag, which is non-fatal and not user-visible by design.

**Re-test on v1.7.11** before treating K as independent of the M/N regression.

**Files:** `src/index.js:3074-3113` (handler — no gate), the pipeline entry
`isCanonicalGM()` gate (`src/index.js` ~`:758`, the `bypassPacing` branch).

---

#### M — Roll button works only on the first narrator card; dead on all subsequent cards

**✅ FIXED in v1.7.13** — see the Move-lock cluster note above. The button was
never the problem: after the first move whose outcome opened a consequence-rider
prompt, the held `pendingMove` lock made every subsequent move's re-posted input
short-circuit at the concurrency guard. Releasing the lock before the rider
prompt restores repeated Roll-button use. The original analysis (handler
registered `{ once: true }` / consumed reference) was **not** the cause —
verified against `src/index.js:3074-3113`, which re-binds per render.

**Symptom:** The Roll [move] button in narrator chat cards fires correctly the
first time it is clicked in a session. All subsequent Roll buttons on later
cards do nothing — no roll, no error.

**Likely cause:** The click handler is registered once (e.g. via a
`renderChatMessageHTML` hook with an internal guard that prevents
re-registration, or an `addEventListener` with `{ once: true }`) and is
consumed on the first click. Later cards render new button elements that never
get a handler attached, or the handler lookup finds a stale/already-consumed
reference.

May interact with finding K (non-GM permission block) — if the handler exits
early on the first non-GM attempt, the GM's handler may also be considered
consumed.

**Files to check:** `src/index.js` or `src/narration/narrator.js` (Roll
button `addEventListener` / hook registration — check for `{ once: true }` or
a WeakSet/Set guard that marks the element as handled); `src/system/chatHooks.js`
(`onChatMessageRender` dedup logic — the WeakSet dedup added for V13-002 may
be marking cards handled without attaching the Roll listener).

---

#### N — Narrator card stops appearing for paced inputs mid-session

**✅ FIXED in v1.7.13** — same root cause as M (see the Move-lock cluster note
above). The "move in flight" guard the inputs hit was the held `pendingMove`
lock, kept `true` by the consequence-rider dialog open on the GM's screen. The
diagnosis below ("lock set on the first roll never released") was correct in
shape; the specific never-releasing await was the post-roll rider prompt, fixed
by releasing the lock before it.

**Symptom:** Pacing telemetry continues to log decisions (`NARRATIVE`,
`NARRATIVE_WITH_MOVE_AVAILABLE`) for player inputs, but no narrator chat card
is posted. Instead, a **blue toast appears saying "a move is being resolved"**
each time. The pacing classifier is working; the narrator call is being
intercepted by a move-in-progress guard that never cleared.

**Likely cause:** Strongly suggests the move-in-progress lock (set when the
first Roll button was clicked in finding M) was never released — possibly
because the move roll didn't complete cleanly (finding M: button went dead
after first click). Every subsequent narrator call hits the "move in flight"
guard, posts the toast, and returns early without generating a card. The
pacing telemetry runs before this guard and is unaffected.

**Files to check:** `src/index.js` or `src/moves/pipeline.js` — the
move-in-progress flag / lock variable and where it is cleared; confirm it is
reset on both success AND failure/cancellation of a move roll. This is likely
the root cause behind both M and N: a lock set on the first roll is never
released.

---

#### O — Referenced dead character accumulates contradictory details across turns

**Symptom:** Councilor Vex (murdered before the session, never an active
entity) is described inconsistently within a single scene: the narrator said
"three weeks ago" in one turn; the Narrative Review flagged an earlier
statement of "three cycles ago" for the same event. The Narrative Review is
working correctly — it caught the contradiction — but there is nothing to
prevent the contradiction from occurring in the first place.

**Root cause:** Vex has no entity record in the Entities panel. Without a
persistent fact sheet, each narrator call can freely invent or misremember
details (time of death, location, method, relationship to other characters).
The Narrative Review catches deviations after the fact but cannot enforce
consistency at generation time.

**Desired behaviour:** When the narrator introduces a referenced character
with a name (Councilor Vex, Silas Kade, etc.), their key facts should be
captured in a scene-truths / lore entry the first time they appear and
included in the narrator context for all subsequent turns, so the model has
a ground-truth anchor to write against.

**Files to check:** `src/narration/narratorPrompt.js` (how referenced
third-party names are handled); `docs/narrator/narrator-memory-architecture.md`
(scene truths / entity-card injection) — determine whether referenced-but-absent
characters can be added to the narrator's working lore set mid-scene.

**Partial mitigation (v1.7.13 — earlier):** Two changes reduced the rate. (1) Finding
S records the inciting incident as durable canon, so a character named only in
the opening premise (Vex) now rides in the CAMPAIGN PREMISE block every turn.
(2) The CAST DISCIPLINE rule steers the narrator away from minting parallel
throwaways.

**✅ FIXED (general case) in v1.7.13.** A new REQUIRED emission rule added to
`appendSidecarInstruction` (`src/narration/narratorPrompt.js`) now instructs the
narrator to emit a `newTruth` for any named character or faction on their FIRST
mention in the scene, when they do not appear in the ENTITIES IN SCENE cards.
The truth must anchor their identity — name, role/profession or agenda, and
relationship to the player character. Once captured into `sceneTruths`, the fact
rides in subsequent turns' ACTIVE SCENE block, giving the model a stable
ground-truth anchor to write against for the rest of the scene. The Narrative
Review continues to catch post-generation drift; this prevents it at generation
time.

---

#### P — Rolling back to v1.7.11 cleared the stuck move-lock; Roll button works correctly on v1.7.11
*(this finding IS the rollback boundary: v1.7.12 → v1.7.11)*

**Observation (this is a diagnostic, not a defect on v1.7.11):** After the
v1.7.12 session locked up (findings M/N — the move-in-progress lock stuck, blue
"a move is being resolved" toast suppressing narration), the GM **logged out,
rolled the module back to v1.7.11, and logged back in. That recovered the
module.** On v1.7.11 the Roll button then **triggered a roll correctly both
times it was offered** — the stuck-lock behaviour was gone.

**What this tells us:**
- The move-lock lockup (M/N) is a **v1.7.12 regression**. v1.7.11 does **not**
  exhibit it — the Roll button fires a roll correctly there. The fix target is
  whatever changed in the move pipeline / Roll-button path between v1.7.11 and
  v1.7.12.
- The recovery combined a relog **and** a version rollback, so we cannot isolate
  which cleared the lock. We therefore **cannot conclude** the lock is stored
  durably (world settings / `campaignState` / flag) — the earlier "persists
  across reload" theory is **withdrawn**; there is no evidence for it. An
  in-memory module-state lock cleared by the reload is equally consistent.

**Fix direction:** Diff `v1.7.11..v1.7.12` around the move pipeline and the
Roll-button click handler to find the regression that leaves the lock set
(findings M/N). A `ready`-hook reset of the lock is still worth adding as
cheap defence-in-depth, but it is not established that the lock is persisted.

**✅ RESOLVED in v1.7.13.** The diff confirmed the regression (consequence-rider
dialog inside the lock — see the Move-lock cluster note and M/N). Notes now
verified: the lock **is** persisted (it lives in `campaignState.pendingMove`, a
world setting), and the `ready`-hook stale-lock reset already existed
(`src/index.js`, "Reset stale pendingMove lock on ready") — that reset is
exactly why the relog/rollback recovered the session, and why we couldn't
isolate relog-vs-rollback (either path fires the same `ready` reset).

**Files to check:** the move-in-progress flag / lock in `src/index.js` or
`src/moves/pipeline.js`; the Roll-button handler in `src/index.js` /
`src/narration/narrator.js`. Start from the v1.7.11→v1.7.12 diff.

---

#### Q — WITHDRAWN (not a bug — confirmed correct behaviour on v1.7.11)

**Originally logged as:** "Roll button consumed an asset trait instead of
rolling the move."

**Resolution:** Confirmed with the playtester — this was **working as
intended**. On v1.7.11 the Roll button rolled correctly both times it was
offered (finding P). The "pulled the Courier trait off my card" behaviour was
the move correctly **identifying the player's Courier asset as relevant and
offering the option to use it** — a feature, not a side effect. No move roll was
lost. The letter Q is retained as a withdrawn placeholder so the A–T sequence
and existing cross-references stay stable.

---

#### L — Narrator invented ship-in-motion context when docked at a station

**Symptom:** The party is docked at a station waiting to hand over a fugitive.
The narrator wrote "if you turn this ship around — the Khatri syndicate
doesn't leave witnesses when they collect bounties" — implying the ship is
currently underway and could change course. The ship is stationary; no
turn-around is possible.

**Root cause:** The narrator prompt lacks the ship's current position/status
(docked vs. in transit), so the model defaults to generic "ship in space"
framing and invents movement context. PLAYTEST-1710 F5 established that the
command-vehicle token on the sector scene is authoritative for position, but
that position data may not be flowing into the paced-narration context here.

**✅ FIXED in v1.7.13.** `formatShipPositionLine` (`src/factContinuity/shipPosition.js`)
now derives a mobility signal from the `updatedBy` source field on the position
record: `scene_token` / `at_command` / `expedition` → "docked at {settlement}";
`set_a_course` → "in transit to {destination}"; ambiguous sources (`narrator_sidecar`,
`manual`, `null`) keep neutral "near" / "in orbit of" phrasing (no false certainty).
Since issue #321 U53 a token parked near a pin, or placed automatically, is stamped
`token_placement` and reads "near"; `scene_token` is the arrival of a drop on a pin.
The SHIP POSITION line in the narrator system prompt now explicitly names the
ship's mobility state, preventing the model from improvising underway framing
when docked or vice versa.

---

### SAFETY-001 — Safety config sync is client-initiated

**Status:** Mitigated in the v1.7.31 cycle (2026-10) — one residual limit,
below. See also SAFETY-PRIVATE-LINES-SHARED (open).

**Was:** `syncSafetyToCampaignState()` (`src/ui/settingsPanel.js`) bridges
`game.settings` (world-scoped global Lines / Veils, client-scoped Private
Lines) into `campaignState.safety`, but returned early on every player client,
so a player's Private Lines never reached `campaignState.safety.privateLines`
(SAFETY-PRIVATE-LINES-PLAYER).

**Now:** It still runs on every client's `ready` hook and after every Lines /
Veils / Private Lines write. A GM's client writes the global Lines / Veils and
its own Private Lines directly. A player's client relays its Private Lines to
the canonical GM (gmRelay `safety.syncPrivateLines` → `applyPrivateLinesSync`,
keyed on the relay requester; an empty list removes the entry). With no GM
connected the relay is deferred (debug-logged), and every player re-sends when
the canonical GM broadcasts that its relay listener is ready
(`gmRelay.ready` → `onGmRelayReady`, registered by `registerPrivateLinesGmPull`)
— a pull, because the old `userConnected` re-send fired before the GM's
listener existed and was always dropped. Simultaneous re-sends don't race:
each sync runs at once on the GM (unqueued since issue #345 D5) and reads
the store at its turn on the GM's campaignState write chain.

**Residual:** a player's Private Lines reach `campaignState` only once their
client and a GM have been online together; after that they persist there.
Their own Private Channel does not wait for that: since issue #345 AA03 it
reads their lines from their client setting, as a player's own narration
does, so the residual is a GM-built narration while the player has not been
online with a GM since adding a line. Two GMs loading at once no longer drop
an entry (issue #345 AA35: every client re-syncs its own when a write
misstates it).

---

### COVERAGE-001 — Function coverage below the historical 65% threshold

**Status:** Superseded (2026-07-07) by the two-tier coverage gate — decisions.md
→ "Coverage gate: ratchet + core bar, not a flat 95%". Kept here because the
floor is a ratchet, not a target.

**Gate today (`vitest.config.js`):** a **floor** over everything the unit suite
can structurally reach — **70 lines / 68 branches / 60 functions** — and a
**95-class core bar** (95 lines / 95 functions / 80 branches) over the
pure-logic spine (`schemas.js`, `moves/resolver.js`, `moves/mischief.js`,
`narration/narratorPrompt.js`, `character/chronicle.js`, `context/safety.js`,
`truths/tables.js`). `src/index.js`, `src/ui/**`, `src/safety/**`, the other
ApplicationV2 / DialogV2 render layers, `src/input/**` and the help content are
excluded — Quench and the Cypress e2e stack cover them. Measured at the 2026-10
follow-up: 85.1 lines / 73.3 branches / 83.2 functions.

**History:** the original cause — `resolver.js`'s per-move `CONSEQUENCE_MAP`
arrow functions reported as uncovered, so `functions` was dropped to 50% — no
longer applies; `resolver.js` sits under the core bar. The 2026-10 audit added
unit coverage for the previously untested `src/session/campaignStart.js`
(UNTESTED-CAMPAIGNSTART).

**Recalibration protocol:** raise the floor toward measured actuals (keep ~2 pts
of headroom) in a dedicated commit; never lower a threshold to make a feature
land.

---

## Resolved issues

### PERSIST-001 — persistResolution gated to GM only ✓

**Resolved in:** the v1.7.31 cycle (2026-10 repo audit) — by the single-emitter
design plus roller attribution; the remaining player writes now relay.

**Was:** reported as "player-triggered moves do not persist meter changes"
because `persistResolution()` writes world-scoped state and is gated to
`game.user.isGM` at the pipeline site, with "a player→GM persistence relay" as
the outstanding fix.

**Verified against source:** the move pipeline never runs on a player's
client. The `createChatMessage` hook returns early unless `isCanonicalGM()`
(`src/index.js`), so every player's typed move is interpreted, narrated and
persisted on the canonical GM — the `isGM` check at the persist site is always
true there. Attribution follows the roller: the pipeline resolves
`speakerActorId` (`resolveSpeakerActorId`) and passes it to
`persistResolution(resolution, campaignState, speakerActorId)`, which falls
back to the first PC only when no speaker resolves (the never-written
`campaignState.activeCharacterId` fallback is deleted). The other
player-initiated writes PERSIST-001's family covered — session dialogs, the
X-Card, `!bond`, `!truth` / `!state`, `!repair`, Burn / Improve, the milestone /
connection pickers, the won-fight buttons — go through the canonical-GM relay
(`src/multiplayer/gmRelay.js`). The pipeline's persist also merges onto the
latest stored state, so relayed writes that land mid-move survive
(STALE-SNAPSHOT-CLOBBER).

**Still true (by design):** a GM must be connected for world writes; player
paths warn when none is (`requestGmAction` → "no GM is connected"). A few
source comments still cite PERSIST-001 as the reason a write is GM-gated —
that gating is intended; the relay is how players reach it.

---

### SECTOR-SWITCH-001 — `!sector <name>` silently no-ops for non-GM players ✓

**Resolved in:** the v1.7.31 cycle (2026-10 repo audit).

**Was:** the switch branch in `handleSectorCommand` was gated
`if (sub && game.user.isGM)` with no `else`, so a player's `!sector <name>`
did nothing and said nothing — and because every client ran every command,
the GM's client then executed the switch on the player's behalf.

**Fix:** `!sector` is AUTHOR-routed (only the typist's client runs it). A
player's `!sector <name>` warns that switching is GM-only; a bare `!sector`
posts a usage card whispered to the typist. `!sector list` stays open to all.
Tests: `tests/unit/chatCommandRouting.test.js`.

---

### PLAYTEST-1711 — v1.7.11 playtest follow-ups (quickstart sheet, HTML characteristics, ship token, camera, pronouns, voices, post-roll improve) ✓

**Status:** Resolved on `claude/admiring-carson-qlzr7h` (v1.7.12). Seven
findings, full write-up in `docs/testing/v1.7.11-playtest-findings.md`:

- **A** — quickstart PC opened with the classic Ironsworn sheet (same class as
  v1.7.10 NPC finding, new call site). Quickstart pins the Starforged sheet;
  the ready-time backfill now repairs PCs too.
- **B** — NPC Characteristics rendered raw HTML (the Starforged sheet's
  Characteristics is a plain `<textarea>`). Now written as plain text; Notes
  (rich-text) keeps HTML.
- **C** — a ship token dragged from the sidebar was invisible to positioning
  (all logic gated on a flag only the module's auto-placement set).
  `isCommandVehicleToken` now recognises by actor identity; quickstart places
  the ship after creating it.
- **D** — sector map camera trapped by `padding: 0` (no pan/zoom-out). Restored
  `0.1` padding + a captured initial view.
- **E** — NPCs had no established gender, so art/narrator/audio guessed
  independently. Pronouns are now rolled once and propagated to all surfaces.
- **F** — audio used one NPC voice for everyone. Optional pronoun-keyed voices;
  the focal NPC selects the matching voice (depends on E).
- **G** — assets like Fugitive that improve a result post-roll had no way to be
  applied. New post-roll **✦ Improve to Strong Hit** affordance modelled on Burn
  Momentum, advancing the asset's clock as the cost.

---

### PLAYTEST-1710 — v1.7.10 playtest follow-ups (NPC sheet, name drift, stellar variety, ship position) ✓

**Status:** Resolved on `claude/admiring-carson-qlzr7h` (v1.7.11). Five
findings, full write-up in `docs/testing/v1.7.10-playtest-findings.md`:

- **NPC cards opened with the classic Ironsworn sheet** (F1, causing F4's
  invisible portrait/intro — the classic sheet's Notes tab binds
  `system.biography`, not `system.notes`). NPC-card creation now pins
  `core.sheetClass` to the Starforged sheet; ready-time backfill repairs
  existing cards.
- **Actor renames didn't propagate to entity records** (F2) — panel and
  narrator context kept the registration-time name snapshot. Live
  `updateActor` sync + ready-time reconciliation; panel prefers the host
  document name.
- **Every star in a sector was identical** (F3) — the v1.7.1 F7 fix rolled
  STELLAR_OBJECT once per sector. Restored per-settlement rolls.
- **`@scene where am I` invented a location** (F5) — no initial position was
  ever seeded AND the entire §20 write/resolve chain was dormant-broken
  (record-GUID-vs-actor-id updateShip calls, phantom
  `campaignState.settlements` reads, journal-only `!at` resolution, a latent
  sync→drag-handler loop). A command-vehicle token on a sector scene is now
  authoritative for position; inciting incident seeds the start; empty
  records inject a "not yet established" guard line.

---

### PLAYTEST-176 — v1.7.6 playtest follow-ups (NPC-as-character ripple + finalize-first) ✓

**Status:** Resolved in v1.7.7 (unreleased). Four issues found playtesting v1.7.6,
all stemming from FOLDER-002's "NPCs are `character` actors" + auto-seed firing at
creation:

- **NPC got a PC-only momentum grant** (Begin-a-Session "+1 momentum to all
  players"). `getPlayerActors()` filtered `type === 'character'`, which now
  matches NPC cards; in solo play the player-owned fallback returned all
  characters. Added `isPlayerCharacterActor()` (character **and** no module
  `entityType` flag) and excluded NPC cards from `getPlayerActors`, the
  chat-speaker resolver, the PC-find in `index.js`, and `isPlayerCharacterName`.
  The assembler was likewise rendering the NPC as the PC in CHARACTER STATE.
- **Settlements moved to `Sectors / Unsorted` on reload.** `flattenSectorActorFolders`
  relocated a correctly-foldered settlement into Unsorted whenever its sectorId
  didn't resolve. It now leaves an actor that's already settled in a real
  `Sectors / <Name>` folder where it is.
- **Ship auto-populated at creation (modules + flavour + art), no setup window,
  no finalize.** Auto-seed (`autoSeedStarship` / `autoSeedConnection`) now defaults
  **off**; ships are light-registered blank (so they appear in the Entities panel)
  and NPCs are created blank. Population runs on the **✦ Finalise** affordance,
  which delegates to `seedStarshipActor` / `seedConnectionActor`. Connection added
  to the panel's finalize types.
- **NPC portrait not embedded at full size in Notes.** A creation-time ordering
  race between the seed's Notes write and the portrait attach; running the seed
  once on Finalise (not at creation) removes it.

(commits `7426743`, `b04aa6d`, `8cf07ae`)

### FOLDER-001 — Empty duplicate sector subfolders spawned on every world load ✓

**Status:** Resolved in v1.7.6 (unreleased).

**Symptom (historical):** A new **empty** `Sectors / <Name>` Actor folder was
created on every world load, accumulating identically-named duplicates (playtest:
four "Outer Threshold" folders, settlements in only one).

**Cause:** `ensureFolderPath` compared `f.folder` directly to a parent id string,
but Foundry v13's `Folder#folder` getter returns the parent Folder **document** —
so nested-folder lookups never matched and a duplicate was minted each load. The
unit-test folder mock stored `folder` as an id string, which hid the bug.

**Fix:** `folder.js` adds `folderParentId()` to normalise the parent ref (document
| id | null) before comparison; `flattenSectorActorFolders` (on ready) now also
removes empty **duplicate** per-sector folders already accumulated in live worlds,
keeping one populated folder per name. Regression test seeds a v13
document-getter parent. (commit `13dbcd4`)

### FOLDER-002 — PC / Ship / per-sector-NPC folders + NPC card population ✓

**Status:** Resolved in v1.7.6 (unreleased). Design was settled all along
(`issue #228 (Entity → Actor Migration)` §3.4, finding **F8**); the gap was
pre-population. See `decisions.md` → "NPCs and connections: native ironsworn
`character` Actors".

**Delivered:**
- **Activation-time Actor folders** — `PCs/`, `Starships/`, and per-sector
  `Sectors / <Name> / NPCs/`. Loose PCs/ships are filed into them on ready
  (`scaffoldPcShipFolders`); module-managed NPC cards are skipped.
- **Connections are ironsworn `character` Actors** (NPC cards), not journals —
  `registry.js` routes `connection → actor`; `connection.js` create/read/update
  go through the actor host; the sector wizard places its connection in the
  sector NPC folder.
- **NPC card auto-population** (`createActor` hook + `autoSeedConnection`
  setting): rolls the Character oracles (First Look, Initial Disposition, Role,
  Goal) into the **Characteristics** field (`system.biography`), composes a
  narrator intro for the **Notes** tab (`system.notes`), and fires a silent
  portrait that attaches to the card + prototype token and embeds a large copy
  in Notes.
- **Migration** of pre-existing journal-backed connections to NPC cards on ready
  (`migrateJournalConnectionsToActors`).

(commits `4c849b2`, `914bb33`, `5bec6c5`, `717e11f`)

### ENTITY-002 — Settlements arrived blank without API keys (config, not a defect) ✓

**Status:** Resolved — config artifact, not a code defect. Confirmed in the
v1.7.5 playtest (2026-06-03).

**Symptom (historical):** With no API keys configured, newly created settlements
(e.g. "Pinnacle", "Legacy", "Vega") showed the default hooded silhouette and no
flavor/description prose — only the empty oracle-roll buttons.

**Resolution:** With both keys configured, settlements populate correctly:
generated portrait + token art and full descriptive prose (e.g. "Lastport" in
Kronos Vigil shows a portrait thumbnail and a paragraph of narrator prose plus
the stat line; sibling settlements Forsaken/Hyperion/Osseus likewise show
generated art). Description prose is written by Claude (`src/api-proxy.js`) and
portrait art via OpenRouter (`src/art/openRouterImage.js`); both correctly no-op
without their keys, so the entities arrived blank. Generation is properly gated
on key presence — no code fix required.

### TOOLBAR-001 — Companion launcher dead whenever no scene was active ✓

**Status:** Resolved in v1.7.5

**Symptom (historical):** Clicking the Starforged Companion buttons in the
scene-controls toolbar (the meteor group, F16) did nothing — no panel opened,
no console error. Reported across v1.7.0–v1.7.2 playtests.

**Cause:** The launcher was a scene-control group backed by a canvas
`InteractionLayer`. Foundry can only *activate* a control group when
`canvas.ready === true`; with no active scene (mapless / theater-of-the-mind
play, or a Forge launch setting with no default scene) the **entire**
scene-controls bar is inert — clicking any group icon, Foundry's own (Walls,
Lighting) included, fails to switch. Confirmed by live tracing
(`canvas.ready`/`hasScene` both `false`; Walls also froze on `tokens`). Two
earlier attempts misread it as a problem with *our* group — the v1.7.1
`activeTool` band-aid and a v1.7.4 `primary`→`interface` canvas-group change
(both released without fixing mapless play) — but no group-config fix can help
when the surface itself needs a canvas.

**Fix:** Moved the launcher off scene-controls onto a floating, draggable,
frameless `ApplicationV2` pinned to the viewport (`src/ui/companionToolbar.js`),
opened at `ready`, working with or without a scene. Removed the scene-controls
group, its two hooks, `buildCompanionTools`, and the fake `StarforgedCompanionLayer`.
See `decisions.md` → "Companion launcher: floating toolbar, NOT scene-controls".

**Note:** `foundry-ironsworn`'s own `ironsworn` control group has the same defect
in v13 (it never activates without a scene) — an upstream issue, independent of
this module.

---

### NARRATOR-001 — Loremaster removed; direct narrator now implemented ✓

**Status:** Resolved

**Symptom (historical):** No narration after move resolution — the pipeline
posted a result card but no narrative continuation followed, because the
Loremaster dependency had been removed before its replacement existed.

**Fix:** Direct Claude narration implemented in `src/narration/narrator.js` +
`src/narration/narratorPrompt.js`, wired into the move and paced pipelines. See
`decisions.md` → "Narration: direct Claude API (not Loremaster)". The Narrator
scope is ✅ COMPLETE in `scope-index.md`.

---

### DIALOG-001 — `Dialog.confirm()` deprecated in v13 ✓

**Status:** Resolved

**Fix:** Replaced `Dialog.confirm(...)` with `DialogV2.confirm(...)` (option shape
`{ window: { title }, content }`). No `Dialog.confirm` remains in `src/`; call
sites use `DialogV2.confirm` in `entityPanel.js`, `progressTracks.js`, and
`customOracles.js`.

---

### V13-002 — `renderChatMessage` hook deprecated; all chat-button handlers silently dead in v13 ✓

**Status:** Resolved

**Symptom:** In Foundry v13, every button wired by a chat-render hook did
nothing on click — recap card Refresh, audio narration ▶ Play, NWMA Roll
<move>, draft entity Confirm/Dismiss, burn momentum, Correct a fact, and
Set World Truths. No console errors. Cards rendered correctly.

**Cause:** Foundry v13 deprecated the v12-era `renderChatMessage` hook in
favor of `renderChatMessageHTML` (HTMLElement, not jQuery). Late-v13
builds stopped firing the legacy name. All seven handlers in the module
listened on `renderChatMessage` and were silently bypassed.

**Surfaced by:** First-ever Quench run inside a Docker-hosted v13 — the
recapCard Refresh test reported "handler may be unwired"; the Audio
Narration button test timed out waiting for the button to unhide.

**Fix:** Added `src/system/chatHooks.js` exporting
`onChatMessageRender(handler)` which subscribes to both hook names and
dedupes by rendered-element identity (WeakSet) to handle transitional
v13 builds that fire both names. Module.json's `minimum: "12"` keeps the
legacy name necessary.

---

### QUENCH-004 — Test-document leakage across batches polluted fresh worlds ✓

**Status:** Resolved

**Symptom:** A brand-new world that had only ever run Quench accumulated:
settlement Actors named "Glimmer" / "Selena", pending-lore pages named
"Drifter Movement Investigation" / "Hegemony Patrol Pattern" /
"Syndicate Freighter Activity", a "Sulaco Arch" sector folder, art-cache
journal entries, connection records, threat entries, etc. Each batch
made the next one slower (entity panel rescans every JournalEntry on
each create), eventually pushing test bodies past their timeouts.

**Cause:** Quench tests created real Foundry documents but cleanup was
ad-hoc — some batches tracked and deleted, some didn't, several used
plain in-world names indistinguishable from real campaign content (so
even a name-pattern reaper couldn't safely sweep them).

**Fix:** Replaced `installAutoChatCleanup` with
`installAutoDocumentCleanup` in `src/integration/quench.js`. Snapshots
every world collection (actors, items, journal, scenes, macros,
playlists, tables, cards, folders, messages) plus every existing
JournalEntry's page IDs at batch start; reaps anything net-new at batch
end. Children-first, folders-last reap order; GM-only. Per-batch
explicit cleanup remains in place as the precise layer.

---

### AUDIO-001 — Narrator-card play button errored on every click ✓

**Resolved on:** branch `claude/debug-audio-errors-U5CJK`

**Symptom:** Console warning `starforged-companion | playback failed: Error: "error" is not a supported event of the Sound class` from `playback.js:225` (the `_fail` log) on every click of a narrator card's ▶ Play button. The button flipped to "Unavailable" before any audio request was made.

**Root cause:** `_playOneSound` in `src/audio/playback.js` attached three `Sound.addEventListener` listeners — `end`, `stop`, and `error`. Foundry v13's `foundry.audio.Sound#addEventListener` validates `event` against a fixed allow-list (`pause` / `start` / `stop` / `end` / `load`) and throws synchronously for anything else. The `error` registration threw inside `_playOneSound`, the throw bubbled to `_playFromCurrent`, was caught by `_fail`, and the session went straight to ERROR. `sound.play()` was never called.

**Why unit tests missed it:** the `FoundrySoundStub` in `tests/setup.js` accepted any event name without validation, so the no-op `error` listener registration never threw in tests.

**Fixes:**

- `src/audio/playback.js` — `_playOneSound` no longer attaches an `"error"` listener. Failures during load or decode already surface via `Sound.play()`'s promise rejection (wired into the `fail` branch of `.then(_, fail)`) and `Sound.load()`'s throw from `_createSound`.
- `tests/setup.js` — `FoundrySoundStub.addEventListener` now mirrors Foundry v13 and throws on unsupported event names. Two new unit tests in `tests/unit/audio.test.js` pin the contract: `_playOneSound` does not attach an `"error"` listener, and a `play()` rejection routes through the ERROR state without throwing synchronously.

---

### AUDIO-002 — 404 on every just-uploaded narrator MP3 on The Forge ✓

**Resolved on:** branch `claude/debug-audio-errors-U5CJK`

**Symptom:** Pattern visible on the Forge browser console — `File Uploaded to your Assets Library successfully` immediately followed by `Failed to load resource: the server responded with a status of 404 ()` on `https://assets.forge…<hash>.mp3`. Every ▶ Play click ran a fresh ElevenLabs synthesis even when the same prose had been played seconds earlier; nothing actually played back.

**Root cause:** `ForgeVTTFilePickerCore` intercepts `FilePicker.upload()` and stores the file in the user's Forge Assets Library (`https://assets.forge-vtt.com/...`) rather than on disk under `worlds/<id>/audio/...`. The upload response carries the absolute Forge URL in its `.path` field.

`src/audio/cache.js` was discarding the upload response and returning the constructed local path. On Forge, that local path does not exist server-side, so `foundry.audio.Sound(src).load()` 404s. The browse-based cache lookup matched correctly against the Forge listing (Forge returns the same files as absolute URLs in `browse().files`) but then returned the constructed `full` path again, so every cache hit also 404'd. Net effect: zero successful playback on Forge and zero cache reuse.

**Fixes:**

- `src/audio/cache.js` `write()` — captures the upload response and returns `response.path` when present, falling back to the constructed local path on native Foundry installs (where the upload return value is undefined or already matches `full`).
- `src/audio/cache.js` `lookup()` — returns the matched listing path verbatim from `browse().files` instead of returning the constructed local path. On native Foundry this is the local relative path; on Forge it's the absolute `assets.forge-vtt.com` URL — both load correctly via `foundry.audio.Sound`.
- Two new unit tests in `tests/unit/audio.test.js` pin both halves against a Forge-shaped upload/browse response.

---

### RECAP-003 — `!recap` and Chronicle auto-entry silently no-op'd from v1.2.4 → v1.2.10 ✓

**Resolved in:** v1.2.12 (branch `claude/fix-recap-command-cPT8F`)

**Symptom:** `!recap` (and `!recap campaign`) always rendered the empty-state
card — *"No campaign history available yet. Play some sessions first!"* —
even after dozens of narrated turns. The Chronicle journal stayed empty
even with `chronicleAutoEntry: true`. The v1.2.4 fix (cross-PC chronicle
aggregation) and v1.2.7 fix (automatic chronicle writes) both shipped
code that ran in unit tests but never actually fired in a live world.

**Root cause — two compounding defects:**

1. **Missing storage hop.** Both halves of the recap pipeline read
   `campaignState.characterIds` to identify the player character(s):
   - `src/character/chronicleWriter.js:228` — `resolveActorId()` returned
     `characterIds[0] ?? null`. Empty array → `null` → writer short-circuited
     before `addChronicleEntry` was ever called.
   - `src/narration/narrator.js:1173` — `_collectAllChronicleEntries()`
     returned `[]` for empty `characterIds`. Reader had nothing to summarise.

   `campaignState.characterIds` is declared in `src/schemas.js:634` with
   a default of `[]` and **was never written to by anything in the module**.
   The assembler computes a `characterIds` array in its return value
   (`src/context/assembler.js:740`) but only as part of the in-memory
   context packet — it never persists it onto `campaignState`. Existing
   unit tests passed because every fixture explicitly populated
   `characterIds`; no test exercised the real-world condition of an
   empty stored value.

2. **`hasPlayerOwner` is always false in solo-GM play.** Surfaced only
   after the first Forge Quench run of the Recap End-to-End batch failed
   three assertions in v1.2.11 (writer never wrote, reader never reached
   the API, posted card was the empty-state). `getPlayerActors()` in
   `src/character/actorBridge.js:23` filtered on `a.type === 'character'
   && a.hasPlayerOwner`. `Actor#hasPlayerOwner` returns `true` only when
   at least one **non-GM** User has LIMITED+ ownership. In Ironsworn
   solo play — the module's primary use case — the GM is also the
   player; there are no non-GM users; `hasPlayerOwner` is `false` on
   every character. `getPlayerActors()` silently returned `[]` for
   every solo-GM session — so the Defect 1 fallback also returned `[]`,
   and the assembler's CHARACTER STATE section (also gated on
   `getPlayerActors`, `src/context/assembler.js:717`) was empty on every
   paced narration too. Character name and meter values never reached
   the narrator prompt for solo GMs.

**Fixes:**

- `src/character/actorBridge.js` — `getPlayerActors()` falls back to all
  `character`-type Actors when no player-owned ones exist. Safe because
  foundry-ironsworn reserves the `character` type for PCs (NPCs / foes /
  connections / starships use distinct types). Multi-user behaviour
  unchanged: when any character is player-owned, the filter still wins.
- `src/character/chronicleWriter.js` — `resolveActorId()` falls back to
  `getPlayerActors()[0]?.id` when `characterIds` is empty.
- `src/narration/narrator.js` — new `_resolveCharacterIds()` helper falls
  back to `getPlayerActors().map(a => a.id)`. Used by
  `_collectAllChronicleEntries()` (recap reader) and `getActiveCharacter()`
  (paced-narration character context) so all three readers share one source.

**Coverage:**

- 6 new unit tests:
  - `tests/unit/actorBridge.test.js` — `getPlayerActors()` falls back to
    all character-type actors in solo-GM mode; never includes non-character
    types; prefers player-owned characters when any exist.
  - `tests/unit/chronicleWriter.test.js` — writer falls back to
    `getPlayerActors()[0]` when `characterIds` is empty; non-character /
    non-player-owned Actors are excluded.
  - `tests/unit/recap.test.js` — reader falls back through the API call
    with a stubbed fetch; seeded chronicle entries reach the user message.
- New Quench batch `starforged-companion.recapEndToEnd`
  (STARFORGED: Recap End-to-End) — three live tests against a real Actor +
  real Chronicle journal with `characterIds=[]` forced: writer fallback,
  reader fallback through `getCampaignRecap`, and `postCampaignRecap`
  posting a non-empty card. This live coverage exists specifically
  because the v1.2.4 and v1.2.7 fixes both passed unit tests but were
  silently disabled in production — the existing fixtures couldn't
  surface that, and Defect 2 above wasn't visible until the live Forge
  Quench run actually exercised the path.

---

### SECTOR-001 — Narrator invented new settlements for places already in the active sector ✓

**Resolved in:** v1.2.7 (branch `claude/fix-entity-panel-display-0kjF5`)

**Symptom:** During paced narration and scene queries, the narrator would
sometimes set a scene in a settlement name that had nothing to do with the
active sector — even when the active sector's hub was an obviously
established location. The detector would then post a draft entity card
proposing the invented name as a "new" Settlement, pushing the GM toward
forking the world.

**Root cause — two layers:**

1. **Prompt-side blindness.** The paced-narrative narrator
   (`narratePacedInput`, `src/narration/narrator.js:686`) and the scene-
   interrogation narrator (`interrogateScene`, ibid `:596`) did not call
   the assembler at all. The move-pipeline narrator's `## ACTIVE SECTOR`
   block — and the `## CURRENT LOCATION` card — only flowed through
   `narrateResolution`. Both other paths had zero sector or current-
   location context, so the model had no signal to keep the scene
   anchored to an established place.
2. **Detector cross-type gap.** `entityExistsForName(name, type, …)` in
   `src/entities/entityExtractor.js:470` only walks the ID list for the
   *one* type passed in. If the narrator wrote "Oxidized Kettle" and the
   detector classified it as a Location, an existing Settlement of the
   same name did not block the draft — the type-scoped check returned
   false, and the same physical place got proposed as a new entity under
   a different type.

**Fixes:**

- New helper `formatActiveSector(campaignState)` in
  `src/narration/narrator.js` builds a directive anchor block:
  *"Active sector: X / Region: Y / Trouble: Z / Established settlements
  in this sector: A, B, C. When the scene is set in a settlement, reuse
  one of the established names above. Do not invent a new settlement
  name for the same place."* This and `formatCurrentLocation(...)` are
  now threaded into all three narrator call sites
  (`narrateResolution`, `narratePacedInput`, `interrogateScene`) via a
  new `extras.activeSectorBlock` parameter on
  `buildNarratorSystemPrompt`.
- New `entityExistsAnyType(name, campaignState)` export in
  `entityExtractor.js` does a cross-type name match against every entity
  ID list. `routeEntityDrafts` now uses it as the primary dedup gate.
  The type-scoped `entityExistsForName` is preserved for the WJ routing
  rules in `routeWorldJournalResults` (faction / location WJ entries
  remain type-scoped on purpose — a WJ faction note about "Blue Star
  Compact" should not be blocked by an unrelated settlement entity that
  happens to share a name).

**Coverage:** 9 new unit tests across `tests/unit/entityExtractor.test.js`
and `tests/unit/narratorPrompt.test.js`. Pins the cross-type dedup at
the routing gate (Location, Connection, and Settlement variants), the
`## ACTIVE SECTOR` header presence/absence in the system prompt, and
the directive text the model receives.

---

### RECAP-002 — Campaign recap card "↻ Refresh" button did nothing ✓

**Resolved in:** v1.2.7 (branch `claude/fix-entity-panel-display-0kjF5`)

**Symptom:** Every campaign recap card the GM saw rendered a "↻ Refresh"
button — but clicking it did nothing. No console error, no toast, no API call.

**Root cause:** The button was added to the recap card HTML in
`src/narration/narrator.js:547` but no `Hooks.on("renderChatMessage")` was
ever registered to wire it. Same defect class as ENTITY-001 (the chat-card
hint that pointed at a non-existent panel flow); same fix pattern as the
existing `setupCard` "Set World Truths" handler at `src/index.js:1379`.

**Fix:** Added a second `renderChatMessage` hook in `src/index.js` that
matches `recapCard` + `recapType: "campaign"`, finds the `[data-action=
"refreshCampaignRecap"]` button, gates on `game.user.isGM`, disables the
button while in flight, and calls `postCampaignRecap(state, { forceRefresh:
true })` (the same regen path `!recap` uses). Errors surface as a warn
toast.

**Coverage:** New Quench batch `starforged-companion.chatCardActions`
includes a regression test that posts a recap card, clicks the Refresh
button, and asserts a fresh recap card lands in chat.

---

### ENTITY-001 — Entity panel always empty; draft cards had no Confirm UI ✓

**Resolved in:** v1.2.6 (branch `claude/fix-entity-panel-display-0kjF5`)

**Symptom:** Two compounding issues:
1. The Entities panel always showed "No entities tracked yet" even after entities
   had been created (manually, via `make_a_connection`, or via the sector creator).
2. The "New Entities Detected" chat card told the GM to "Open the Entities panel
   to confirm or dismiss" — but the panel had no UI to confirm a draft. Drafts
   could only be implicitly dismissed by deleting the chat card; ship/settlement/
   planet/location/creature drafts had no way to be promoted to entities at all.

**Root cause (panel):** `loadAllEntities()` and `findEntity()` in
`src/ui/entityPanel.js` read the entity flag via
`journal.getFlag(MODULE_ID, config.flag)` — i.e. the JournalEntry's own flags.
But all seven entity types (`connection.js`, `ship.js`, …, `creature.js`) store
their data on the embedded `JournalEntryPage` flag. The entry itself only carries
`{ entityType, entityId }` routing crumbs. Every iteration fell through the
`if (!data) continue;` guard and the panel rendered the empty state.

**Root cause (draft UX):** The card's hint text claimed the panel had a confirm
flow, but no such code existed. Only `make_a_connection` auto-created the first
connection draft; everything else lived on the chat card forever.

**Fixes:**
- `src/ui/entityPanel.js` — read entity data from `journal.pages.contents[0].getFlag(...)` in both `loadAllEntities()` and `findEntity()`. Added `updateJournalEntryPage` and `createJournalEntryPage` hooks so the panel re-renders when page flags change (entry-level hooks don't fire for embedded page edits).
- `src/entities/entityExtractor.js` — draft chat cards now render Confirm and Dismiss buttons per row. Confirm calls the appropriate `createXxx()` from the entity modules; Dismiss appends the name to `campaignState.dismissedEntities`. Card content updates in place to show resolved status.
- `collectPendingDraftNames()` — only "pending" drafts suppress re-detection; resolved drafts are now established (caught by `collectEstablishedEntityNames`) or dismissed (caught by `dismissedEntities`).
- `src/integration/quench.js` — `entityPanelActions` batch hardened to assert the seeded Connection actually renders a row instead of silently calling `this.skip()`. The skip-on-miss guards were what hid this bug for months.

**Why it wasn't caught:** the existing Quench batch (`registerEntityPanelActionsTests`) skipped every assertion when no row appeared. A code comment in `src/integration/quench.js` even acknowledged "the known journal-vs-page flag read quirk in loadAllEntities() (tracked as a latent issue in known-issues.md)" — but it was never actually tracked here. Bug present since `entityPanel.js` was first created (commit `102a9a3`).

---

### CONTROLS-001 — Toolbar buttons appeared but did nothing ✓

**Resolved in:** v0.1.34

**Root cause:** Three compounding issues:
1. `getSceneControlButtons` fires with `controls.tokens.tools` empty — Foundry
   populates tools AFTER the hook, so our additions were overwritten
2. `onChange` is never called for `button: true` tools in v13 — only toggle
   tools have working `onChange`
3. `onClick` is not a valid v13 `SceneControlTool` property

**Fix:** Two-hook pattern. `getSceneControlButtons` registers metadata only.
`renderSceneControls` attaches click handlers via DOM after render.

**Pattern now in:** `docs/foundry-reference/foundry-api-reference.md` (SceneControls section)
and `CLAUDE.md` (two-hook pattern section).

---

### CHAT-001 — `!recap` and `/x` commands rejected by Foundry ✓

**Resolved in:** v0.1.31

**Root cause:** Foundry v13 `MESSAGE_PATTERNS.invalid = /^(\/\S+)/` intercepts
all unrecognised `/word` commands before `createChatMessage` fires. `/recap`,
`/journal`, `/sector` were all blocked. `/x` was also blocked (matched invalid)
but appeared to work in some contexts.

**Fix:** Changed all module commands to `!` prefix. Foundry has no `!` pattern
in `MESSAGE_PATTERNS`. `/x` also changed to `!x` for consistency.

---

### SCENE-001 — `@scene` triggered move pipeline after scene card posted ✓

**Resolved in:** v0.1.31

**Root cause:** The scene card HTML (with `sceneResponse` flag) was passing
through `isPlayerNarration()` because no check excluded it. The card content
was long enough, not from GM, no `@` prefix — so it fell through to the
interpreter which returned `moveId: none`.

**Fix:** Added `sceneResponse`, `xcardCard`, and `recapCard` exclusions to
`isPlayerNarration()`.

---

### PROXY-001 — Compressed API responses returned binary garbage ✓

**Resolved in:** Post-session-3 hardening

**Root cause:** Proxy forwarded `accept-encoding` header. Anthropic returned
gzip/brotli compressed response. Proxy passed bytes through undecompressed.

**Fix:** Proxy strips `accept-encoding` and sets `accept-encoding: identity`
explicitly. In `proxy/claude-proxy.mjs`.

**Note:** the local proxy was later removed entirely (see CORS-001) —
`proxy/claude-proxy.mjs` no longer exists. This entry is retained for history.

---

### QUENCH-001 — Quench loaded but showed no tests ✓

**Resolved in:** v0.1.22

**Root cause:** Integration test file was at `tests/integration/quench.js`
but module.json `esmodules` pointed there. CI zip doesn't include `tests/`
directory. File absent from zip → Foundry metadata validation failure.

**Fix:** Moved to `src/integration/quench.js`. `src/` is included in the zip.

---

### QUENCH-002 — Dynamic imports in quench.js returned 404 ✓

**Resolved in:** v0.1.24

**Root cause:** `await import("./context/safety.js")` resolves from document
root (`http://localhost:30000/context/safety.js`) not from the file's location.

**Fix:** `const MODULE_PATH = "/modules/starforged-companion/src"` and all
dynamic imports use `` `${MODULE_PATH}/context/safety.js` ``.

---

### QUENCH-003 — Quench tests registered but not running ✓

**Resolved in:** v0.1.22

**Root cause:** Guard `if (!game.modules.get("quench")?.active) return` at
module load time — `quench` module not yet marked active when ES module executes.

**Fix:** Removed guard. `Hooks.on("quenchReady", ...)` only fires when Quench
is active — no guard needed.

---

### PACKS-001 — `packs/help.json: Not a directory` on module install ✓

**Resolved in:** v0.1.27

**Root cause:** Foundry v13 requires compendium packs to be LevelDB directories.
JSON files were valid in older versions. `packs/help.json` declared in
module.json caused IO error on install.

**Fix:** Removed `packs` array from module.json. Created `src/help/helpJournal.js`
which programmatically creates the help journal on first GM world load.
`packs/help.json` retained as source content but not declared as a compendium.

---

### CORS-001 — Electron renderer blocks external API calls ✓

**Resolved.** Multi-phase: initial post-session-3 hardening added a local Node
proxy; Phase 1 of the API-key-errors fix introduced direct browser fetch on
The Forge (Anthropic via the `anthropic-dangerous-direct-browser-access`
header, image generation via OpenRouter); Phase 2 removed the local proxy
entirely and unified desktop and Forge on direct browser fetch.

**Final transport:**
- Anthropic — direct browser fetch from `src/api-proxy.js` with
  `anthropic-dangerous-direct-browser-access: true`. Works on desktop and
  Forge identically.
- Image generation — direct browser fetch to OpenRouter
  (`openrouter.ai/api/v1/chat/completions`) via `src/art/openRouterImage.js`.
  Default model `black-forest-labs/flux.2-pro`, configurable via the
  `openRouterImageModel` setting.

No local proxy, no environment branching. See `docs/decisions.md` for the
rationale (including the previously rescinded `ForgeAPI.call("proxy", ...)`
claim) and reference precedent (`loremaster-foundry` uses the same
direct-fetch approach in production).

---

### SHIM-001 — `foundry-shim.js` 404 on module load ✓

**Resolved in:** Post-session-3 hardening

**Fix:** `foundry-shim.js` deleted. `scripts/remove-shim-imports.js` run to
remove import statements from all entity files.

---

### MISCHIEF-001 — Dial naming mismatch between settingsPanel and mischief.js ✓

**Resolved in:** Post-session-3 hardening

**Fix:** `normalizeDial()` added to `mischief.js` maps `"lawful"` → `"serious"`.

---

### V13-001 — Multiple Foundry v12 APIs in use ✓

**Resolved in:** Post-session-3 hardening

**Fixes applied:**
- `message.author` (was `message.user`)
- String literal chat message types (was `CONST.CHAT_MESSAGE_TYPES`)
- DOM API in PTT button (was jQuery)
- `getSceneControlButtons` hook handles both Array (v12) and Object (v13) forms
- `type: "other"` removed from `ChatMessage.create()` (not valid in v13)

---

### CI-001 — module.json not updated before zip build ✓

**Resolved in:** Post-session-3 hardening

**Fix:** CI release job reordered — `module.json` updated (version + URLs)
before zip is built. Both the zip contents and the loose manifest attachment
now have consistent version and manifest URLs.

---

### SHIP-INTEGRITY-API-UNWIRED — pre-built ship damage/repair API awaits #216 Phase D

**Status:** OPEN (deliberate) — narrowed to `sufferDamage` in the 2026-10
audit. `sufferDamage` (`src/entities/ship.js`) has no live caller — it is the
pre-built damage half of the API for Battle Stations Phase D (station play →
ship integrity/battered, issue #216), marked `// UNWIRED` in-code per
`rules/reachability.md`; its unit tests lock the semantics until Phase D wires
it (deadscan lists it TEST-ONLY). `repairIntegrity` and `clearBattered` are
**live** since 2026-10: `!repair`'s `applyRepairSpends` (`src/moves/repair.js`)
calls them, and both read battered through `isShipBattered` (native
`system.debility.battered` canonical — REPAIR-BATTERED-FLAG). Recorded
2026-07-07 (test-suite review).

### ASSEMBLER-001 — World truths section always empty in production ✓

**Resolved in:** Post-session-3 hardening

**Fix:** `buildWorldTruthsSection` changed to read `v.title ?? v.result`.
`TruthResult` shape uses `title`; old test fixtures use `result`. Both now
work correctly.

---

### ASSEMBLER-002 — Progress tracks section always empty ✓

**Resolved in:** Post-session-3 hardening; **flag-location follow-up:** v1.7.16

**Fix:** `buildProgressTracksSection` now loads the dedicated "Starforged
Progress Tracks" journal directly by name instead of scanning
`campaignState.progressTrackIds`.

**Follow-up (v1.7.16):** the original fix loaded the right journal but read
the tracks from `journal.pages.contents[0].flags` (page-level) while
`progressTracks.js` writes them with `journal.setFlag(...)` (document-level) —
so the section was *still* always empty in live play, including for an open
combat track. This surfaced as playtest finding #9 ("it claims there is a
combat progress, but I don't know where"): the narrator never saw the track
in context. `buildProgressTracksSection` now reads `journal.getFlag(MODULE_ID,
"tracks")` (document-level), matching the writer. The unit test previously
mocked the page-level shape, masking the bug; it now mocks `getFlag`.

---

### ASSEMBLER-003 — X-Card suppression never fired ✓

**Resolved in:** Post-session-3 hardening

**Fix:** Assembler now checks `campaignState?.xCardActive` in addition to
`isSceneSuppressed(sessionState)`. The `/x` chat command writes to
`campaignState.xCardActive`; `sessionState` was always null in the pipeline.

**2026-10:** this gate only ever suppressed the assembler's packet, which
narration stopped reading (FACTION-PACKET-DEAD) and #271 then deleted — so
move narration ran through an active X-Card until a gate was added to
`narrateResolution` itself (XCARD-MOVE-NARRATION, 2026-10 audit section).

---

### SAFETY-002 — Safety settings not reaching assembler ✓

**Resolved in:** Post-session-3 hardening

**Fix:** `syncSafetyToCampaignState()` added to `settingsPanel.js`. Runs
on every write to Lines/Veils/Private Lines and on the `ready` hook. Bridges
`game.settings` storage to `campaignState.safety` which the assembler reads.
