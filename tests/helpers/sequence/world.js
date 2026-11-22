/**
 * STARFORGED COMPANION
 * tests/helpers/sequence/world.js — a simulated table a sequence plays on
 *
 * Issue #302 slice C. The other half of model.js: the same commands, done at
 * a booted multi-client table through the paths a table uses — a vow added on
 * a player's sheet, a move posted as the card buttons post it, a picker
 * button pressed by the roller's player, a draft confirmed by the GM, a card
 * renamed in the sidebar — and `observe()`, which reads the documents back
 * in the model's shape.
 *
 * The world keeps the model's refs against the documents it made for them
 * (a vow's Item id, a connection's Actor and record ids). Nothing here looks
 * a document up by name, so a name the sequence changed or reused cannot
 * mislead the observer: if the table marked the wrong vow, the right one's
 * ticks read unchanged and the wrong one's read changed, each under its own
 * ref.
 *
 * Cast: Gina (GM, canonical), Pat playing Kira, Quinn playing Ash. Claude is
 * answered by tests/helpers/faults.js's default script.
 *
 * No module is mocked. Booted-table tests usually mock three things on the
 * move pipeline — the confirmation dialog, the ability scan, the dice — and a
 * mocked module is one object for every simulated client, built in the
 * module graph of whichever client loaded it first. Reload that client's page
 * and the mock still reads its closed tab's state: the settings panel's mock
 * then refused every Private Lines sync as "this page lost its connection",
 * on a fresh GM page that had lost nothing. So here the real dialog is
 * accepted on the GM's page (`quiet`), the real ability scan finds no assets,
 * and the dice are answered at Math.random to the module's own rollDie
 * (tests/helpers/scriptedDice.js `installMoveDice`), under a fixed seed for
 * everything else that reads it.
 */

import { simulateTable, USERS, MODULE_ID } from "../multiClient.js";
import { parseHTML } from "../cardDom.js";
import { withLiveDocuments } from "../liveDocuments.js";
import { scriptClaude } from "../faults.js";
import { installMoveDice, installSeededRandom, progressDice } from "../scriptedDice.js";
import { rankOf, sheetRank, TRACK_TICKS } from "./rules.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

export const CAST = Object.freeze([
  Object.freeze({ pc: "pc-kira", name: "Kira", player: "pl-1" }),
  Object.freeze({ pc: "pc-ash",  name: "Ash",  player: "pl-2" }),
]);
export const PCS = CAST.map(c => c.pc);
const GM = "gm-1";
const playerOf = (pc) => CAST.find(c => c.pc === pc).player;

const flagsOf = (doc) => doc?.flags?.[MODULE_ID] ?? {};
const isVow  = (item) => item.type === "progress" && item.system?.subtype === "vow";
const isBond = (item) => item.type === "progress" && item.system?.subtype === "bond";
const refNumber = (ref) => Number(String(ref).replace(/^\D+/, "")) || Number.MAX_SAFE_INTEGER;
const byRef = (key) => (a, b) => refNumber(a[key]) - refNumber(b[key]);

/** Boot the table every sequence in a file plays on. */
export async function bootSequenceTable() {
  return withLiveDocuments(await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }));
}

/**
 * The table for the next sequence: this one, or a fresh one when the last
 * sequence failed part-way and left it unusable. A sequence that stops at a
 * failed comparison can leave a move waiting at its confirmation dialog;
 * `reset()` does not end a blocked handler, and every later `drain()` would
 * time out on it — so each sequence fast-check tries while it reduces the
 * failure would fail too, for that reason and not its own. The dialog is
 * closed (the move is not rolled); if something is still blocked after that,
 * the table is replaced.
 */
export async function usableTable(table) {
  try {
    await table.settle();
    for (const client of table.connectedClients) {
      const panel = await client.import("../../src/ui/settingsPanel.js");
      const dialog = panel.MoveConfirmDialog.pending;
      if (dialog) await client.run(() => dialog.close());
    }
    await table.drain(1000);
    return table;
  } catch {
    await table.teardown().catch(() => {});
    return bootSequenceTable();
  }
}

export class SequenceWorld {
  /**
   * A fresh world on `table`: the cast, an open session, and the vows and
   * connections of `fixture` as play would have left them.
   *
   * @param {Object} table
   * @param {{ vows?: Array<{ ref: string, pc: string, name: string, rank: string, ticks: number, swornTo?: string, swornToRef?: string }>,
   *   connections?: Array<{ ref: string, name: string, rank: string, ticks: number, holder: string }> }} [fixture]
   */
  static async start(table, fixture = {}) {
    SequenceWorld.#random?.restore();
    const world = new SequenceWorld(table);
    const seeded = fixture.connections ?? [];
    await table.reset({ world: { settings: {
      // Background passes a narration schedules 2 s later; a sequence asserts
      // on what its commands did, and ends long before they would run.
      chronicleAutoEntry: false, autoSeedConnection: false, narratorSessionSummary: false,
      campaignState: {
        ...CampaignStateSchema,
        // A session begun a moment ago. With no time of last play it reads as
        // idle, and the GM's next world load would start a new one, closed
        // until Begin a Session (src/session/lifecycle.js sessionNeedsMint).
        sessionActive: true, currentSessionId: "sess-1", sessionStartedId: "sess-1", sessionNumber: 1,
        sessionActiveStartedAt: new Date().toISOString(), lastSessionTimestamp: new Date().toISOString(),
        currentSceneId: "sc-1", sceneTruths: [],
        connectionIds: seeded.map(c => world.#hostIdFor(c.ref)),
      },
    } } });
    // The same reads for the same sequence: ids and oracle rolls from a fixed
    // seed, the module's dice from the command.
    const stream = installSeededRandom(302);
    const dice = installMoveDice(world.dice);
    SequenceWorld.#random = { restore() { dice.restore(); stream.restore(); } };
    await table.setClaudeKey(GM, "sk-ant-gina");
    scriptClaude(table);
    for (const { pc, name, player } of CAST) table.addActor({ id: pc, name, ownership: { [player]: 3 } });
    for (const v of fixture.vows ?? []) world.#seedVow(v, seeded);
    for (const c of seeded) world.#seedConnection(c);
    await world.quiet();
    return world;
  }

  static #random = null;   // the last world's Math.random, to put back

  /** Put Math.random back (the test file's afterAll). */
  static release() {
    SequenceWorld.#random?.restore();
    SequenceWorld.#random = null;
  }

  constructor(table) {
    this.table = table;
    this.dice = [];                 // Math.random reads for the module's next dice (installMoveDice)
    this.vowIds = new Map();        // ref → Item id
    this.connections = new Map();   // ref → { hostId, recordId }
    this.lastPress = null;          // { client, messageId, selector } — the last card button pressed
    this.bystanders = 0;
  }

  // ── plumbing ──────────────────────────────────────────────────────────────

  client(id) { return this.table.client(id); }
  actor(id) { return this.table.actors.get(id); }
  state() { return this.table.world.campaignState(); }

  /**
   * Until nothing is in flight: every hook delivered, every handler settled.
   * A move stops at its confirmation dialog on the GM's page; the GM accepts
   * it as it stands, and the move goes on.
   */
  async quiet() {
    for (let round = 0; round < 10; round++) {
      await this.table.settle();
      if (!(await this.#acceptConfirmation())) break;
    }
    await this.table.drain();
    await this.table.settle();
  }

  /** The GM presses "Accept — Roll" on the move confirmation dialog her page is showing, if it is. */
  async #acceptConfirmation() {
    const gm = this.client(GM);
    if (!gm.connected) return false;
    const panel = await gm.import("../../src/ui/settingsPanel.js");
    const dialog = panel.MoveConfirmDialog.pending;
    if (!dialog) return false;
    // Accept reads the dialog's ability checkboxes from its element. The
    // characters here hold no assets, so the form has none to read.
    dialog.element = parseHTML("");
    await gm.run(() => panel.MoveConfirmDialog.DEFAULT_OPTIONS.actions.accept.call(dialog));
    return true;
  }

  #hostIdFor(ref) { return `conn-${ref}`; }

  /**
   * A vow as a sheet holds it once the module has seen it made: its own id as
   * its vowId. `swornTo` is a connection's name, as a link made before v1.8.4
   * holds it — the name alone (`linkedConnectionName`), with no card id.
   * `swornToRef` is one of the fixture's connections, linked as the vow
   * card's 🤝 Link leaves it now: that connection's card id, and its name
   * beside it (`linkVow` presses the Link itself).
   */
  #seedVow({ ref, pc, name, rank, ticks, swornTo = null, swornToRef = null }, connections = []) {
    const id = `vow-${ref}`;
    const target = swornToRef ? connections.find(c => c.ref === swornToRef) : null;
    const link = target ? { linkedConnectionName: target.name, linkedConnectionId: this.#hostIdFor(target.ref) }
      : swornTo ? { linkedConnectionName: swornTo } : {};
    this.table.addItem(pc, { id, name, type: "progress", system: { subtype: "vow", rank: sheetRank(rank), current: ticks, completed: false },
      flags: { [MODULE_ID]: { vowId: id, vowSetupOffered: true, ...link } } });
    this.vowIds.set(ref, id);
  }

  #seedConnection({ ref, name, rank, ticks, holder }) {
    const hostId = this.#hostIdFor(ref);
    const recordId = `rec-${ref}`;
    this.table.addActor({ id: hostId, name, type: "character", flags: { [MODULE_ID]: { entityType: "connection", entityId: recordId, connection: {
      _id: recordId, name, rank, role: "Fixer", relationshipTicks: ticks, bonded: false, active: true, history: [],
    } } } });
    this.table.addItem(holder, { name, type: "progress", system: { subtype: "bond", rank, current: ticks },
      flags: { [MODULE_ID]: { connectionId: recordId } } });
    this.connections.set(ref, { hostId, recordId });
  }

  /**
   * Press a card button as `clientId`, and remember it for a repeat. With
   * `also`, that client presses the same button in the same moment — before
   * either press has reached the GM, so neither card has yet been disabled
   * by the other's. (A client whose card shows no such button presses
   * nothing.)
   */
  async press(clientId, messageId, selector, { also = null } = {}) {
    this.lastPress = { client: clientId, messageId, selector };
    this.client(clientId).click(messageId, selector);
    if (also && also !== clientId) {
      try { this.client(also).click(messageId, selector); } catch { /* not on that client's card */ }
    }
    await this.quiet();
  }

  /** The newest card whose module flags satisfy `pred`. */
  card(pred) { return this.table.cards(pred).at(-1) ?? null; }

  /** Post a move the way a card button posts it: forced, spoken as the roller's character, by their player. */
  async forcedMove(pc, moveId, text, { target = null, targetId = null } = {}) {
    await this.client(playerOf(pc)).chat(text, {
      speaker: { actor: pc, alias: CAST.find(c => c.pc === pc).name },
      flags: { [MODULE_ID]: {
        bypassPacing: true, forcedMoveId: moveId, deferWhileBusy: true,
        ...(target ? { forcedMoveTarget: target } : {}),
        ...(targetId ? { forcedMoveTargetId: targetId } : {}),
      } },
    });
    await this.quiet();
  }

  // ── vows ──────────────────────────────────────────────────────────────────

  vowItem(ref) {
    const id = this.vowIds.get(ref);
    for (const pc of PCS) {
      const item = this.actor(pc)?.items.get(id);
      if (item) return item;
    }
    throw new Error(`sequence: vow ${ref} (${id}) is on no sheet`);
  }

  /** A player adds a vow on their own sheet, as the system's "+ Vow" does (the rank as the sheet stores it, 1–5). */
  async addVow(ref, { pc, name, rank }) {
    const actor = this.actor(pc);
    const item = await this.client(playerOf(pc)).run(() => Item.create(
      { name, type: "progress", system: { subtype: "vow", rank: sheetRank(rank), current: 0, completed: false } }, { parent: actor }));
    this.vowIds.set(ref, item.id);
    await this.quiet();
  }

  /** Reach a Milestone, the target named — or not named, which marks the one open vow or asks which. */
  async reachMilestone(ref, { pc, name, byName, doubled = false }) {
    const item = this.vowItem(ref);
    await this.forcedMove(pc, "reach_a_milestone", "We make headway on the quest.", byName ? { target: name } : {});
    const picker = this.card(f => f.milestonePicker && !f.resolved);
    if (picker) await this.press(playerOf(pc), picker._id, `[data-action="sf-milestone-pick"][data-vow-id="${item.id}"]`, { also: doubled ? GM : null });
  }

  /** Fulfill Your Vow, as 🏁 posts it: the vow by its Item id. */
  async fulfilVow(ref, { pc, name, challenge }) {
    this.dice.push(...progressDice(challenge));
    await this.forcedMove(pc, "fulfill_your_vow", "Attempt to fulfill your vow.", { target: name, targetId: this.vowItem(ref).id });
  }

  /** 🔁 on the miss's offer: recommit to the vow. */
  async recommitVow(ref, { pc, challenge, doubled = false }) {
    const item = this.vowItem(ref);
    const offer = this.card(f => f.vowRecommitOfferCard && f.itemId === item.id && !f.recommitted && !f.offerRetired);
    if (!offer) throw new Error(`sequence: no open recommit offer for vow ${ref}`);
    this.dice.push(...progressDice(challenge));
    await this.press(playerOf(pc), offer._id, '[data-action="sf-vow-recommit"]', { also: doubled ? GM : null });
  }

  /** 🤝 Link on the vow's card: its player picks the connection in the card's list and presses Link. */
  async linkVow(ref, connectionRef, { pc }) {
    const item = this.vowItem(ref);
    const card = this.card(f => f.playerVowCard && f.vowId === item.id);
    if (!card) throw new Error(`sequence: vow ${ref} has no card to link from`);
    const player = playerOf(pc);
    this.client(player).render(card._id).querySelector(".sf-vow-connection").value = this.actor(this.hostId(connectionRef)).name;
    await this.press(player, card._id, '[data-action="sf-player-vow-link"]');
  }

  /** The vow's player fills its track on the sheet, to `ticks`. */
  async setVowTicks(ref, { pc, ticks }) {
    const item = this.vowItem(ref);
    await this.client(playerOf(pc)).run(() => item.update({ "system.current": ticks }));
    await this.quiet();
  }

  async renameVow(ref, { pc, name }) {
    const item = this.vowItem(ref);
    await this.client(playerOf(pc)).run(() => item.update({ name }));
    await this.quiet();
  }

  // ── connections ───────────────────────────────────────────────────────────

  hostId(ref) { return this.connections.get(ref).hostId; }

  /** A narration surfaced someone new; the GM confirms the draft as `pc`'s connection. */
  async addConnection(ref, { pc, name, doubled = false }) {
    const gm = this.client(GM);
    const before = new Set(this.state().connectionIds ?? []);
    const { routeEntityDrafts } = await gm.import("../../src/entities/entityExtractor.js");
    await gm.run(() => routeEntityDrafts(
      [{ type: "connection", name, description: "Someone worth knowing.", pronouns: "they/them", role: "fixer", goal: null, confidence: "high" }],
      game.settings.get(MODULE_ID, "campaignState"), { autoCreateConnection: false, actorId: pc }));
    await this.quiet();
    const card = this.card(f => f.draftEntityCard);
    await this.press(GM, card._id, '[data-action="sf-draft-confirm"]', { also: doubled ? playerOf(pc) : null });
    const made = (this.state().connectionIds ?? []).filter(id => !before.has(id));
    if (made.length !== 1) throw new Error(`sequence: confirming "${name}" listed ${made.length} new connections (${made.join(", ") || "none"})`);
    this.connections.set(ref, { hostId: made[0], recordId: flagsOf(this.actor(made[0])).connection?._id ?? null });
  }

  /** A move card's 🤝 follow-up, then the picker: the roller's player presses the connection they mean. */
  async #pickConnection(ref, pc, action, doubled) {
    const button = action === "forge" ? "sf-forge-bond" : "sf-develop-relationship";
    const card = await this.client(GM).run(() => ChatMessage.create({
      content: `<div class="sf-move-card"><button type="button" data-action="${button}">pick</button></div>`,
      flags: { [MODULE_ID]: { connectionSuggestion: { eligible: true }, actorId: pc } },
    }));
    await this.quiet();
    this.client(playerOf(pc)).click(card.id, `[data-action="${button}"]`);
    await this.quiet();
    const picker = this.card(f => f.connectionPicker && !f.resolved);
    if (!picker) throw new Error(`sequence: no connection picker for ${action}`);
    await this.press(playerOf(pc), picker._id, `[data-action="sf-connection-pick"][data-host-id="${this.hostId(ref)}"]`, { also: doubled ? GM : null });
  }

  async developRelationship(ref, { pc, doubled = false }) {
    await this.#pickConnection(ref, pc, "develop", doubled);
  }

  async forgeBond(ref, { pc, challenge, doubled = false }) {
    this.dice.push(...progressDice(challenge));
    await this.#pickConnection(ref, pc, "forge", doubled);
  }

  async recommitConnection(ref, { pc, challenge, doubled = false }) {
    const hostId = this.hostId(ref);
    const offer = this.card(f => f.bondRecommitOfferCard && f.hostId === hostId && !f.recommitted && !f.offerRetired);
    if (!offer) throw new Error(`sequence: no open recommit offer for connection ${ref}`);
    this.dice.push(...progressDice(challenge));
    await this.press(playerOf(pc), offer._id, '[data-action="sf-bond-recommit"]', { also: doubled ? GM : null });
  }

  /** The GM renames the NPC card in the sidebar. */
  async renameConnection(ref, { name }) {
    const actor = this.actor(this.hostId(ref));
    await this.client(GM).run(() => actor.update({ name }));
    await this.quiet();
  }

  // ── sessions ──────────────────────────────────────────────────────────────

  /** A session command typed by `by` — and by `also` in the same moment — each answering the dialog with `values`. */
  async #sessionCommand(command, values, by, also) {
    const typed = [by, also].filter(Boolean).map(id => {
      const client = this.client(id);
      client.answerDialogs(d => d.submit(values));
      return client.chat(command);
    });
    await Promise.all(typed);
    await this.quiet();
  }

  /** `!end-session`; the dialog submitted with a quest focus for next time, or with none. */
  async endSession({ by, also = null, focus }) {
    await this.#sessionCommand("!end-session", { 'input[name="questFocus"]': focus ? "See it through" : "", 'input[name="connectionFocus"]': "" }, by, also);
  }

  /** `!begin-session`; the dialog submitted with the vignette spotlighted, or not. */
  async beginSession({ by, also = null, vignette }) {
    await this.#sessionCommand("!begin-session", { 'input[name="vignette"]': vignette, 'input[name="galleyVignette"]': false }, by, also);
  }

  // ── disturbances ──────────────────────────────────────────────────────────

  /**
   * The user's page reloads: what the old page had in flight is cut off, and
   * a fresh page boots.
   *
   * The console is put back as it was. Booting, the module wraps
   * console.warn / console.error to mirror its messages to the Error Log
   * (src/logging/errorLog.js) — each page its own console, in a browser. The
   * simulated pages share one, so a reloaded page's wrapper lands on top of
   * the page before it and holds that page, with its whole module graph
   * (about 66 MB), until the test ends. A test that reloads three times does
   * not notice; a run of several hundred sequences ran out of memory.
   */
  async reload(clientId) {
    await this.quiet();
    const { warn, error } = console;
    await this.table.reload(clientId);
    console.warn = warn;
    console.error = error;
    await this.quiet();
  }

  /** The user's connection drops and comes back on the same page. */
  async dropAndRejoin(clientId) {
    await this.quiet();
    await this.table.leave(clientId);
    await this.table.join(clientId);
    await this.quiet();
  }

  /** The last card button, pressed again by the same player. */
  async repeatLastPress() {
    const { client, messageId, selector } = this.lastPress;
    try { this.client(client).click(messageId, selector); } catch { /* the button is gone from the card: nothing to press */ }
    await this.quiet();
  }

  /** The same actors in another order, `shift` places round — a world loaded with a different sort. */
  reorderActors(shift) {
    const actors = this.table.actors.contents;
    if (actors.length < 2) return;
    const by = shift % actors.length;
    const turned = [...actors.slice(by), ...actors.slice(0, by)];
    this.table.actors._reset();
    for (const actor of turned) this.table.actors._set(actor.id, actor);
  }

  // ── reading the table ─────────────────────────────────────────────────────

  /** What the table holds, in the shape of model.js `expected`. */
  observe() {
    const state = this.state();
    const vowRefs  = new Map([...this.vowIds].map(([ref, id]) => [id, ref]));
    const bondRefs = new Map([...this.connections].map(([ref, c]) => [c.recordId, ref]));
    const hostRefs = new Map([...this.connections].map(([ref, c]) => [c.hostId, ref]));
    const legacyTotal = (track) => (Number(track?.cycles) || 0) * TRACK_TICKS + (Number(track?.ticks) || 0);

    const pcs = {};
    const links = {};
    for (const pc of PCS) {
      const actor = this.actor(pc);
      const items = actor?.items.contents ?? [];
      // A vow's link: the card its id names, and the name the vow shows for it.
      for (const item of items.filter(isVow)) {
        const { linkedConnectionId: cardId = null, linkedConnectionName: shown = null } = flagsOf(item);
        if (!cardId && !shown) continue;
        links[vowRefs.get(item.id) ?? `unknown vow ${item.id}`] = {
          connection: cardId ? hostRefs.get(cardId) ?? `unknown card ${cardId}` : "by its name alone", name: shown,
        };
      }
      pcs[pc] = {
        momentum: actor?.system?.momentum?.value,
        legacyOnSheet: { quests: actor?.system?.legacies?.quests, bonds: actor?.system?.legacies?.bonds },
        vows: items.filter(isVow).map(item => ({
          ref: vowRefs.get(item.id) ?? `unknown vow ${item.id}`,
          name: item.name, rank: rankOf(item.system.rank), ticks: item.system.current ?? 0, fulfilled: item.system.completed === true,
        })).sort(byRef("ref")),
        bonds: items.filter(isBond).map(item => ({
          connection: bondRefs.get(flagsOf(item).connectionId) ?? `unknown connection ${flagsOf(item).connectionId}`,
          name: item.name, rank: rankOf(item.system.rank), ticks: item.system.current ?? 0, forged: item.system.completed === true,
        })).sort(byRef("connection")),
      };
    }

    const connections = this.table.actors.filter(a => flagsOf(a).entityType === "connection").map(actor => {
      const record = flagsOf(actor).connection ?? {};
      const ref = hostRefs.get(actor.id) ?? `unknown card ${actor.id}`;
      const name = record.name === actor.name ? record.name : `record "${record.name}" on card "${actor.name}"`;
      return { ref, name, rank: rankOf(record.rank), ticks: record.relationshipTicks ?? 0, bonded: record.bonded === true };
    }).sort(byRef("ref"));

    return {
      legacy: { quests: legacyTotal(state.legacyTracks?.quests), bonds: legacyTotal(state.legacyTracks?.bonds) },
      pcs,
      links,
      connections,
      sessionOpen: state.sessionActive === true,
      moveInFlight: !!state.pendingMove,
    };
  }

  /** What a healthy table has besides its documents: every NPC card listed, every client on the same state, nothing thrown. */
  health() {
    const state = this.state();
    const cards = this.table.actors.filter(a => flagsOf(a).entityType === "connection").map(a => a.id).sort();
    return {
      listedConnections: [...(state.connectionIds ?? [])].sort(),
      connectionCards: cards,
      clientsBehind: this.table.connectedClients
        .filter(c => JSON.stringify(c.getSetting("campaignState")) !== JSON.stringify(state)).map(c => c.id),
      errors: this.table.errors.map(e => `${e.label}: ${e.error?.message ?? e.error}`),
    };
  }
}
