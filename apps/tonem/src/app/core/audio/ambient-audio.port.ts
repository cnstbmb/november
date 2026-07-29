import { InjectionToken } from '@angular/core';
import { AmbientScene } from './ambient.model';

export interface AmbientAudioPort {
  applyScene(scene: AmbientScene, transitionSeconds: number): void;
  playNote(frequency: number, gain: number): void;
  setVolume(gain: number, transitionSeconds: number): void;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

export type AmbientAudioPortFactory = () => AmbientAudioPort | null;

export const AMBIENT_AUDIO_PORT_FACTORY = new InjectionToken<AmbientAudioPortFactory>(
  'AMBIENT_AUDIO_PORT_FACTORY',
  { providedIn: 'root', factory: () => createNativeAmbientAudioPort },
);

export function createNativeAmbientAudioPort(): AmbientAudioPort | null {
  const globalWindow = typeof window === 'undefined' ? null : window;
  if (!globalWindow) return null;
  const AudioContextCtor = (
    globalWindow as typeof window & { webkitAudioContext?: typeof AudioContext }
  ).AudioContext ?? (
    globalWindow as typeof window & { webkitAudioContext?: typeof AudioContext }
  ).webkitAudioContext;
  if (!AudioContextCtor) return null;
  return new NativeAmbientAudioPort(new AudioContextCtor());
}

class NativeAmbientAudioPort implements AmbientAudioPort {
  private readonly master: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly compressor: DynamicsCompressorNode;
  private readonly droneA: OscillatorNode;
  private readonly droneB: OscillatorNode;
  private readonly droneGainA: GainNode;
  private readonly droneGainB: GainNode;
  private closed = false;

  constructor(private readonly context: AudioContext) {
    this.master = context.createGain();
    this.master.gain.value = 0;
    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 600;
    this.filter.Q.value = 0.7;
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.02;
    this.compressor.release.value = 0.5;

    this.droneA = context.createOscillator();
    this.droneB = context.createOscillator();
    this.droneA.type = 'sine';
    this.droneB.type = 'triangle';
    this.droneGainA = context.createGain();
    this.droneGainB = context.createGain();
    this.droneGainA.gain.value = 0;
    this.droneGainB.gain.value = 0;

    this.droneA.connect(this.droneGainA).connect(this.filter);
    this.droneB.connect(this.droneGainB).connect(this.filter);
    this.filter.connect(this.compressor).connect(this.master).connect(context.destination);
    this.droneA.start();
    this.droneB.start();
  }

  applyScene(scene: AmbientScene, transitionSeconds: number): void {
    if (this.closed) return;
    const at = this.context.currentTime;
    ramp(this.droneA.frequency, scene.rootHz, at, transitionSeconds);
    ramp(this.droneB.frequency, scene.rootHz * scene.chordRatio, at, transitionSeconds);
    ramp(this.filter.frequency, scene.brightnessHz, at, transitionSeconds);
    ramp(this.droneGainA.gain, scene.droneGain, at, transitionSeconds);
    ramp(this.droneGainB.gain, scene.droneGain * 0.42, at, transitionSeconds);
  }

  playNote(frequency: number, gain: number): void {
    if (this.closed || this.context.state !== 'running') return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    const at = this.context.currentTime + 0.02;
    const duration = 4.5 + Math.random() * 4;
    oscillator.type = Math.random() > 0.55 ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(frequency, at);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), at + 1.2);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope).connect(this.filter);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.05);
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
      envelope.disconnect();
    }, { once: true });
  }

  setVolume(gain: number, transitionSeconds: number): void {
    if (this.closed) return;
    ramp(this.master.gain, gain, this.context.currentTime, transitionSeconds);
  }

  async resume(): Promise<void> {
    if (!this.closed && this.context.state !== 'running') await this.context.resume();
  }

  async suspend(): Promise<void> {
    if (!this.closed && this.context.state === 'running') await this.context.suspend();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.context.close();
  }
}

function ramp(param: AudioParam, value: number, at: number, duration: number): void {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(at);
  } else {
    const current = param.value;
    param.cancelScheduledValues(at);
    param.setValueAtTime(current, at);
  }
  param.linearRampToValueAtTime(safeValue, at + Math.max(0.01, duration));
}
