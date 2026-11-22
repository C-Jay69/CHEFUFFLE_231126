'use client';

type ChimeKind = 'success' | 'alert' | 'ticket' | 'blocked';

let context: AudioContext | null = null;
let muted = false;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!context) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

export function setMuted(value: boolean) {
  muted = value;
}
export function isMuted() {
  return muted;
}

function tone(ctx: AudioContext, frequency: number, start: number, duration: number, gain: number) {
  const oscillator = ctx.createOscillator();
  const amp = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(amp);
  amp.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

/**
 * Crisp 440Hz/880Hz two-tone chime required by the design system.
 * Synthesised with WebAudio so it works offline on a kitchen tablet.
 */
export function playChime(kind: ChimeKind = 'success') {
  if (muted) return;
  const ctx = audioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  if (kind === 'success') {
    tone(ctx, 880, now, 0.12, 0.05);
    tone(ctx, 1320, now + 0.13, 0.16, 0.04);
  } else if (kind === 'alert') {
    tone(ctx, 880, now, 0.14, 0.08);
    tone(ctx, 440, now + 0.16, 0.18, 0.08);
    tone(ctx, 880, now + 0.34, 0.14, 0.08);
  } else if (kind === 'ticket') {
    tone(ctx, 440, now, 0.1, 0.045);
    tone(ctx, 880, now + 0.1, 0.14, 0.045);
  } else {
    tone(ctx, 220, now, 0.18, 0.06);
  }
}
