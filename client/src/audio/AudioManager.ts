import { logger } from '../util/logger.js';

const SCOPE = 'audio';

const SFX_GAIN = 0.34;
const MUSIC_GAIN = 0.32;

/** The supplied audio, served from the repo-level `assets/` (Vite publicDir). */
const AUDIO_URL = {
  background: '/audio/background.mp3',
  jump: '/audio/jump.mp3',
} as const;

const MAX_VOICES = 12;

export type SoundName = 'jump' | 'flip' | 'land' | 'step' | 'death' | 'win' | 'level' | 'rebirth' | 'buy' | 'ui' | 'deny';

/** Seconds a sound refuses to retrigger, so nothing can machine-gun. */
const COOLDOWNS: Readonly<Record<SoundName, number>> = {
  jump: 0.08,
  flip: 0.08,
  land: 0.12,
  step: 0.05,
  death: 0.6,
  win: 0.4,
  level: 0.3,
  rebirth: 0.8,
  buy: 0.2,
  ui: 0.05,
  deny: 0.25,
};

/**
 * Every sound in the game.
 *
 * The supplied files - the background track and the jump - are used as the
 * real audio; everything else is synthesised, because oscillators cost
 * hundreds of bytes against a 12 MB budget. The music is STREAMED through an
 * `<audio>` element (a decoded 2 MB mp3 would be tens of megabytes of samples)
 * and paused, not merely silenced, when muted.
 *
 * One-shots are bounded twice: a per-sound cooldown and a hard voice ceiling.
 * Nothing starts before a real user gesture.
 */
export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicElement: HTMLAudioElement | null = null;
  private jumpBuffer: AudioBuffer | null = null;
  private loadingSamples = false;
  private voices = 0;
  private readonly lastPlayed = new Map<SoundName, number>();
  private muted = false;
  private started = false;

  constructor() {
    try {
      this.muted = window.localStorage.getItem('highjumpescape.muted') === '1';
    } catch {
      this.muted = false;
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  resume(): void {
    if (!this.context) {
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.context = new Ctor();
      } catch (error) {
        logger.warn(SCOPE, `no audio context: ${String(error)}`);
        return;
      }
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.context.destination);
      this.sfxBus = this.context.createGain();
      this.sfxBus.gain.value = SFX_GAIN;
      this.sfxBus.connect(this.master);
      this.musicBus = this.context.createGain();
      this.musicBus.gain.value = MUSIC_GAIN;
      this.musicBus.connect(this.master);
    }

    void this.context.resume().catch(() => undefined);
    void this.loadSamples();
    if (!this.started) {
      this.started = true;
      this.startMusic();
    }
    if (this.musicElement && !this.muted) void this.musicElement.play().catch(() => undefined);
  }

  toggleMuted(): boolean {
    this.muted = !this.muted;
    try {
      window.localStorage.setItem('highjumpescape.muted', this.muted ? '1' : '0');
    } catch {
      /* per-viewer convenience only */
    }
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.context.currentTime, 0.05);
    }
    if (this.musicElement) {
      if (this.muted) this.musicElement.pause();
      else void this.musicElement.play().catch(() => undefined);
    }
    return this.muted;
  }

  play(name: SoundName, intensity = 1): void {
    const ctx = this.context;
    if (!ctx || !this.sfxBus || this.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < COOLDOWNS[name]) return;
    if (this.voices >= MAX_VOICES) return;
    this.lastPlayed.set(name, now);
    const level = Math.min(Math.max(intensity, 0), 1);

    switch (name) {
      case 'jump':
        if (!this.playBuffer(this.jumpBuffer, now, 0.9, 1)) this.blip(now, 'square', 320, 640, 0.16, 0.5);
        break;
      case 'flip':
        // The same file, pitched up: an air jump should sound like a jump, lighter.
        if (!this.playBuffer(this.jumpBuffer, now, 0.8, 1.35)) this.blip(now, 'triangle', 500, 1100, 0.18, 0.45);
        break;
      case 'land':
        this.thud(now, 0.3 + level * 0.3);
        break;
      case 'step':
        this.thud(now, 0.07 + level * 0.1, 130);
        break;
      case 'death':
        this.blip(now, 'sawtooth', 420, 60, 0.55, 0.55);
        break;
      case 'win':
        this.arpeggio(now, [0, 4, 7, 12, 16], 0.08, 'triangle', 0.5);
        break;
      case 'level':
        this.arpeggio(now, [0, 7, 12], 0.06, 'triangle', 0.35);
        break;
      case 'rebirth':
        this.arpeggio(now, [0, 4, 7, 12, 16, 19, 24], 0.07, 'sawtooth', 0.4);
        break;
      case 'buy':
        this.arpeggio(now, [0, 5, 9, 12], 0.05, 'square', 0.3);
        break;
      case 'ui':
        this.blip(now, 'sine', 660, 880, 0.06, 0.25);
        break;
      case 'deny':
        this.blip(now, 'square', 180, 120, 0.14, 0.3);
        break;
    }
  }

  dispose(): void {
    if (this.musicElement) {
      this.musicElement.pause();
      this.musicElement.removeAttribute('src');
      this.musicElement.load();
    }
    this.musicElement = null;
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }

  private startMusic(): void {
    const ctx = this.context;
    if (!ctx || !this.musicBus || this.musicElement) return;
    try {
      const element = new Audio();
      element.loop = true;
      element.preload = 'auto';
      element.src = AUDIO_URL.background;
      ctx.createMediaElementSource(element).connect(this.musicBus);
      this.musicElement = element;
      if (!this.muted) void element.play().catch(() => undefined);
    } catch (error) {
      logger.warn(SCOPE, `could not start background music: ${String(error)}`);
    }
  }

  private async loadSamples(): Promise<void> {
    const ctx = this.context;
    if (!ctx || this.loadingSamples) return;
    this.loadingSamples = true;
    try {
      const response = await fetch(AUDIO_URL.jump);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.jumpBuffer = await ctx.decodeAudioData(await response.arrayBuffer());
    } catch (error) {
      // The synthesised fallback covers it.
      logger.warn(SCOPE, `could not load ${AUDIO_URL.jump}: ${String(error)}`);
    }
  }

  private playBuffer(buffer: AudioBuffer | null, at: number, gain: number, rate: number): boolean {
    const ctx = this.context;
    if (!ctx || !this.sfxBus || !buffer) return false;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const envelope = ctx.createGain();
    envelope.gain.value = gain;
    source.connect(envelope);
    envelope.connect(this.sfxBus);
    this.voices += 1;
    source.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      source.disconnect();
      envelope.disconnect();
    };
    source.start(at);
    return true;
  }

  private blip(at: number, shape: OscillatorType, from: number, to: number, length: number, gain: number): void {
    const ctx = this.context;
    if (!ctx || !this.sfxBus) return;
    const osc = ctx.createOscillator();
    osc.type = shape;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + length);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(envelope);
    envelope.connect(this.sfxBus);
    this.hold(osc, envelope, at, length);
  }

  private thud(at: number, gain: number, frequency = 150): void {
    const ctx = this.context;
    if (!ctx || !this.sfxBus) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, at);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.45, at + 0.09);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    osc.connect(envelope);
    envelope.connect(this.sfxBus);
    this.hold(osc, envelope, at, 0.12);
  }

  private arpeggio(at: number, semitones: readonly number[], step: number, shape: OscillatorType, gain: number): void {
    const ctx = this.context;
    if (!ctx || !this.sfxBus) return;
    for (let i = 0; i < semitones.length; i += 1) {
      if (this.voices >= MAX_VOICES) return;
      const osc = ctx.createOscillator();
      osc.type = shape;
      osc.frequency.value = 440 * 2 ** ((semitones[i] ?? 0) / 12);
      const start = at + i * step;
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(gain, start + 0.01);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + step * 2.2);
      osc.connect(envelope);
      envelope.connect(this.sfxBus);
      this.hold(osc, envelope, start, step * 2.2);
    }
  }

  private hold(osc: OscillatorNode, envelope: GainNode, at: number, length: number): void {
    this.voices += 1;
    osc.start(at);
    osc.stop(at + length + 0.02);
    osc.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      osc.disconnect();
      envelope.disconnect();
    };
  }
}
