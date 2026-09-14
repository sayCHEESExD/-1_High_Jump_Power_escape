import {
  AURA_TIERS,
  MessageType,
  TRAIL_TIERS,
  formatNumber,
  type RespawnMessage,
  type WinAwardedMessage,
} from '@highjump/shared';
import { Vector3 } from 'three';
import { AudioManager } from '../audio/AudioManager.js';
import { PlayerAudio } from '../audio/PlayerAudio.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { clientConfig } from '../config/clientConfig.js';
import { InputManager } from '../input/InputManager.js';
import { NetworkClient } from '../net/NetworkClient.js';
import type { ConnectionStatus, NetPlayerState } from '../net/netTypes.js';
import { LocalPlayer } from '../player/LocalPlayer.js';
import { playerModelLoader } from '../player/PlayerModelLoader.js';
import { RemotePlayerManager } from '../player/RemotePlayerManager.js';
import { RunController } from '../progression/RunController.js';
import { RendererManager } from '../rendering/RendererManager.js';
import { SceneManager } from '../rendering/SceneManager.js';
import { BackpackPanel } from '../ui/BackpackPanel.js';
import { CosmeticPanel } from '../ui/CosmeticPanel.js';
import { EnergyHud } from '../ui/EnergyHud.js';
import { EnergyPopups } from '../ui/EnergyPopups.js';
import { ICONS, injectHudStyles } from '../ui/hudStyles.js';
import { ItemShopPanel } from '../ui/ItemShopPanel.js';
import { KeyHints, WinBanner } from '../ui/Overlays.js';
import { Panel, anyPanelOpen } from '../ui/Panel.js';
import { RailButton } from '../ui/RailButton.js';
import { RebirthPanel } from '../ui/RebirthPanel.js';
import { WinFlight } from '../ui/WinFlight.js';
import { WinsCounter } from '../ui/WinsCounter.js';
import { logger } from '../util/logger.js';
import { CourseWorld } from '../world/CourseWorld.js';

const SCOPE = 'Game';

/** `code` first, `key` as the fallback for keystrokes that carry no code. */
const shortcutOf = (event: KeyboardEvent): string => {
  const code = event.code;
  if (code.startsWith('Key') && code.length === 4) return code.slice(3).toLowerCase();
  if (code) return code.toLowerCase();
  return (event.key || '').toLowerCase();
};

const isTyping = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
};

const FLIGHT_ORIGIN = new Vector3();

/**
 * Composition root. Owns every subsystem and the per-frame order - input,
 * prediction, triggers, respawn, camera, network, render - and holds no
 * gameplay rules of its own.
 */
export class Game {
  private readonly renderer: RendererManager;
  private readonly sceneManager = new SceneManager();
  private readonly camera = new ThirdPersonCamera();
  private readonly input = new InputManager();
  private readonly world = new CourseWorld();
  private readonly remotePlayers: RemotePlayerManager;
  private readonly audio = new AudioManager();
  private readonly playerAudio: PlayerAudio;
  private readonly network: NetworkClient;
  private readonly run: RunController;

  private readonly hud: EnergyHud;
  private readonly pops: EnergyPopups;
  private readonly wins: WinsCounter;
  private readonly winFlight: WinFlight;
  private readonly banner: WinBanner;
  private readonly keys: KeyHints;
  private readonly rail: HTMLDivElement;

  private readonly rebirthPanel: RebirthPanel;
  private readonly trailPanel: CosmeticPanel;
  private readonly auraPanel: CosmeticPanel;
  private readonly backpackPanel: BackpackPanel;
  private readonly shopPanel: ItemShopPanel;
  private readonly panels: Panel[];

  private readonly rebirthButton: RailButton;
  private readonly trailButton: RailButton;
  private readonly auraButton: RailButton;
  private readonly backpackButton: RailButton;
  private readonly audioButton: RailButton;

  private localPlayer: LocalPlayer | null = null;
  private localSessionId: string | null = null;
  private localState: NetPlayerState | null = null;
  private pendingRespawn: RespawnMessage | null = null;
  private lastLevel = -1;
  private lastRebirths = -1;
  private lastPurchases = '';
  /** The shop was closed by hand while standing at it; do not reopen until they leave. */
  private shopDismissed = false;

  constructor(container: HTMLElement) {
    injectHudStyles();
    this.renderer = new RendererManager(container);
    this.remotePlayers = new RemotePlayerManager(this.sceneManager.scene);
    this.playerAudio = new PlayerAudio(this.audio);

    this.hud = new EnergyHud(container);
    this.pops = new EnergyPopups(container);
    this.wins = new WinsCounter(container);
    this.winFlight = new WinFlight(container);
    this.banner = new WinBanner(container);
    this.keys = new KeyHints(container);

    this.network = new NetworkClient({
      onStatusChange: (status) => this.onStatusChange(status),
      onSelfJoined: (sessionId) => {
        this.localSessionId = sessionId;
      },
      onPlayerAdded: (sessionId, state) => this.onPlayerState(sessionId, state, true),
      onPlayerChanged: (sessionId, state) => this.onPlayerState(sessionId, state, false),
      onPlayerRemoved: (sessionId) => this.remotePlayers.remove(sessionId),
      onRespawn: (message) => {
        this.pendingRespawn = message;
        this.localPlayer?.acknowledgeRespawn();
        this.applyPendingRespawn();
      },
      onWinAwarded: (message) => this.onWinAwarded(message),
    });

    this.rebirthPanel = new RebirthPanel(container, () => this.network.requestRebirth());
    this.trailPanel = new CosmeticPanel(container, {
      variant: 'trail',
      title: 'Trail',
      icon: ICONS.trail,
      multiplierIcon: ICONS.energy,
      rows: TRAIL_TIERS,
      onBuy: (slot) => this.network.sendSlot(MessageType.BuyTrail, slot),
      onEquip: (slot) => this.network.sendSlot(MessageType.EquipTrail, slot),
    });
    this.auraPanel = new CosmeticPanel(container, {
      variant: 'aura',
      title: 'Aura',
      icon: ICONS.aura,
      multiplierIcon: ICONS.trophy,
      rows: AURA_TIERS,
      onBuy: (slot) => this.network.sendSlot(MessageType.BuyAura, slot),
      onEquip: (slot) => this.network.sendSlot(MessageType.EquipAura, slot),
    });
    this.backpackPanel = new BackpackPanel(container, {
      equipBest: () => this.network.equipBest(),
      toggle: (index) => this.network.sendIndex(MessageType.ToggleItem, index),
      remove: (index) => this.network.sendIndex(MessageType.DeleteItem, index),
    });
    this.shopPanel = new ItemShopPanel(container, (index) => {
      this.flushInput();
      this.network.sendIndex(MessageType.BuyItem, index);
    });
    this.shopPanel.onClose(() => {
      if (this.run.atShop) this.shopDismissed = true;
    });
    this.panels = [this.rebirthPanel, this.trailPanel, this.auraPanel, this.backpackPanel, this.shopPanel];

    this.rail = document.createElement('div');
    this.rail.className = 'hj-rail';
    container.appendChild(this.rail);
    const tile = (variant: string, label: string, icon: string, hotkey: string, onClick: () => void): RailButton =>
      new RailButton(this.rail, { variant, label, icon, hotkey, onClick });
    this.rebirthButton = tile('rebirth', 'Rebirth', ICONS.rebirth, 'R', () => this.openOnly(this.rebirthPanel));
    this.trailButton = tile('trail', 'Trail', ICONS.trail, 'T', () => this.openOnly(this.trailPanel));
    this.auraButton = tile('aura', 'Aura', ICONS.aura, 'Y', () => this.openOnly(this.auraPanel));
    this.backpackButton = tile('backpack', 'Backpack', ICONS.backpack, 'B', () => this.openOnly(this.backpackPanel));
    this.audioButton = tile('audio', 'Mute', ICONS.audio, 'M', () => {
      const muted = this.audio.toggleMuted();
      this.audioButton.root.classList.toggle('hj-tile--off', muted);
      if (!muted) this.audio.play('ui');
    });
    this.audioButton.root.classList.toggle('hj-tile--off', this.audio.isMuted);

    this.run = new RunController(this.world.collision, {
      claimWin: (biome) => {
        // The server validates against the last position it SIMULATED.
        this.flushInput();
        this.network.claimWin(biome);
      },
      buyBoot: (slot) => {
        this.flushInput();
        this.network.sendSlot(MessageType.BuyBoot, slot);
      },
      enterShop: () => {
        if (!this.shopDismissed && !anyPanelOpen()) {
          this.shopPanel.setOpen(true);
          this.audio.play('ui');
        }
      },
      leaveShop: () => {
        this.shopDismissed = false;
        this.shopPanel.setOpen(false);
      },
    });

    window.addEventListener('keydown', this.onHotkey);
    window.addEventListener('keydown', this.onGesture);
    window.addEventListener('mousedown', this.onGesture);
    window.addEventListener('touchstart', this.onGesture, { passive: true });
    this.renderer.onResize((width, height) => this.camera.setViewport(width, height));
  }

  async initialise(): Promise<void> {
    this.sceneManager.scene.add(this.world.root);
    await playerModelLoader.load();
    this.localPlayer = new LocalPlayer(this.world.collision);
    this.sceneManager.scene.add(this.localPlayer.character.root, this.localPlayer.character.worldRoot);
    this.camera.snapTo(this.localPlayer.position);
    logger.info(SCOPE, 'world ready');
  }

  async connect(): Promise<void> {
    await this.network.connect();
  }

  start(): void {
    this.input.attach(this.renderer.renderer.domElement);
  }

  update(delta: number): void {
    this.input.setSuppressed(anyPanelOpen());
    const input = this.input.sample();
    const player = this.localPlayer;
    this.camera.setOrbit(this.input.look.yaw, this.input.look.pitch);

    if (player) {
      player.update(delta, input, this.input.look.yaw);
      const kind = player.jumpKind;
      if (kind !== 'none') this.playerAudio.jumped(kind === 'air');
      this.run.update(delta, player);

      if (player.deathComplete) this.applyPendingRespawn();
      if (player.consumeRespawnNudge()) this.network.requestRespawn();

      const placement = player.consumePlacement();
      if (placement !== 'none') this.camera.snapTo(player.position, placement === 'respawn');
      this.camera.setTarget(player.position);
      this.sceneManager.followShadow(player.position.x, player.position.y, player.position.z);
      this.flushInput();
      this.playerAudio.update(delta, player);

      const state = this.localState;
      if (state) {
        this.hud.update(state.level, state.energy, state.rebirths, state.height, state.maxJumps, player.jumpsLeft);
        this.shopPanel.sync(
          this.network.shopSlot,
          this.network.shopRemaining,
          state.wins,
          state.equipment,
          state.shopBoughtSlot,
          state.shopBoughtMask,
          this.run.atShop,
        );
      }
    }

    this.shopPanel.tick(delta);
    this.world.scoreboard.update(this.network.leaderboard);
    this.pops.update(delta);
    this.remotePlayers.advance(delta);
    this.camera.update(delta, player?.horizontalSpeed ?? 0);
    const eye = this.camera.camera.position;
    this.world.update(delta, eye.x, eye.y, eye.z);
    this.renderer.renderer.render(this.sceneManager.scene, this.camera.camera);
  }

  private readonly onHotkey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || isTyping(event.target)) return;
    switch (shortcutOf(event)) {
      case 'r':
        this.rebirthButton.press();
        break;
      case 't':
        this.trailButton.press();
        break;
      case 'y':
        this.auraButton.press();
        break;
      case 'b':
        this.backpackButton.press();
        break;
      case 'm':
        this.audioButton.press();
        break;
      case 'escape':
        for (const panel of this.panels) panel.setOpen(false);
        this.input.look.setCursorFree(true);
        break;
      default:
        break;
    }
  };

  private readonly onGesture = (): void => {
    this.audio.resume();
  };

  private openOnly(panel: Panel): void {
    for (const other of this.panels) if (other !== panel) other.setOpen(false);
    panel.toggle();
    this.audio.play('ui');
  }

  private flushInput(): void {
    const player = this.localPlayer;
    if (!player) return;
    for (const message of player.drainOutgoing()) this.network.sendInput(message);
  }

  /** Held until the fall-over finishes, so nothing teleports mid-animation. */
  private applyPendingRespawn(): void {
    const player = this.localPlayer;
    const message = this.pendingRespawn;
    if (!player || !message) return;
    if (player.isDying && !player.deathComplete) return;
    this.pendingRespawn = null;
    player.teleport(message.x, message.y, message.z, message.rotationY);
  }

  private onPlayerState(sessionId: string, state: NetPlayerState, added: boolean): void {
    if (sessionId === this.localSessionId) {
      this.applyLocalState(state);
      return;
    }
    if (added) this.remotePlayers.add(sessionId, state);
    else this.remotePlayers.update(sessionId, state);
  }

  /** Everything the server says about us. Rendered, reconciled, never derived. */
  private applyLocalState(state: NetPlayerState): void {
    const player = this.localPlayer;
    if (!player) return;
    this.localState = state;

    player.setProgression(state.jumpVelocity, state.gravity, state.maxJumps, state.rebirths);
    player.character.setCosmetics(state.trailSlot, state.auraSlot);
    if (state.ready) {
      player.reconcile({
        x: state.x,
        y: state.y,
        z: state.z,
        rotationY: state.rotationY,
        velocityX: state.velocityX,
        velocityY: state.velocityY,
        velocityZ: state.velocityZ,
        grounded: state.grounded,
        jumpCount: state.jumpCount,
        flipCount: state.flipCount,
        jumpsUsed: state.jumpsUsed,
        lastInputSeq: state.lastInputSeq,
        jumpLatched: state.jumpLatched,
        coyote: state.coyote,
      });
    }

    this.pops.observe(state.lifetimeEnergy);
    this.wins.update(state.wins);
    this.run.setInventory(state.ownedBoots, state.wins);

    if (this.lastLevel >= 0 && state.level > this.lastLevel) this.audio.play('level');
    if (this.lastRebirths >= 0 && state.rebirths > this.lastRebirths) this.audio.play('rebirth');
    this.lastLevel = state.level;
    this.lastRebirths = state.rebirths;

    const purchases = `${state.ownedBoots}|${state.ownedTrails}|${state.ownedAuras}|${state.equipment.replace(/\*/g, '')}`;
    if (this.lastPurchases && purchases !== this.lastPurchases) this.audio.play('buy');
    this.lastPurchases = purchases;

    this.rebirthPanel.setProgress(state.level, state.rebirths);
    this.rebirthButton.setState(this.rebirthPanel.isEligible);
    this.trailPanel.setInventory(state.ownedTrails, state.trailSlot, state.wins);
    this.trailButton.setState(this.trailPanel.hasAffordable);
    this.auraPanel.setInventory(state.ownedAuras, state.auraSlot, state.wins);
    this.auraButton.setState(this.auraPanel.hasAffordable);
    this.backpackPanel.setInventory(state.equipment, state.ownedBoots);
    this.world.bootShop.setInventory(state.ownedBoots, state.wins);
    this.world.training.setRebirths(state.rebirths);
  }

  private onWinAwarded(message: WinAwardedMessage): void {
    this.wins.update(message.total);
    this.audio.play('win');
    this.banner.show(`+${formatNumber(message.wins)} WINS!`);

    const canvas = this.renderer.renderer.domElement;
    const box = canvas.getBoundingClientRect();
    let x = box.left + box.width / 2;
    let y = box.top + box.height / 2;
    const player = this.localPlayer;
    if (player) {
      FLIGHT_ORIGIN.copy(player.position);
      FLIGHT_ORIGIN.y += 2;
      FLIGHT_ORIGIN.project(this.camera.camera);
      if (FLIGHT_ORIGIN.z < 1) {
        x = box.left + ((FLIGHT_ORIGIN.x + 1) / 2) * box.width;
        y = box.top + ((1 - FLIGHT_ORIGIN.y) / 2) * box.height;
      }
    }
    this.winFlight.play(x, y);
  }

  private onStatusChange(status: ConnectionStatus): void {
    if (clientConfig.debug) logger.info(SCOPE, `connection: ${status}`);
  }

  dispose(): void {
    this.input.detach();
    void this.network.disconnect();
    window.removeEventListener('keydown', this.onHotkey);
    window.removeEventListener('keydown', this.onGesture);
    window.removeEventListener('mousedown', this.onGesture);
    window.removeEventListener('touchstart', this.onGesture);
    for (const panel of this.panels) panel.dispose();
    for (const button of [this.rebirthButton, this.trailButton, this.auraButton, this.backpackButton, this.audioButton]) {
      button.dispose();
    }
    this.hud.dispose();
    this.pops.dispose();
    this.wins.dispose();
    this.winFlight.dispose();
    this.banner.dispose();
    this.keys.dispose();
    this.rail.remove();
    this.audio.dispose();
    this.remotePlayers.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }
}
