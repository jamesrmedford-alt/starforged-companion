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
 * answered by tests/helpers/faults.js's default script; the dice are the
 * command's own, handed to the pipeline through the test file's `control`
 * (pipelineMocks.js).
 */

import { simulateTable, USERS, MODULE_ID } from "../multiClient.js";
import { withLiveDocuments } from "../liveDocuments.js";
import { scriptClaude } from "../faults.js";
import { progressDice } from "../scriptedDice.js";
import { resetControl } from "./pipelineMocks.js";
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

export class SequenceWorld {
  /**
   * A fresh world on `table`: the cast, an open session, and the vows and
   * connections of `fixture` as play would have left them.
   *
   * @param {Object} table
   * @param {Object} control  the test file's vi.hoisted dice control (pipelineMocks.js)
   * @param {{ vows?: Array<{ ref: string, pc: string, name: string, rank: string, ticks: number }>,
   *   connections?: Array<{ ref: string, name: string, rank: string, ticks: number, holder: string }> }} [fixture]
   */
  static async start(table, control, fixture = {}) {
    const world = new SequenceWorld(table, control);
    const seeded = fixture.connections ?? [];
    await table.reset({ world: { settings: {
      // Background passes a narration schedules 2 s later; a sequence asserts
      // on what its commands did, and ends long before they would run.
      chronicleAutoEntry: false, autoSeedConnection: false, narratorSessionSummary: false,
      campaignState: {
        ...CampaignStateSchema,
        sessionActive: true, currentSessionId: "sess-1", sessionNumber: 1, currentSceneId: "sc-1", sceneTruths: [],
        connectionIds: seeded.map(c => world.#hostIdFor(c.ref)),
      },
    } } });
    resetControl(control);
    await table.setClaudeKey(GM, "sk-ant-gina");
    scriptClaude(table);
    for (const { pc, name, player } of CAST) table.addActor({ id: pc, name, ownership: { [player]: 3 } });
    for (const v of fixture.vows ?? []) world.#seedVow(v);
    for (const c of seeded) world.#seedConnection(c);
    await world.quiet();
    return world;
  }

  constructor(table, control) {
    this.table = table;
    this.control = control;
    this.vowIds = new Map();        // ref → Item id
    this.connections = new Map();   // ref → { hostId, recordId }
    this.lastPress = null;          // { client, messageId, selector } — the last card button pressed
    this.bystanders = 0;
  }

  // ── plumbing ──────────────────────────────────────────────────────────────

  client(id) { return this.table.client(id); }
  actor(id) { return this.table.actors.get(id); }
  state() { return this.table.world.campaignState(); }

  /** Until nothing is in flight: every hook delivered, every handler settled. */
  async quiet() {
    await this.table.settle();
    await this.table.drain();
    await this.table.settle();
  }

  #hostIdFor(ref) { return `conn-${ref}`; }

  /** A vow as a sheet holds it once the module has seen it made: its own id as its vowId. */
  #seedVow({ ref, pc, name, rank, ticks }) {
    const id = `vow-${ref}`;
    this.table.addItem(pc, { id, name, type: "progress", system: { subtype: "vow", rank: sheetRank(rank), current: ticks, completed: false },
      flags: { [MODULE_ID]: { vowId: id, vowSetupOffered: true } } });
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
    this.control.dice = progressDice(challenge);
    await this.forcedMove(pc, "fulfill_your_vow", "Attempt to fulfill your vow.", { target: name, targetId: this.vowItem(ref).id });
  }

  /** 🔁 on the miss's offer: recommit to the vow. */
  async recommitVow(ref, { pc, challenge, doubled = false }) {
    const item = this.vowItem(ref);
    const offer = this.card(f => f.vowRecommitOfferCard && f.itemId === item.id && !f.recommitted && !f.offerRetired);
    if (!offer) throw new Error(`sequence: no open recommit offer for vow ${ref}`);
    this.control.recommitDice = [...challenge];
    await this.press(playerOf(pc), offer._id, '[data-action="sf-vow-recommit"]', { also: doubled ? GM : null });
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
    this.control.dice = progressDice(challenge);
    await this.#pickConnection(ref, pc, "forge", doubled);
  }

  async recommitConnection(ref, { pc, challenge, doubled = false }) {
    const hostId = this.hostId(ref);
    const offer = this.card(f => f.bondRecommitOfferCard && f.hostId === hostId && !f.recommitted && !f.offerRetired);
    if (!offer) throw new Error(`sequence: no open recommit offer for connection ${ref}`);
    this.control.recommitDice = [...challenge];
    await this.press(playerOf(pc), offer._id, '[data-action="sf-bond-recommit"]', { also: doubled ? GM : null });
  }

  /** The GM renames the NPC card in the sidebar. */
  async renameConnection(ref, { name }) {
    const actor = this.actor(this.hostId(ref));
    await this.client(GM).run(() => actor.update({ name }));
    await this.quiet();
  }

  // ── disturbances ──────────────────────────────────────────────────────────

  /** The last card button, pressed again by the same player. */
  async repeatLastPress() {
    const { client, messageId, selector } = this.lastPress;
    this.control.dice = [];
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
    for (const pc of PCS) {
      const actor = this.actor(pc);
      const items = actor?.items.contents ?? [];
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
      connections,
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
