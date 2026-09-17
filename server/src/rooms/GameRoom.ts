import { Client, Room, ServerError } from '@colyseus/core';
import {
  MAX_PLAYERS_PER_ROOM,
  MessageType,
  SPAWN_POSITION,
  SPAWN_ROTATION_Y,
  handleFor,
  shopSecondsLeft,
  shopSlotAt,
  type BloxityAvatarMessage,
  type BloxityIdentityMessage,
  type ClaimWinMessage,
  type IndexMessage,
  type MoveMessage,
  type RespawnMessage,
  type RespawnReason,
  type SlotMessage,
  type WinAwardedMessage,
} from '@highjump/shared';
import { verifyBloxityToken } from '../bloxity/bloxityIdentity.js';
import { buxGrants } from '../bloxity/buxGrantsStore.js';
import { serverConfig } from '../config/serverConfig.js';
import { MovementService } from '../movement/MovementService.js';
import { BootService } from '../progression/BootService.js';
import { AURA_BINDING, CosmeticService, TRAIL_BINDING } from '../progression/CosmeticService.js';
import { EnergyService } from '../progression/EnergyService.js';
import { EquipmentService } from '../progression/EquipmentService.js';
import { leaderboardService } from '../progression/LeaderboardService.js';
import { profileStore } from '../progression/ProfileStore.js';
import { RebirthService } from '../progression/RebirthService.js';
import { wallet } from '../progression/Wallet.js';
import { WinService } from '../progression/WinService.js';
import { logger } from '../util/logger.js';
import { GameState } from './state/GameState.js';
import { PlayerState } from './state/PlayerState.js';

const SCOPE = 'GameRoom';

/** Seconds between autosaves of every connected player. */
const AUTOSAVE_SECONDS = 15;

/** The only shape a replicated Bloxity avatar code may take. */
const AVATAR_CODE = /^[A-Za-z0-9_,-]{0,320}$/;

/** Milliseconds between two shop/menu requests from one player. */
const REQUEST_COOLDOWN_MS = 150;

interface JoinOptions {
  playerId?: string;
  /** A Bloxity token, verified by the server with Bloxity. Never an id. */
  bloxityToken?: string;
}

/**
 * The authoritative room.
 *
 * Composition only: every rule lives in a service, and this decides the order
 * they run in. The one hard rule: nothing a client sends is ever copied into
 * state. A Move is simulated, a claim is validated, a purchase is checked, and
 * each produces a result the server writes itself.
 */
export class GameRoom extends Room<GameState> {
  override maxClients = MAX_PLAYERS_PER_ROOM;

  /**
   * An empty room CLOSES ITSELF. Written out even though it is the Colyseus
   * default, because it is a requirement of this game.
   */
  override autoDispose = true;

  private readonly movement = new MovementService();
  private readonly energy = new EnergyService();
  private readonly winService = new WinService();
  private readonly rebirths = new RebirthService();
  private readonly boots = new BootService();
  private readonly trails = new CosmeticService(TRAIL_BINDING);
  private readonly auras = new CosmeticService(AURA_BINDING);
  private readonly equipment = new EquipmentService();

  private readonly playerIds = new Map<string, string>();
  private readonly lastRequest = new Map<string, number>();
  private autosaveTimer = 0;

  /**
   * VERIFIED Bloxity account id per session, for Bux fulfilment. Only ever
   * written from a token Bloxity itself resolved, so a grant can only reach the
   * account that paid for it.
   */
  private readonly bloxityIds = new Map<string, string>();
  /** Latest identity check per session, so a stale verification cannot win a race. */
  private readonly identityChecks = new Map<string, number>();

  override onCreate(): void {
    this.setState(new GameState());
    this.setPatchRate(serverConfig.patchRateMs);
    this.updateShopClock();

    this.onMessage(MessageType.Move, (client, message: MoveMessage) => this.onMove(client, message));
    this.onMessage(MessageType.RequestRespawn, (client) => this.respawn(client, 'manual'));
    this.onMessage(MessageType.ClaimWin, (client, message: ClaimWinMessage) =>
      this.onClaimWin(client, message),
    );
    this.onMessage(MessageType.Rebirth, (client) =>
      this.request(client, (player) => {
        if (!this.rebirths.rebirth(player, this.energy)) return;
        this.placeAt(client, player, 'rebirth');
        logger.info(SCOPE, `${client.sessionId} rebirthed to ${player.rebirths}`);
      }),
    );
    this.onMessage(MessageType.BuyBoot, (client, message: SlotMessage) =>
      this.request(client, (player) => {
        if (this.boots.claim(player, Number(message?.slot), this.energy) === null) {
          logger.info(SCOPE, `${client.sessionId} bought boot ${message.slot}`);
        }
      }),
    );
    this.onMessage(MessageType.BuyTrail, (client, message: SlotMessage) =>
      this.request(client, (player) => this.trails.buy(player, Number(message?.slot), this.energy)),
    );
    this.onMessage(MessageType.EquipTrail, (client, message: SlotMessage) =>
      this.request(client, (player) => this.trails.equip(player, Number(message?.slot), this.energy)),
    );
    this.onMessage(MessageType.BuyAura, (client, message: SlotMessage) =>
      this.request(client, (player) => this.auras.buy(player, Number(message?.slot), this.energy)),
    );
    this.onMessage(MessageType.EquipAura, (client, message: SlotMessage) =>
      this.request(client, (player) => this.auras.equip(player, Number(message?.slot), this.energy)),
    );
    this.onMessage(MessageType.BuyItem, (client, message: IndexMessage) =>
      this.request(client, (player) =>
        this.equipment.buy(player, Number(message?.index), this.state.shopSlot, this.energy),
      ),
    );
    this.onMessage(MessageType.EquipBest, (client) =>
      this.request(client, (player) => this.equipment.equipBest(player, this.energy)),
    );
    this.onMessage(MessageType.ToggleItem, (client, message: IndexMessage) =>
      this.request(client, (player) => this.equipment.toggle(player, Number(message?.index), this.energy)),
    );
    this.onMessage(MessageType.DeleteItem, (client, message: IndexMessage) =>
      this.request(client, (player) => this.equipment.remove(player, Number(message?.index), this.energy)),
    );

    this.onMessage(MessageType.BloxityIdentity, (client, message: BloxityIdentityMessage) =>
      this.resolveIdentity(client.sessionId, typeof message?.token === 'string' ? message.token : ''),
    );
    this.onMessage(MessageType.BloxityAvatar, (client, message: BloxityAvatarMessage) =>
      this.setAvatar(client.sessionId, typeof message?.equipped === 'string' ? message.equipped : ''),
    );

    this.setSimulationInterval((deltaMs) => this.tick(deltaMs / 1000), serverConfig.patchRateMs);
    logger.info(SCOPE, `room ${this.roomId} created (capacity ${MAX_PLAYERS_PER_ROOM})`);
  }

  /** Capacity re-checked at the door, independent of the matchmaker's reservation. */
  override onAuth(): boolean {
    if (this.clients.length >= MAX_PLAYERS_PER_ROOM) {
      throw new ServerError(4103, 'room is full');
    }
    return true;
  }

  override onJoin(client: Client, options: JoinOptions = {}): void {
    const player = new PlayerState();
    player.sessionId = client.sessionId;

    const playerId = typeof options.playerId === 'string' ? options.playerId.slice(0, 64) : '';
    if (playerId) this.playerIds.set(client.sessionId, playerId);
    player.handle = handleFor(playerId || client.sessionId);

    // Restore BEFORE deriving: height, jump physics and rates follow from it.
    const restored = playerId ? profileStore.restore(playerId, player) : false;

    this.state.players.set(client.sessionId, player);
    this.movement.initialise(player);
    this.energy.initialise(player);
    this.placeAt(client, player, 'join');

    // In the background: a join must not wait on a round trip to Bloxity.
    if (typeof options.bloxityToken === 'string' && options.bloxityToken) {
      this.resolveIdentity(client.sessionId, options.bloxityToken);
    }

    logger.info(
      SCOPE,
      `join ${client.sessionId} (${restored ? 'restored' : 'new'}) level=${player.level} ` +
        `wins=${player.wins} rebirths=${player.rebirths} (${this.clients.length}/${MAX_PLAYERS_PER_ROOM})`,
    );
  }

  override onLeave(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    this.persist(client.sessionId, player);
    this.state.players.delete(client.sessionId);
    this.movement.forget(client.sessionId);
    this.energy.forget(client.sessionId);
    this.winService.forget(client.sessionId);
    this.playerIds.delete(client.sessionId);
    this.lastRequest.delete(client.sessionId);
    this.bloxityIds.delete(client.sessionId);
    this.identityChecks.delete(client.sessionId);
    logger.info(SCOPE, `leave ${client.sessionId} (${this.clients.length} left)`);
  }

  override onDispose(): void {
    for (const [sessionId, player] of this.state.players) this.persist(sessionId, player);
    logger.info(SCOPE, `room ${this.roomId} disposed (empty)`);
  }

  /** Simulate an input, then pay for the movement it actually produced. */
  private onMove(client: Client, message: MoveMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (!this.movement.applyInput(client.sessionId, player, message)) return;
    this.energy.credit(client.sessionId, player, this.movement.lastStep);
  }

  private onClaimWin(client: Client, message: ClaimWinMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const result = this.winService.claim(player, Number(message?.biome), Date.now());
    if (!result.granted) {
      if (result.reason !== 'cooldown') {
        logger.warn(
          SCOPE,
          `win claim ${message?.biome} refused for ${client.sessionId} (${result.reason}) at ` +
            `(${player.x.toFixed(1)}, ${player.y.toFixed(1)}, ${player.z.toFixed(1)})`,
        );
      }
      return;
    }

    const payload: WinAwardedMessage = {
      biome: Math.floor(Number(message.biome)),
      wins: result.wins,
      total: player.wins,
    };
    client.send(MessageType.WinAwarded, payload);
    // Banking a win ends the run. No checkpoints: straight back to spawn.
    this.placeAt(client, player, 'win');
    this.persist(client.sessionId, player);
    logger.info(SCOPE, `biome ${payload.biome} banked by ${client.sessionId} (+${result.wins})`);
  }

  /** Rate-limited wrapper for every menu and shop request. */
  private request(client: Client, action: (player: PlayerState) => unknown): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const now = Date.now();
    if (now - (this.lastRequest.get(client.sessionId) ?? 0) < REQUEST_COOLDOWN_MS) return;
    this.lastRequest.set(client.sessionId, now);
    action(player);
    this.persist(client.sessionId, player);
  }

  private tick(delta: number): void {
    this.updateShopClock();
    leaderboardService.update(delta, this.state.leaderboard, this.state.players, this.playerIds);

    for (const [sessionId, player] of this.state.players) {
      player.playSeconds += delta;
      if (!player.ready) continue;
      // Missing a jump never moves anyone - gaps have floors. This only rescues
      // a player a glitch has left outside the world entirely.
      if (this.movement.collision.isOutOfWorld(player.y)) {
        const client = this.clients.find((c) => c.sessionId === sessionId);
        if (client) this.respawn(client, 'outOfWorld');
      }
    }

    // Bux bought by someone already in the room. One boolean in the common case.
    if (buxGrants.hasPending) {
      for (const [sessionId, player] of this.state.players) this.applyGrants(sessionId, player);
    }

    this.autosaveTimer += delta;
    if (this.autosaveTimer >= AUTOSAVE_SECONDS) {
      this.autosaveTimer = 0;
      for (const [sessionId, player] of this.state.players) this.persist(sessionId, player);
    }
  }

  /**
   * Publish a player's Bloxity appearance to the room.
   *
   * Sanitised rather than trusted verbatim: it grants nothing, but it IS
   * replicated to everyone, so only an id-shaped string of a sane length is
   * ever stored. Anything else replicates as "no Bloxity look".
   */
  private setAvatar(sessionId: string, equipped: string): void {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    const code = AVATAR_CODE.test(equipped) ? equipped : '';
    if (player.avatar !== code) player.avatar = code;
  }

  /**
   * Resolve a Bloxity token to an account, then hand over anything it bought.
   *
   * An empty token is a logout. Every call supersedes the one before it, so a
   * slow verification of an old token can never overwrite a newer answer.
   */
  private resolveIdentity(sessionId: string, token: string): void {
    const check = (this.identityChecks.get(sessionId) ?? 0) + 1;
    this.identityChecks.set(sessionId, check);

    if (!token) {
      this.bloxityIds.delete(sessionId);
      const player = this.state.players.get(sessionId);
      if (player) player.displayName = '';
      return;
    }

    void verifyBloxityToken(token, serverConfig.bloxityApiBase).then((user) => {
      if (this.identityChecks.get(sessionId) !== check) return;
      const player = this.state.players.get(sessionId);
      if (!player) return;
      if (!user) {
        this.bloxityIds.delete(sessionId);
        player.displayName = '';
        return;
      }
      this.bloxityIds.set(sessionId, user.id);
      player.displayName = user.displayName || user.username;
      logger.info(SCOPE, `${sessionId} verified as Bloxity @${user.username}`);
      this.applyGrants(sessionId, player);
    });
  }

  /**
   * Hand over purchases waiting for this player's verified account. Through
   * `wallet.add` like every other award, and saved immediately.
   */
  private applyGrants(sessionId: string, player: PlayerState): void {
    const bloxityId = this.bloxityIds.get(sessionId);
    if (!bloxityId) return;
    const grants = buxGrants.drain(bloxityId);
    if (grants.length === 0) return;
    for (const grant of grants) {
      wallet.add(player, grant.wins);
      logger.info(SCOPE, `granted ${grant.sku} to ${sessionId} (+${grant.wins} wins) [${grant.transactionId}]`);
    }
    this.persist(sessionId, player);
  }

  private updateShopClock(): void {
    const now = Date.now();
    const slot = shopSlotAt(now);
    const remaining = shopSecondsLeft(now);
    if (this.state.shopSlot !== slot) this.state.shopSlot = slot;
    if (this.state.shopRemaining !== remaining) this.state.shopRemaining = remaining;
  }

  private respawn(client: Client, reason: RespawnReason): void {
    const player = this.state.players.get(client.sessionId);
    if (player) this.placeAt(client, player, reason);
  }

  /**
   * THE one way a player is placed, and there is exactly ONE destination: the
   * hub spawn. This takes no position for that reason - a placement that could
   * land elsewhere is a checkpoint system waiting to be reintroduced.
   */
  private placeAt(client: Client, player: PlayerState, reason: RespawnReason): void {
    const from = `(${player.x.toFixed(1)}, ${player.y.toFixed(1)}, ${player.z.toFixed(1)})`;
    this.movement.teleport(
      client.sessionId,
      player,
      SPAWN_POSITION.x,
      SPAWN_POSITION.y,
      SPAWN_POSITION.z,
      SPAWN_ROTATION_Y,
    );
    this.energy.reset(client.sessionId, player);

    const message: RespawnMessage = {
      x: SPAWN_POSITION.x,
      y: SPAWN_POSITION.y,
      z: SPAWN_POSITION.z,
      rotationY: SPAWN_ROTATION_Y,
      reason,
    };
    client.send(MessageType.Respawn, message);
    if (reason !== 'join') logger.info(SCOPE, `place ${client.sessionId} ${from} -> spawn (${reason})`);
  }

  private persist(sessionId: string, player: PlayerState | undefined): void {
    const playerId = this.playerIds.get(sessionId);
    if (player && playerId) profileStore.save(playerId, player);
  }
}
